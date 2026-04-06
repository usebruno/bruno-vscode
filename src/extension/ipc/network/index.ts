
import { AxiosResponse, AxiosError } from 'axios';
import { registerHandler, sendToWebview } from '../handlers';
import { prepareRequest, BrunoRequest as PrepareRequestType } from './prepare-request';
import { interpolateVars } from './interpolate-vars';
import { createAxiosInstance, AxiosInstanceOptions } from './axios-instance';
import { saveCancelToken, deleteCancelToken, cancelTokens } from '../../utils/cancel-token';
import { cookiesStore } from '../../store/cookies';
import { getCookieStringForUrl, saveCookies } from '../../utils/cookies';
import { createFormData, formatMultipartData } from '../../utils/form-data';
import { getPreferences } from '../../store/preferences';
import { getProcessEnvVars } from '../../store/process-env';
import { getCertsAndProxyConfig } from './cert-utils';
import { getEnvVars, getTreePathFromCollectionToItem, mergeVars, mergeHeaders, mergeScripts, mergeAuth, flattenItems, findItemInCollection, findItemInCollectionByPathname, Item } from '../../utils/collection';
import path from 'path';
import { registerOAuth2Handlers, applyOAuth2ToRequest } from './oauth2-handlers';
import { runPreRequestScript, runPostResponseVars, runPostResponseScript, runTests, runAssertions } from '../../utils/script-runner';
import { v4 as uuidv4 } from 'uuid';
import { cloneDeep, get, filter, forOwn } from 'lodash';
import { Readable } from 'stream';
import { registerWsEventHandlers } from './ws-event-handlers';
import { registerGrpcEventHandlers } from './grpc-event-handlers';
import { utils as brunoUtilsRaw } from '@usebruno/common';
import qs from 'qs';

// Type assertion for @usebruno/common utils (no type definitions available)
const brunoUtils = brunoUtilsRaw as {
  buildFormUrlEncodedPayload: (fields: Array<{ name: string; value: string; enabled?: boolean }>) => string;
  encodeUrl: (url: string) => string;
};

const getJsSandboxRuntime = (collection: Record<string, unknown>): string => {
  const securityConfig = get(collection, 'securityConfig', {}) as { jsSandboxMode?: string };

  if (securityConfig.jsSandboxMode === 'developer') {
    return 'nodevm';
  }

  // default runtime is `quickjs`
  return 'quickjs';
};

const promisifyStream = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    stream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    stream.on('error', (err) => {
      reject(err);
    });
  });
};

/**
 * Parse response data from buffer (like bruno-electron's parseDataFromResponse)
 * Returns data as parsed object and dataBuffer as BASE64 encoded string (required by webview)
 */
const parseDataFromResponse = (rawBuffer: Buffer, contentType: string): { data: unknown; dataBuffer: string } => {
  const charsetMatch = /charset=([^()<>@,;:"/[\]?.=\s]*)/i.exec(contentType || '');
  const charset = charsetMatch?.[1] || 'utf-8';

  // Decode buffer to string for parsing
  let dataString: string;
  try {
    dataString = rawBuffer.toString(charset as BufferEncoding);
  } catch {
    // Fallback to utf-8 if charset is not supported
    dataString = rawBuffer.toString('utf-8');
  }

  let parsedData: unknown = dataString;
  try {
    const cleanedData = dataString.replace(/^\uFEFF/, '');
    parsedData = JSON.parse(cleanedData);
  } catch {
    // Not JSON, keep as string
  }

  // IMPORTANT: dataBuffer must be BASE64 encoded for the webview
  // See bruno-electron: dataBuffer: response.dataBuffer.toString('base64')
  const dataBufferBase64 = rawBuffer.toString('base64');

  return { data: parsedData, dataBuffer: dataBufferBase64 };
};

interface BrunoRequest {
  uid?: string;
  url: string;
  method: string;
  headers?: Array<{ name: string; value: string; enabled?: boolean }> | Record<string, string>;
  params?: Array<{ name: string; value: string; enabled?: boolean }>;
  pathParams?: Array<{ name: string; value: string; enabled?: boolean }>;
  body?: {
    mode?: string;
    json?: string;
    text?: string;
    xml?: string;
    formUrlEncoded?: Array<{ name: string; value: string; enabled?: boolean }>;
    multipartForm?: Array<{ name: string; value: string; type?: string; enabled?: boolean; contentType?: string }>;
    graphql?: {
      query?: string;
      variables?: string;
    };
  };
  // data property is used by BrunoRequest class for getBody()
  // This should be set based on body mode for scripts/assertions to work
  data?: unknown;
  auth?: {
    mode?: string;
    basic?: { username?: string; password?: string };
    bearer?: { token?: string };
    digest?: { username?: string; password?: string };
    apikey?: { key?: string; value?: string; placement?: string };
    oauth2?: Record<string, unknown>;
    awsv4?: Record<string, unknown>;
  };
  script?: {
    req?: string;
    res?: string;
  };
  tests?: string;
  vars?: {
    req?: Array<{ name: string; value: string; enabled?: boolean }>;
    res?: Array<{ name: string; value: string; enabled?: boolean }>;
  };
  assertions?: Array<{ name: string; value: string; enabled?: boolean; uid?: string }>;
  timeout?: number;
  settings?: {
    followRedirects?: boolean;
    maxRedirects?: number;
    timeout?: number;
    encodeUrl?: boolean;
  };
  digestConfig?: {
    username?: string;
    password?: string;
  };
  // Additional properties needed by @usebruno/js ScriptRuntime
  name?: string;
  tags?: string[];
  collectionVariables?: Record<string, string>;
  folderVariables?: Record<string, string>;
  requestVariables?: Record<string, string>;
  globalEnvironmentVariables?: Record<string, unknown>;
  promptVariables?: Record<string, unknown>;
}

interface RequestContext {
  uid?: string;
  cancelTokenUid?: string;
  collectionUid: string;
  collectionPath: string;
  itemUid: string;
  itemPathname: string;
  envVars?: Record<string, string>;
  collectionVariables?: Record<string, string>;
  folderVariables?: Record<string, string>;
  requestVariables?: Record<string, string>;
  runtimeVariables?: Record<string, string>;
  processEnvVars?: Record<string, string>;
  globalEnvironmentVariables?: Record<string, string>;
}

interface RequestOptions {
  runnerContext?: {
    isRunningFolder?: boolean;
    delay?: number;
  };
  disableCookies?: boolean;
}

interface RequestResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
  dataBuffer?: string;
  rawBuffer?: Buffer;
  size: number;
  duration: number;
  timeline?: Array<{ timestamp: number; event: string }>;
  error?: string;
}

interface RunFolderContext {
  running: boolean;
  aborted: boolean;
}

const runningFolders = new Map<string, RunFolderContext>();

const executeRequest = async (
  request: BrunoRequest,
  context: RequestContext,
  options: RequestOptions = {}
): Promise<RequestResult> => {
  const startTime = Date.now();
  const timeline: Array<{ timestamp: number; event: string }> = [];

  const addTimelineEvent = (event: string) => {
    timeline.push({ timestamp: Date.now() - startTime, event });
  };

  addTimelineEvent('Request started');

  const cancelTokenUid = context.cancelTokenUid || uuidv4();
  const existingController = cancelTokens[cancelTokenUid];
  const abortController = existingController || new AbortController();
  if (!existingController) {
    saveCancelToken(cancelTokenUid, abortController);
  }

  try {
    addTimelineEvent('Interpolating variables');
    const interpolatedRequest = interpolateVars(request as unknown as Parameters<typeof interpolateVars>[0], {
      globalEnvironmentVariables: context.globalEnvironmentVariables,
      collectionVariables: context.collectionVariables,
      envVars: context.envVars,
      folderVariables: context.folderVariables,
      requestVariables: context.requestVariables,
      runtimeVariables: context.runtimeVariables,
      processEnvVars: context.processEnvVars
    }) as unknown as BrunoRequest;

    const headers = interpolatedRequest.headers;
    let contentType = '';
    if (headers) {
      if (Array.isArray(headers)) {
        const ctHeader = headers.find((h: { name?: string }) =>
          h.name && h.name.toLowerCase() === 'content-type'
        );
        if (ctHeader) {
          contentType = (ctHeader as { value?: string }).value || '';
        }
      } else {
        forOwn(headers as Record<string, unknown>, (value, key) => {
          if (key && key.toLowerCase() === 'content-type') {
            contentType = value as string;
          }
        });
      }
    }

    if (contentType === 'application/x-www-form-urlencoded') {
      if (Array.isArray(interpolatedRequest.data)) {
        interpolatedRequest.data = brunoUtils.buildFormUrlEncodedPayload(interpolatedRequest.data);
      } else if (interpolatedRequest.data && typeof interpolatedRequest.data === 'object' && !Array.isArray(interpolatedRequest.data)) {
        interpolatedRequest.data = qs.stringify(interpolatedRequest.data, { arrayFormat: 'repeat' });
      }
    }

    if (interpolatedRequest.settings?.encodeUrl) {
      interpolatedRequest.url = brunoUtils.encodeUrl(interpolatedRequest.url);
    }

    const protocolRegex = /^([-+\w]{1,25})(:?\/\/|:)/;
    const hasVariables = interpolatedRequest.url?.startsWith('{{');
    if (!hasVariables && interpolatedRequest.url && !protocolRegex.test(interpolatedRequest.url)) {
      interpolatedRequest.url = `http://${interpolatedRequest.url}`;
    }

    // Apply OAuth2 token to request (auto-fetch/refresh if needed)
    const authMode = (interpolatedRequest as any)?.auth?.mode;
    if (authMode === 'oauth2' || (interpolatedRequest as any)?.oauth2) {
      addTimelineEvent('Applying OAuth2 token');
      await applyOAuth2ToRequest(interpolatedRequest as unknown as Record<string, unknown>, context.collectionUid);
    }

    addTimelineEvent('Preparing request');
    const preparedRequest = prepareRequest(interpolatedRequest as unknown as PrepareRequestType);

    if (request.body?.mode === 'multipartForm' && request.body.multipartForm) {
      addTimelineEvent('Preparing multipart form data');
      const enabledFields = request.body.multipartForm.filter(f => f.enabled !== false);
      const multipartFields = enabledFields.map(f => ({
        name: f.name,
        type: f.type || 'text',
        value: f.value,
        contentType: f.contentType
      }));
      const formData = createFormData(multipartFields, context.collectionPath);
      preparedRequest.data = formData;
      const formHeaders = formData.getHeaders();
      preparedRequest.headers = { ...preparedRequest.headers, ...formHeaders };
      (preparedRequest as unknown as { _originalMultipartData?: unknown })._originalMultipartData = multipartFields;
      (preparedRequest as unknown as { collectionPath?: string }).collectionPath = context.collectionPath;
    }

    const preferences = getPreferences();

    const certsAndProxyConfig = await getCertsAndProxyConfig({
      collectionUid: context.collectionUid,
      collection: { promptVariables: request.promptVariables } as never,
      request: {
        url: request.url,
        collectionVariables: context.collectionVariables,
        folderVariables: context.folderVariables,
        requestVariables: context.requestVariables
      },
      envVars: context.envVars || {},
      runtimeVariables: context.runtimeVariables || {},
      processEnvVars: context.processEnvVars || {},
      collectionPath: context.collectionPath,
      globalEnvironmentVariables: context.globalEnvironmentVariables || {}
    });

    const { httpsAgentRequestFields, proxyMode: certProxyMode, proxyConfig: certProxyConfig } = certsAndProxyConfig;

    const followRedirects = request.settings?.followRedirects ?? true;
    let requestMaxRedirects = request.settings?.maxRedirects ?? (request as unknown as { maxRedirects?: number }).maxRedirects ?? 5;

    // If followRedirects is disabled, set maxRedirects to 0
    if (!followRedirects) {
      requestMaxRedirects = 0;
    }

    const axiosOptions: AxiosInstanceOptions = {
      timeout: request.timeout || request.settings?.timeout || preferences?.request?.timeout || 0,
      httpsAgentOptions: {
        ...httpsAgentRequestFields
      },
      proxyMode: certProxyMode,
      proxyConfig: certProxyMode === 'on' ? {
        protocol: certProxyConfig.protocol,
        hostname: certProxyConfig.hostname,
        port: certProxyConfig.port || undefined,
        auth: certProxyConfig.auth ? {
          username: certProxyConfig.auth.username,
          password: certProxyConfig.auth.password
        } : undefined
      } : undefined,
      requestMaxRedirects,
      digestConfig: request.digestConfig,
      collectionPath: context.collectionPath
    };

    // Note: We add cookies to BOTH preparedRequest (for axios) AND the original request
    // so that tests can see the cookies via req.getHeader('Cookie')
    const cookieString = getCookieStringForUrl(preparedRequest.url || '');
    if (cookieString) {
      const mergeCookies = (existing: string, newCookies: string): string => {
        const parseCookies = (str: string) => str.split(';').reduce((acc: Record<string, string>, cookie: string) => {
          const [name, ...rest] = cookie.split('=');
          if (name && name.trim()) {
            acc[name.trim()] = rest.join('=').trim();
          }
          return acc;
        }, {});
        const merged = { ...parseCookies(existing), ...parseCookies(newCookies) };
        return Object.entries(merged).map(([name, value]) => `${name}=${value}`).join('; ');
      };

      const existingCookieKey = Object.keys(preparedRequest.headers).find(
        (key) => key.toLowerCase() === 'cookie'
      );
      if (existingCookieKey) {
        preparedRequest.headers[existingCookieKey] = mergeCookies(preparedRequest.headers[existingCookieKey], cookieString);
      } else {
        preparedRequest.headers['Cookie'] = cookieString;
      }

      // The original request has headers as object (after interpolation)
      if (request.headers && typeof request.headers === 'object' && !Array.isArray(request.headers)) {
        const reqHeaders = request.headers as Record<string, string>;
        const reqExistingCookieKey = Object.keys(reqHeaders).find(
          (key) => key.toLowerCase() === 'cookie'
        );
        if (reqExistingCookieKey) {
          reqHeaders[reqExistingCookieKey] = mergeCookies(reqHeaders[reqExistingCookieKey], cookieString);
        } else {
          reqHeaders['Cookie'] = cookieString;
        }
      }
    }

    addTimelineEvent('Sending request');
    const axiosInstance = createAxiosInstance(axiosOptions);

    preparedRequest.signal = abortController.signal;

    let response: AxiosResponse;
    try {
      response = await axiosInstance.request(preparedRequest);
    } catch (error) {
      if ((error as Error).name === 'AbortError' || (error as Error).name === 'CanceledError') {
        addTimelineEvent('Request cancelled');
        throw new Error('Request cancelled');
      }
      throw error;
    }

    addTimelineEvent('Response received');

    const responseHeaders: Record<string, string> = {};
    Object.entries(response.headers).forEach(([key, value]) => {
      if (typeof value === 'string') {
        responseHeaders[key] = value;
      } else if (Array.isArray(value)) {
        responseHeaders[key] = value.join(', ');
      }
    });

    // Node's http module automatically decompresses gzip/deflate/brotli
    const rawBuffer = await promisifyStream(response.data as Readable);
    const responseSize = rawBuffer.length;

    const responseContentType = responseHeaders['content-type'] || '';
    const { data: parsedData, dataBuffer: dataString } = parseDataFromResponse(rawBuffer, responseContentType);

    // Note: Cookies are already saved to the shared cookieJar in the axios interceptor
    if (!options.disableCookies) {
      const setCookieHeaders = response.headers['set-cookie'];
      if (setCookieHeaders) {
        addTimelineEvent('Processing cookies');
        // Persist cookies to VS Code storage
        cookiesStore.saveCookieJar();
      }
    }

    addTimelineEvent('Request completed');

    const result: RequestResult = {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      data: parsedData,
      dataBuffer: dataString,
      rawBuffer: rawBuffer,
      size: responseSize,
      duration: Date.now() - startTime,
      timeline
    };

    return result;
  } catch (error) {
    const axiosError = error as AxiosError;
    const duration = Date.now() - startTime;

    addTimelineEvent('Request failed: ' + (error as Error).message);

    // If we have a response (4xx, 5xx), return it as a valid response
    // This matches bruno-electron behavior - error responses are shown as data, not as errors
    if (axiosError.response) {
      const responseHeaders: Record<string, string> = {};
      Object.entries(axiosError.response.headers).forEach(([key, value]) => {
        if (typeof value === 'string') {
          responseHeaders[key] = value;
        }
      });

      let errorData: unknown = null;
      let errorDataString = '';
      let errorRawBuffer: Buffer = Buffer.alloc(0);
      let errorSize = 0;
      if (axiosError.response.data) {
        try {
          errorRawBuffer = await promisifyStream(axiosError.response.data as Readable);
          errorSize = errorRawBuffer.length;
          const contentType = responseHeaders['content-type'] || '';
          const parsed = parseDataFromResponse(errorRawBuffer, contentType);
          errorData = parsed.data;
          errorDataString = parsed.dataBuffer;
        } catch {
          // Stream already consumed or not available
          errorData = null;
          errorDataString = '';
          errorRawBuffer = Buffer.alloc(0);
        }
      }

      // Don't include 'error' property - this is a valid HTTP response with data
      // The status code (e.g. 400, 500) indicates the error, but the response body should be shown
      return {
        status: axiosError.response.status,
        statusText: axiosError.response.statusText,
        headers: responseHeaders,
        data: errorData,
        dataBuffer: errorDataString,
        rawBuffer: errorRawBuffer,
        size: errorSize,
        duration,
        timeline
      };
    }

    // Network error or other failure
    const errorMessage = (error as Error).message || 'Error occurred while executing the request!';
    return {
      status: 0,
      statusText: errorMessage,
      headers: {},
      data: null,
      dataBuffer: '',
      rawBuffer: Buffer.alloc(0),
      size: 0,
      duration,
      timeline,
      error: errorMessage
    };
  } finally {
    if (!existingController) {
      deleteCancelToken(cancelTokenUid);
    }
  }
};

/**
 * Convert headers from array format to object format
 * This is needed because @usebruno/js BrunoRequest class expects headers as object
 * for getHeader(name) and setHeader(name, value) to work
 */
const headersArrayToObject = (headers: Array<{ name: string; value: string; enabled?: boolean }> | Record<string, string> | undefined): Record<string, string> => {
  if (!headers) {
    return {};
  }
  // If already an object, return it directly
  if (!Array.isArray(headers)) {
    return headers;
  }
  const result: Record<string, string> = {};
  headers.forEach((h) => {
    if (h.enabled !== false && h.name && h.name.length > 0) {
      result[h.name] = h.value;
    }
  });
  return result;
};

/**
 * Get request data based on body mode
 * This is needed for BrunoRequest.getBody() to work in scripts/assertions
 * Similar to bruno-cli's prepare-request.js
 */
const getRequestData = (body: BrunoRequest['body']): unknown => {
  if (!body || !body.mode) {
    return undefined;
  }

  switch (body.mode) {
    case 'json':
      return body.json || undefined;

    case 'text':
      return body.text || undefined;

    case 'xml':
      return body.xml || undefined;

    case 'formUrlEncoded': {
      const enabledParams = filter(body.formUrlEncoded || [], (p) => p.enabled !== false);
      return enabledParams;
    }

    case 'multipartForm': {
      const enabledParams = filter(body.multipartForm || [], (p) => p.enabled !== false);
      return enabledParams;
    }

    case 'graphql': {
      try {
        return {
          query: body.graphql?.query || '',
          variables: body.graphql?.variables ? JSON.parse(body.graphql.variables) : {}
        };
      } catch {
        return {
          query: body.graphql?.query || '',
          variables: {}
        };
      }
    }

    default:
      return undefined;
  }
};

const prepareItemRequest = (item: unknown, collection: unknown): BrunoRequest => {
  const _item = cloneDeep(item) as Record<string, unknown>;
  const _collection = collection as Record<string, unknown>;

  const request = (_item.draft ? (_item.draft as Record<string, unknown>).request : _item.request) as Record<string, unknown> || {};

  const requestTreePath = getTreePathFromCollectionToItem(_collection as never, _item as never);

  mergeHeaders(_collection as never, request as never, requestTreePath);
  mergeVars(_collection as never, request as never, requestTreePath);
  mergeScripts(_collection as never, request as never, requestTreePath, 'sandwich');
  mergeAuth(_collection as never, request as never, requestTreePath);

  const headers = (get(request, 'headers', []) || []) as Array<{ name: string; value: string; enabled?: boolean }>;
  const allParams = (get(request, 'params', []) || []) as Array<{ name: string; value: string; enabled?: boolean; type?: string }>;
  const params = allParams.filter((param) => param.type !== 'path');
  const pathParams = allParams.filter((param) => param.type === 'path');
  const body = request.body as BrunoRequest['body'];
  const auth = request.auth as BrunoRequest['auth'];
  const script = request.script as BrunoRequest['script'];
  const tests = request.tests as string;
  const vars = request.vars as BrunoRequest['vars'];
  const assertions = (get(request, 'assertions', []) || []) as BrunoRequest['assertions'];

  const contentTypeDefined = headers.some(h => h.enabled !== false && h.name?.toLowerCase() === 'content-type');

  // This is critical for interpolateVars to properly interpolate request.data
  if (!contentTypeDefined && body?.mode) {
    switch (body.mode) {
      case 'json':
        headers.push({ name: 'content-type', value: 'application/json', enabled: true });
        break;
      case 'text':
        headers.push({ name: 'content-type', value: 'text/plain', enabled: true });
        break;
      case 'xml':
        headers.push({ name: 'content-type', value: 'application/xml', enabled: true });
        break;
      case 'formUrlEncoded':
        headers.push({ name: 'content-type', value: 'application/x-www-form-urlencoded', enabled: true });
        break;
      case 'multipartForm':
        headers.push({ name: 'content-type', value: 'multipart/form-data', enabled: true });
        break;
      case 'graphql':
        headers.push({ name: 'content-type', value: 'application/json', enabled: true });
        break;
    }
  }

  const settings = (_item.draft ? (_item.draft as Record<string, unknown>).settings : _item.settings) as Record<string, unknown> || {};

  let digestConfig: { username?: string; password?: string } | undefined;
  if (auth?.mode === 'digest' && auth.digest) {
    digestConfig = {
      username: auth.digest.username,
      password: auth.digest.password
    };
  }

  // This is needed for BrunoRequest.getBody() to work in scripts/assertions
  const data = getRequestData(body);

  const name = (_item.draft ? (_item.draft as Record<string, unknown>).name : _item.name) as string || '';
  const tags = (_item.tags || []) as string[];

  const collectionVariables = (request.collectionVariables || {}) as Record<string, string>;
  const folderVariables = (request.folderVariables || {}) as Record<string, string>;
  const requestVariables = (request.requestVariables || {}) as Record<string, string>;

  const globalEnvironmentVariables = (_collection.globalEnvironmentVariables || {}) as Record<string, unknown>;

  return {
    uid: _item.uid as string,
    url: (request.url as string) || '',
    method: (request.method as string) || 'GET',
    headers,
    params,
    pathParams,
    body,
    data,
    auth,
    script,
    tests,
    vars,
    assertions,
    timeout: settings.timeout as number || 0,
    settings: {
      followRedirects: settings.followRedirects as boolean | undefined,
      maxRedirects: settings.maxRedirects as number | undefined,
      timeout: settings.timeout as number | undefined,
      encodeUrl: settings.encodeUrl as boolean | undefined
    },
    digestConfig,
    // Additional properties for scripts
    name,
    tags,
    collectionVariables,
    folderVariables,
    requestVariables,
    globalEnvironmentVariables
  };
};

const registerNetworkIpc = (): void => {
  // Main HTTP request handler - called by webview
  registerHandler('send-http-request', async (args) => {
    const [item, collection, environment, runtimeVariables] = args as [unknown, unknown, unknown, Record<string, string>];

    const _collection = collection as Record<string, unknown>;
    const _item = item as Record<string, unknown>;
    const collectionUid = _collection.uid as string;
    const collectionPath = _collection.pathname as string;
    const itemUid = _item.uid as string;
    // requestUid is generated by the webview and sent with the item
    const requestUid = (_item.requestUid as string) || itemUid;
    const cancelTokenUid = uuidv4();

    // Mutable copy of runtime variables for script execution
    const mutableRuntimeVariables: Record<string, unknown> = { ...(runtimeVariables || {}) };

    try {
      const envVars = getEnvVars(environment as never);

      const request = prepareItemRequest(item, collection);

      const processEnvVars = getProcessEnvVars(collectionUid) as Record<string, string>;

      // @usebruno/js BrunoRequest class expects headers as object for getHeader(name) to work
      const scriptRequest = {
        ...request,
        headers: headersArrayToObject(request.headers),
        collectionVariables: request.collectionVariables || {},
        folderVariables: request.folderVariables || {},
        requestVariables: request.requestVariables || {},
        globalEnvironmentVariables: request.globalEnvironmentVariables || {},
        name: request.name || '',
        tags: request.tags || []
      };

      const scriptContentType = scriptRequest.headers['Content-Type'] || scriptRequest.headers['content-type'] || '';
      const isFormUrlEncodedBefore = scriptContentType === 'application/x-www-form-urlencoded' ||
        (request.body as { mode?: string } | undefined)?.mode === 'formUrlEncoded';
      if (isFormUrlEncodedBefore && Array.isArray(scriptRequest.data)) {
        scriptRequest.data = brunoUtils.buildFormUrlEncodedPayload(scriptRequest.data);
      } else if (isFormUrlEncodedBefore && scriptRequest.data && typeof scriptRequest.data === 'object' && !Array.isArray(scriptRequest.data)) {
        scriptRequest.data = qs.stringify(scriptRequest.data, { arrayFormat: 'repeat' });
      }

      const context: RequestContext = {
        uid: uuidv4(),
        cancelTokenUid,
        collectionUid,
        collectionPath,
        itemUid,
        itemPathname: _item.pathname as string || '',
        envVars,
        collectionVariables: request.collectionVariables || {},
        folderVariables: request.folderVariables || {},
        requestVariables: request.requestVariables || {},
        runtimeVariables: mutableRuntimeVariables as Record<string, string>,
        processEnvVars,
        globalEnvironmentVariables: (request.globalEnvironmentVariables || {}) as Record<string, string>
      };

      // This runs the FULL script flow (pre-request, execute, post-response) like bruno-copy
      const runRequestByItemPathname = async (relativeItemPathname: string): Promise<unknown> => {
        let itemPathname = path.join(collectionPath, relativeItemPathname);
        if (!itemPathname.endsWith('.bru') && !itemPathname.endsWith('.yml')) {
          try {
            const { getCollectionFormat } = require('../../utils/filesystem');
            const fmt = getCollectionFormat(collectionPath);
            itemPathname = `${itemPathname}.${fmt === 'yml' ? 'yml' : 'bru'}`;
          } catch {
            itemPathname = `${itemPathname}.bru`;
          }
        }
        const foundItem = findItemInCollectionByPathname(_collection as never, itemPathname);
        if (!foundItem) {
          throw new Error(`bru.runRequest: invalid request path - ${itemPathname}`);
        }
        const innerItem = cloneDeep(foundItem);
        const innerRequest = prepareItemRequest(innerItem, collection);
        const innerScriptRequest = {
          ...innerRequest,
          headers: headersArrayToObject(innerRequest.headers),
          collectionVariables: innerRequest.collectionVariables || {},
          folderVariables: innerRequest.folderVariables || {},
          requestVariables: innerRequest.requestVariables || {},
          globalEnvironmentVariables: innerRequest.globalEnvironmentVariables || {},
          name: innerRequest.name || '',
          tags: innerRequest.tags || []
        };
        const innerScriptContentType = innerScriptRequest.headers['Content-Type'] || innerScriptRequest.headers['content-type'] || '';
        const innerIsFormUrlEncoded = innerScriptContentType === 'application/x-www-form-urlencoded' ||
          (innerRequest.body as { mode?: string } | undefined)?.mode === 'formUrlEncoded';
        if (innerIsFormUrlEncoded && Array.isArray(innerScriptRequest.data)) {
          innerScriptRequest.data = brunoUtils.buildFormUrlEncodedPayload(innerScriptRequest.data);
        } else if (innerIsFormUrlEncoded && innerScriptRequest.data && typeof innerScriptRequest.data === 'object' && !Array.isArray(innerScriptRequest.data)) {
          innerScriptRequest.data = qs.stringify(innerScriptRequest.data, { arrayFormat: 'repeat' });
        }
        const innerContext: RequestContext = {
          uid: uuidv4(),
          cancelTokenUid,
          collectionUid,
          collectionPath,
          itemUid: innerItem.uid,
          itemPathname,
          envVars,
          collectionVariables: innerScriptRequest.collectionVariables || {},
          folderVariables: innerScriptRequest.folderVariables || {},
          requestVariables: innerScriptRequest.requestVariables || {},
          runtimeVariables: mutableRuntimeVariables as Record<string, string>,
          processEnvVars,
          globalEnvironmentVariables: (innerScriptRequest.globalEnvironmentVariables || {}) as Record<string, string>
        };

        const innerScriptContext = {
          collectionUid,
          collectionPath,
          collectionName: _collection.name as string || '',
          itemUid: innerItem.uid,
          requestUid: uuidv4(),
          envVars: envVars as Record<string, unknown>,
          runtimeVariables: mutableRuntimeVariables, // Shared with parent
          processEnvVars,
          scriptingConfig: { ...(get(_collection, 'brunoConfig.scripts', {}) as Record<string, unknown>), runtime: getJsSandboxRuntime(_collection) } as { runtime?: string },
          runRequestByItemPathname // Allow nested runRequest calls
        };

        try {
          const preRequestResult = await runPreRequestScript(innerScriptRequest, innerScriptContext);
          if (preRequestResult.runtimeVariables) {
            Object.assign(mutableRuntimeVariables, preRequestResult.runtimeVariables);
          }
          if (preRequestResult.envVariables) {
            Object.assign(envVars, preRequestResult.envVariables);
          }
          if (preRequestResult.skipRequest) {
            return {
              status: 0,
              statusText: 'Skipped',
              headers: {},
              data: null,
              responseTime: 0
            };
          }
        } catch (preReqError) {
          console.error('Inner request pre-request script error:', preReqError);
        }

        const innerPostScriptContentType = innerScriptRequest.headers['Content-Type'] || innerScriptRequest.headers['content-type'] || '';
        const innerIsFormUrlEncodedAfter = innerPostScriptContentType === 'application/x-www-form-urlencoded' ||
          (innerRequest.body as { mode?: string } | undefined)?.mode === 'formUrlEncoded';
        if (innerIsFormUrlEncodedAfter && Array.isArray(innerScriptRequest.data)) {
          innerScriptRequest.data = brunoUtils.buildFormUrlEncodedPayload(innerScriptRequest.data);
        } else if (innerIsFormUrlEncodedAfter && innerScriptRequest.data && typeof innerScriptRequest.data === 'object' && !Array.isArray(innerScriptRequest.data)) {
          innerScriptRequest.data = Object.entries(innerScriptRequest.data as Record<string, unknown>)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value ?? ''))}`)
            .join('&');
        }

        const result = await executeRequest(innerScriptRequest as unknown as BrunoRequest, innerContext);

        const innerResponse = {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers,
          data: result.data,
          dataBuffer: result.rawBuffer,
          size: result.size,
          duration: result.duration,
          responseTime: result.duration
        };

        try {
          const varsResult = runPostResponseVars(innerScriptRequest, innerResponse, innerScriptContext);
          if (varsResult?.runtimeVariables) {
            Object.assign(mutableRuntimeVariables, varsResult.runtimeVariables);
          }
          if (varsResult?.envVariables) {
            Object.assign(envVars, varsResult.envVariables as Record<string, string>);
          }
        } catch (varsError) {
          console.error('Inner request post-response vars error:', varsError);
        }

        try {
          const postResponseResult = await runPostResponseScript(innerScriptRequest, innerResponse, innerScriptContext);
          if (postResponseResult.runtimeVariables) {
            Object.assign(mutableRuntimeVariables, postResponseResult.runtimeVariables);
          }
          if (postResponseResult.envVariables) {
            Object.assign(envVars, postResponseResult.envVariables as Record<string, string>);
          }
        } catch (postResError) {
          console.error('Inner request post-response script error:', postResError);
        }

        return {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers,
          data: result.data,
          responseTime: result.duration
        };
      };

      const scriptContext = {
        collectionUid,
        collectionPath,
        collectionName: _collection.name as string || '',
        itemUid,
        requestUid,
        envVars: envVars as Record<string, unknown>,
        runtimeVariables: mutableRuntimeVariables,
        processEnvVars,
        scriptingConfig: { ...(get(_collection, 'brunoConfig.scripts', {}) as Record<string, unknown>), runtime: getJsSandboxRuntime(_collection) } as { runtime?: string },
        runRequestByItemPathname
      };

      sendToWebview('main:run-request-event', {
        type: 'request-queued',
        requestUid,
        collectionUid,
        itemUid,
        cancelTokenUid
      });

      let skipRequest = false;
      try {
        const preRequestResult = await runPreRequestScript(scriptRequest, scriptContext);

        if (!preRequestResult.success) {
          // Pre-request script failed - send error but continue to show the error
          sendToWebview('main:run-request-event', {
            type: 'error',
            itemUid,
            requestUid,
            collectionUid,
            error: `Pre-request script error: ${preRequestResult.error}`
          });
        }

        skipRequest = preRequestResult.skipRequest || false;

        if (preRequestResult.runtimeVariables) {
          Object.assign(mutableRuntimeVariables, preRequestResult.runtimeVariables);
          scriptContext.runtimeVariables = mutableRuntimeVariables;
          context.runtimeVariables = mutableRuntimeVariables as Record<string, string>;
        }
      } catch (preReqError) {
        console.error('Pre-request script error:', preReqError);
      }

      if (skipRequest) {
        sendToWebview('main:run-request-event', {
          type: 'response-received',
          itemUid,
          requestUid,
          collectionUid,
          response: {
            status: 0,
            statusText: 'Skipped',
            headers: {},
            data: null,
            dataBuffer: '',
            size: 0,
            duration: 0
          },
          error: 'Request skipped by pre-request script'
        });
        return {
          status: 0,
          statusText: 'Skipped',
          headers: {},
          data: null,
          size: 0,
          duration: 0,
          error: 'Request skipped by pre-request script'
        };
      }

      // This handles cases where req.setBody() was called with an array in the script
      const postScriptContentType = scriptRequest.headers['Content-Type'] || scriptRequest.headers['content-type'] || '';
      const isFormUrlEncoded = postScriptContentType === 'application/x-www-form-urlencoded' ||
        (scriptRequest.body as { mode?: string } | undefined)?.mode === 'formUrlEncoded';
      if (isFormUrlEncoded && Array.isArray(scriptRequest.data)) {
        scriptRequest.data = brunoUtils.buildFormUrlEncodedPayload(scriptRequest.data);
      } else if (isFormUrlEncoded && scriptRequest.data && typeof scriptRequest.data === 'object' && !Array.isArray(scriptRequest.data)) {
        // This properly handles nested objects, arrays, and special characters
        scriptRequest.data = qs.stringify(scriptRequest.data, { arrayFormat: 'repeat' });
      }
      // if `data` is of string type - return as-is (assumes already encoded)

      sendToWebview('main:run-request-event', {
        type: 'request-sent',
        requestSent: {
          url: scriptRequest.url,
          method: scriptRequest.method,
          headers: scriptRequest.headers,
          timestamp: Date.now()
        },
        collectionUid,
        itemUid,
        requestUid,
        cancelTokenUid
      });

      // Use scriptRequest so pre-request script changes are respected
      // scriptRequest will be mutated by interpolateVars inside executeRequest
      const result = await executeRequest(scriptRequest as unknown as BrunoRequest, context);

      sendToWebview('main:run-request-event', {
        type: 'response-received',
        itemUid,
        requestUid,
        collectionUid,
        response: {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers,
          data: result.data,
          dataBuffer: result.dataBuffer,
          size: result.size,
          duration: result.duration,
          timeline: result.timeline
        },
        error: result.error
      });

      // If request failed with network error, skip post-processing
      if (result.error && result.status === 0) {
        return {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers,
          data: result.data,
          dataBuffer: result.dataBuffer,
          size: result.size,
          duration: result.duration,
          timeline: result.timeline,
          error: result.error
        };
      }

      // Include request property with URL parts for res.getUrl() to work
      let responseRequest: { protocol: string; host: string; path: string } | undefined;
      try {
        // Use scriptRequest.url since it's interpolated after executeRequest
        const responseUrl = scriptRequest.url;
        if (responseUrl) {
          const parsedUrl = new URL(responseUrl);
          responseRequest = {
            protocol: parsedUrl.protocol,
            host: parsedUrl.host,
            path: parsedUrl.pathname + parsedUrl.search
          };
        }
      } catch {
      }

      const response = {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
        data: result.data,
        dataBuffer: result.rawBuffer,
        size: result.size,
        duration: result.duration,
        responseTime: result.duration,
        request: responseRequest
      };

      try {
        const varsResult = runPostResponseVars(scriptRequest, response, scriptContext);
        if (varsResult?.runtimeVariables) {
          Object.assign(mutableRuntimeVariables, varsResult.runtimeVariables);
          scriptContext.runtimeVariables = mutableRuntimeVariables;
        }
      } catch (varsError) {
        console.error('Post-response vars error:', varsError);
      }

      try {
        const postResponseResult = await runPostResponseScript(scriptRequest, response, scriptContext);
        if (postResponseResult.runtimeVariables) {
          Object.assign(mutableRuntimeVariables, postResponseResult.runtimeVariables);
          scriptContext.runtimeVariables = mutableRuntimeVariables;
        }
      } catch (postResError) {
        console.error('Post-response script error:', postResError);
      }

      try {
        runAssertions(scriptRequest, response, scriptContext);
      } catch (assertError) {
        console.error('Assertions error:', assertError);
      }

      try {
        await runTests(scriptRequest, response, scriptContext);
      } catch (testError) {
        console.error('Tests error:', testError);
      }

      return {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
        data: result.data,
        dataBuffer: result.dataBuffer,
        size: result.size,
        duration: result.duration,
        timeline: result.timeline,
        error: result.error
      };
    } catch (error) {
      const err = error as Error;

      sendToWebview('main:run-request-event', {
        type: 'error',
        itemUid,
        collectionUid,
        error: err.message
      });

      // Return error response instead of throwing
      // Use actual error message for statusText to match bruno-copy's behavior
      const errorMessage = err.message || 'Error occurred while executing the request!';
      return {
        status: 0,
        statusText: errorMessage,
        headers: {},
        data: null,
        size: 0,
        duration: 0,
        error: errorMessage
      };
    }
  });

  // Cancel HTTP request handler
  registerHandler('cancel-http-request', async (args) => {
    const [cancelTokenUid] = args as [string];

    try {
      const abortController = cancelTokens[cancelTokenUid];
      if (abortController) {
        abortController.abort();
        deleteCancelToken(cancelTokenUid);
      }
      return { success: true };
    } catch (error) {
      console.error('Failed to cancel request:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  registerHandler('fetch-gql-schema', async (args) => {
    const [endpoint, environment, request, collection] = args as [string, unknown, unknown, unknown];

    const _collection = collection as Record<string, unknown>;
    const collectionUid = _collection.uid as string;
    const collectionPath = _collection.pathname as string;

    try {
      const envVars = getEnvVars(environment as never);

      const introspectionQuery = `
        query IntrospectionQuery {
          __schema {
            queryType { name }
            mutationType { name }
            subscriptionType { name }
            types {
              kind
              name
              description
              fields(includeDeprecated: true) {
                name
                description
                args {
                  name
                  description
                  type {
                    kind
                    name
                    ofType { kind name ofType { kind name ofType { kind name } } }
                  }
                  defaultValue
                }
                type {
                  kind
                  name
                  ofType { kind name ofType { kind name ofType { kind name } } }
                }
                isDeprecated
                deprecationReason
              }
              inputFields {
                name
                description
                type {
                  kind
                  name
                  ofType { kind name ofType { kind name ofType { kind name } } }
                }
                defaultValue
              }
              interfaces {
                kind
                name
                ofType { kind name }
              }
              enumValues(includeDeprecated: true) {
                name
                description
                isDeprecated
                deprecationReason
              }
              possibleTypes {
                kind
                name
              }
            }
            directives {
              name
              description
              locations
              args {
                name
                description
                type {
                  kind
                  name
                  ofType { kind name ofType { kind name } }
                }
                defaultValue
              }
            }
          }
        }
      `;

      const gqlRequest: BrunoRequest = {
        url: endpoint,
        method: 'POST',
        headers: get(request, 'headers', []),
        body: {
          mode: 'graphql',
          graphql: {
            query: introspectionQuery,
            variables: '{}'
          }
        }
      };

      const context: RequestContext = {
        collectionUid,
        collectionPath,
        itemUid: '',
        itemPathname: '',
        envVars,
        runtimeVariables: {},
        globalEnvironmentVariables: (get(_collection, 'globalEnvironmentVariables', {}) || {}) as Record<string, string>
      };

      const result = await executeRequest(gqlRequest, context);

      if (result.status >= 200 && result.status < 300 && result.data) {
        return {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers,
          data: result.data
        };
      }

      throw new Error(`GraphQL introspection failed: ${result.statusText}`);
    } catch (error) {
      console.error('GraphQL introspection failed:', error);
      throw error;
    }
  });

  // Execute HTTP request (legacy handler)
  registerHandler('renderer:run-request-send', async (args) => {
    const [request, context, options] = args as [BrunoRequest, RequestContext, RequestOptions];

    try {
      sendToWebview('main:run-request-event', {
        type: 'request-queued',
        itemUid: context.itemUid,
        collectionUid: context.collectionUid
      });

      sendToWebview('main:run-request-event', {
        type: 'request-sent',
        itemUid: context.itemUid,
        collectionUid: context.collectionUid
      });

      const result = await executeRequest(request, context, options);

      sendToWebview('main:run-request-event', {
        type: 'response-received',
        itemUid: context.itemUid,
        collectionUid: context.collectionUid,
        response: {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers,
          data: result.data,
          dataBuffer: result.dataBuffer,
          size: result.size,
          duration: result.duration,
          timeline: result.timeline
        },
        error: result.error
      });

      return result;
    } catch (error) {
      const err = error as Error;
      sendToWebview('main:run-request-event', {
        type: 'error',
        itemUid: context.itemUid,
        collectionUid: context.collectionUid,
        error: err.message
      });
      throw error;
    }
  });

  registerHandler('renderer:cancel-request', async (args) => {
    const [cancelTokenUid] = args as [string];

    try {
      const abortController = cancelTokens[cancelTokenUid];
      if (abortController) {
        abortController.abort();
        deleteCancelToken(cancelTokenUid);
      }
      return { success: true };
    } catch (error) {
      console.error('Failed to cancel request:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Run folder (sequential request execution)
  registerHandler('renderer:run-folder', async (args) => {
    const [folderUid, collectionUid, collectionPath, recursive, delay] = args as [string, string, string, boolean, number?];

    const folderKey = `${collectionUid}:${folderUid}`;

    if (runningFolders.has(folderKey)) {
      return { success: false, message: 'Folder is already running' };
    }

    const folderContext: RunFolderContext = { running: true, aborted: false };
    runningFolders.set(folderKey, folderContext);

    try {
      sendToWebview('main:run-folder-event', {
        type: 'folder-run-started',
        folderUid,
        collectionUid
      });

      // Note: The actual folder execution requires loading and iterating through
      // all requests in the folder. This is typically done by the caller (UI)
      // which sends individual request-send events.
      // For now, we just track the running state.

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  registerHandler('renderer:stop-folder', async (args) => {
    const [folderUid, collectionUid] = args as [string, string];

    const folderKey = `${collectionUid}:${folderUid}`;
    const folderContext = runningFolders.get(folderKey);

    if (folderContext) {
      folderContext.aborted = true;
      folderContext.running = false;
      runningFolders.delete(folderKey);

      // Cancel any pending requests for this folder
      // This would require tracking which requests belong to which folder

      sendToWebview('main:run-folder-event', {
        type: 'folder-run-stopped',
        folderUid,
        collectionUid
      });
    }

    return { success: true };
  });

  registerHandler('renderer:run-gql-introspection', async (args) => {
    const [url, context, headers] = args as [string, RequestContext, Array<{ name: string; value: string; enabled?: boolean }>?];

    try {
      const introspectionQuery = `
        query IntrospectionQuery {
          __schema {
            queryType { name }
            mutationType { name }
            subscriptionType { name }
            types {
              ...FullType
            }
            directives {
              name
              description
              locations
              args {
                ...InputValue
              }
            }
          }
        }

        fragment FullType on __Type {
          kind
          name
          description
          fields(includeDeprecated: true) {
            name
            description
            args {
              ...InputValue
            }
            type {
              ...TypeRef
            }
            isDeprecated
            deprecationReason
          }
          inputFields {
            ...InputValue
          }
          interfaces {
            ...TypeRef
          }
          enumValues(includeDeprecated: true) {
            name
            description
            isDeprecated
            deprecationReason
          }
          possibleTypes {
            ...TypeRef
          }
        }

        fragment InputValue on __InputValue {
          name
          description
          type {
            ...TypeRef
          }
          defaultValue
        }

        fragment TypeRef on __Type {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                    ofType {
                      kind
                      name
                      ofType {
                        kind
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const request: BrunoRequest = {
        url,
        method: 'POST',
        headers: headers || [],
        body: {
          mode: 'graphql',
          graphql: {
            query: introspectionQuery,
            variables: '{}'
          }
        }
      };

      const result = await executeRequest(request, context);

      if (result.status >= 200 && result.status < 300 && result.data) {
        return (result.data as { data?: unknown }).data || result.data;
      }

      throw new Error(`Introspection failed: ${result.statusText}`);
    } catch (error) {
      console.error('GraphQL introspection failed:', error);
      throw error;
    }
  });

  // OAuth2 handlers (fetch, refresh, clear, browser auth state)
  registerOAuth2Handlers();

  registerHandler('renderer:start-http-stream', async (args) => {
    const [request, context] = args as [BrunoRequest, RequestContext];

    // Note: Full streaming support requires special handling
    // For now, we'll execute as a regular request
    const result = await executeRequest(request, context);
    return result;
  });

  registerHandler('renderer:stop-http-stream', async (args) => {
    const [cancelTokenUid] = args as [string];

    const abortController = cancelTokens[cancelTokenUid];
    if (abortController) {
      abortController.abort();
      deleteCancelToken(cancelTokenUid);
    }
    return { success: true };
  });

  // Run collection folder - executes all requests in a folder sequentially
  // Based on bruno-electron's implementation
  registerHandler('renderer:run-collection-folder', async (args) => {
    const [folder, collection, environment, runtimeVariables, recursive, delay, tags, selectedRequestUids] = args as [
      Record<string, unknown> | null,
      Record<string, unknown>,
      Record<string, unknown> | null,
      Record<string, string>,
      boolean,
      number,
      { include?: string[]; exclude?: string[] } | null,
      string[] | undefined
    ];

    const collectionUid = collection.uid as string;
    const collectionPath = collection.pathname as string;
    const folderUid = folder ? folder.uid as string : null;
    const cancelTokenUid = uuidv4();

    const envVars = getEnvVars(environment as never);

    // Make a mutable copy of runtime variables for script execution
    const runnerRuntimeVariables: Record<string, unknown> = { ...(runtimeVariables || {}) };

    const abortController = new AbortController();
    saveCancelToken(cancelTokenUid, abortController);

    // The handler returns immediately with the cancelTokenUid
    // Progress is communicated via events
    const runCollection = async () => {
      sendToWebview('main:run-folder-event', {
        type: 'testrun-started',
        isRecursive: recursive,
        collectionUid,
        folderUid,
        cancelTokenUid
      });

      try {
      // Get folder requests - use folder if provided, otherwise use collection
      const sourceFolder = folder || collection;
      let folderRequests: Array<Record<string, unknown>> = [];

      if (recursive) {
        const allItems = flattenItems((sourceFolder.items || []) as Item[]) as unknown as Array<Record<string, unknown>>;
        folderRequests = filter(allItems, (item) => {
          const type = item.type as string;
          return type === 'http-request' || type === 'graphql-request';
        });
      } else {
        const items = (sourceFolder.items || []) as Array<Record<string, unknown>>;
        folderRequests = filter(items, (item) => !!item.request);
      }

      // Items with valid seq are placed at their specified positions
      const isSeqValid = (seq: unknown): seq is number =>
        typeof seq === 'number' && Number.isFinite(seq) && Number.isInteger(seq) && seq > 0;

      // First sort alphabetically by name
      const alphabeticallySorted = [...folderRequests].sort((a, b) => {
        const nameA = (a.name as string || '').toLowerCase();
        const nameB = (b.name as string || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });

      const withoutSeq = alphabeticallySorted.filter((f) => !isSeqValid(f.seq));
      const withSeq = alphabeticallySorted.filter((f) => isSeqValid(f.seq)).sort((a, b) => (a.seq as number) - (b.seq as number));

      // Insert items with seq at their specified positions
      const sortedItems: Array<Record<string, unknown>> = [...withoutSeq];
      withSeq.forEach((item) => {
        const position = (item.seq as number) - 1;
        if (position >= 0 && position <= sortedItems.length) {
          sortedItems.splice(position, 0, item);
        } else {
          sortedItems.push(item);
        }
      });
      folderRequests = sortedItems;

      if (tags && tags.include && tags.exclude) {
        const includeTags = tags.include || [];
        const excludeTags = tags.exclude || [];
        folderRequests = filter(folderRequests, (item) => {
          const requestTags = ((item.draft as Record<string, unknown>)?.tags || item.tags || []) as string[];
          // Include if: (no include filter OR has at least one include tag) AND (no exclude tags OR doesn't have any exclude tags)
          const includeMatch = includeTags.length === 0 || requestTags.some(t => includeTags.includes(t));
          const excludeMatch = excludeTags.length === 0 || !requestTags.some(t => excludeTags.includes(t));
          return includeMatch && excludeMatch;
        });
      }

      if (selectedRequestUids && selectedRequestUids.length > 0) {
        const uidIndexMap = new Map<string, number>();
        selectedRequestUids.forEach((uid, index) => {
          uidIndexMap.set(uid, index);
        });

        folderRequests = folderRequests
          .filter((request) => uidIndexMap.has(request.uid as string))
          .sort((a, b) => {
            const indexA = uidIndexMap.get(a.uid as string) || 0;
            const indexB = uidIndexMap.get(b.uid as string) || 0;
            return indexA - indexB;
          });
      }

      let currentRequestIndex = 0;
      while (currentRequestIndex < folderRequests.length) {
        if (abortController.signal.aborted) {
          const error = new Error('Runner execution cancelled');
          throw error;
        }

        const item = cloneDeep(folderRequests[currentRequestIndex]);
        const itemUid = item.uid as string;
        const eventData = {
          collectionUid,
          folderUid,
          itemUid
        };

        sendToWebview('main:run-folder-event', {
          type: 'request-queued',
          ...eventData
        });

        if (item.type === 'grpc-request') {
          sendToWebview('main:run-folder-event', {
            type: 'runner-request-skipped',
            error: 'gRPC requests are skipped in folder/collection runs',
            responseReceived: {
              status: 'skipped',
              statusText: 'gRPC request skipped',
              data: null,
              responseTime: 0,
              headers: null
            },
            ...eventData
          });
          currentRequestIndex++;
          continue;
        }

        try {
          const request = prepareItemRequest(item, collection);
          const requestUid = uuidv4();

          const scriptRequest = {
            ...request,
            headers: headersArrayToObject(request.headers),
            collectionVariables: request.collectionVariables || {},
            folderVariables: request.folderVariables || {},
            requestVariables: request.requestVariables || {},
            globalEnvironmentVariables: request.globalEnvironmentVariables || {},
            name: request.name || '',
            tags: request.tags || []
          };

          const runnerScriptContentType = scriptRequest.headers['Content-Type'] || scriptRequest.headers['content-type'] || '';
          const runnerIsFormUrlEncodedBefore = runnerScriptContentType === 'application/x-www-form-urlencoded' ||
            (request.body as { mode?: string } | undefined)?.mode === 'formUrlEncoded';
          if (runnerIsFormUrlEncodedBefore && Array.isArray(scriptRequest.data)) {
            scriptRequest.data = brunoUtils.buildFormUrlEncodedPayload(scriptRequest.data);
          }

          const runnerProcessEnvVars = getProcessEnvVars(collectionUid) as Record<string, string>;

          const runnerRunRequestByItemPathname = async (relativeItemPathname: string): Promise<unknown> => {
            let itemPathname = path.join(collectionPath, relativeItemPathname);
            if (!itemPathname.endsWith('.bru') && !itemPathname.endsWith('.yml')) {
              try {
                const { getCollectionFormat } = require('../../utils/filesystem');
                const fmt = getCollectionFormat(collectionPath);
                itemPathname = `${itemPathname}.${fmt === 'yml' ? 'yml' : 'bru'}`;
              } catch {
                itemPathname = `${itemPathname}.bru`;
              }
            }
            const foundItem = findItemInCollectionByPathname(collection as never, itemPathname);
            if (!foundItem) {
              throw new Error(`bru.runRequest: invalid request path - ${itemPathname}`);
            }
            const innerItem = cloneDeep(foundItem);
            const innerRequest = prepareItemRequest(innerItem, collection);
            const innerScriptRequest = {
              ...innerRequest,
              headers: headersArrayToObject(innerRequest.headers),
              collectionVariables: innerRequest.collectionVariables || {},
              folderVariables: innerRequest.folderVariables || {},
              requestVariables: innerRequest.requestVariables || {},
              globalEnvironmentVariables: innerRequest.globalEnvironmentVariables || {},
              name: innerRequest.name || '',
              tags: innerRequest.tags || []
            };
            const runnerInnerScriptContentType = innerScriptRequest.headers['Content-Type'] || innerScriptRequest.headers['content-type'] || '';
            const runnerInnerIsFormUrlEncoded = runnerInnerScriptContentType === 'application/x-www-form-urlencoded' ||
              (innerRequest.body as { mode?: string } | undefined)?.mode === 'formUrlEncoded';
            if (runnerInnerIsFormUrlEncoded && Array.isArray(innerScriptRequest.data)) {
              innerScriptRequest.data = brunoUtils.buildFormUrlEncodedPayload(innerScriptRequest.data);
            }
            const innerContext: RequestContext = {
              uid: uuidv4(),
              cancelTokenUid,
              collectionUid,
              collectionPath,
              itemUid: innerItem.uid,
              itemPathname,
              envVars,
              collectionVariables: innerScriptRequest.collectionVariables || {},
              folderVariables: innerScriptRequest.folderVariables || {},
              requestVariables: innerScriptRequest.requestVariables || {},
              runtimeVariables: runnerRuntimeVariables as Record<string, string>,
              processEnvVars: runnerProcessEnvVars,
              globalEnvironmentVariables: (innerScriptRequest.globalEnvironmentVariables || {}) as Record<string, string>
            };

            const innerScriptContext = {
              collectionUid,
              collectionPath,
              collectionName: collection.name as string || '',
              itemUid: innerItem.uid,
              requestUid: uuidv4(),
              envVars: envVars as Record<string, unknown>,
              runtimeVariables: runnerRuntimeVariables, // Shared with parent
              processEnvVars: runnerProcessEnvVars,
              scriptingConfig: { ...(get(collection, 'brunoConfig.scripts', {}) as Record<string, unknown>), runtime: getJsSandboxRuntime(collection as Record<string, unknown>) } as { runtime?: string },
              runRequestByItemPathname: runnerRunRequestByItemPathname // Allow nested runRequest calls
            };

            try {
              const preRequestResult = await runPreRequestScript(innerScriptRequest, innerScriptContext);
              if (preRequestResult.runtimeVariables) {
                Object.assign(runnerRuntimeVariables, preRequestResult.runtimeVariables);
              }
              if (preRequestResult.envVariables) {
                Object.assign(envVars, preRequestResult.envVariables as Record<string, string>);
              }
              if (preRequestResult.skipRequest) {
                return {
                  status: 0,
                  statusText: 'Skipped',
                  headers: {},
                  data: null,
                  responseTime: 0
                };
              }
            } catch (preReqError) {
              console.error('Inner request pre-request script error:', preReqError);
            }

            const runnerInnerPostScriptContentType = innerScriptRequest.headers['Content-Type'] || innerScriptRequest.headers['content-type'] || '';
            const runnerInnerIsFormUrlEncodedAfter = runnerInnerPostScriptContentType === 'application/x-www-form-urlencoded' ||
              (innerRequest.body as { mode?: string } | undefined)?.mode === 'formUrlEncoded';
            if (runnerInnerIsFormUrlEncodedAfter && Array.isArray(innerScriptRequest.data)) {
              innerScriptRequest.data = brunoUtils.buildFormUrlEncodedPayload(innerScriptRequest.data);
            } else if (runnerInnerIsFormUrlEncodedAfter && innerScriptRequest.data && typeof innerScriptRequest.data === 'object' && !Array.isArray(innerScriptRequest.data)) {
              innerScriptRequest.data = Object.entries(innerScriptRequest.data as Record<string, unknown>)
                .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value ?? ''))}`)
                .join('&');
            }

            const result = await executeRequest(innerScriptRequest as unknown as BrunoRequest, innerContext);

            const innerResponse = {
              status: result.status,
              statusText: result.statusText,
              headers: result.headers,
              data: result.data,
              dataBuffer: result.rawBuffer,
              size: result.size,
              duration: result.duration,
              responseTime: result.duration
            };

            try {
              const varsResult = runPostResponseVars(innerScriptRequest, innerResponse, innerScriptContext);
              if (varsResult?.runtimeVariables) {
                Object.assign(runnerRuntimeVariables, varsResult.runtimeVariables);
              }
              if (varsResult?.envVariables) {
                Object.assign(envVars, varsResult.envVariables as Record<string, string>);
              }
            } catch (varsError) {
              console.error('Inner request post-response vars error:', varsError);
            }

            try {
              const postResponseResult = await runPostResponseScript(innerScriptRequest, innerResponse, innerScriptContext);
              if (postResponseResult.runtimeVariables) {
                Object.assign(runnerRuntimeVariables, postResponseResult.runtimeVariables);
              }
              if (postResponseResult.envVariables) {
                Object.assign(envVars, postResponseResult.envVariables as Record<string, string>);
              }
            } catch (postResError) {
              console.error('Inner request post-response script error:', postResError);
            }

            return {
              status: result.status,
              statusText: result.statusText,
              headers: result.headers,
              data: result.data,
              responseTime: result.duration
            };
          };

          const scriptContext = {
            collectionUid,
            collectionPath,
            collectionName: collection.name as string || '',
            itemUid,
            requestUid,
            envVars: envVars as Record<string, unknown>,
            runtimeVariables: runnerRuntimeVariables,
            processEnvVars: runnerProcessEnvVars,
            scriptingConfig: { ...(get(collection, 'brunoConfig.scripts', {}) as Record<string, unknown>), runtime: getJsSandboxRuntime(collection as Record<string, unknown>) } as { runtime?: string },
            runRequestByItemPathname: runnerRunRequestByItemPathname
          };

          let skipRequest = false;
          let nextRequestName: string | undefined;

          try {
            const preRequestResult = await runPreRequestScript(scriptRequest, scriptContext);

            sendToWebview('main:run-folder-event', {
              type: 'test-results-pre-request',
              preRequestTestResults: [],
              error: preRequestResult.error || null,
              ...eventData
            });

            if (!preRequestResult.success) {
              sendToWebview('main:run-folder-event', {
                type: 'error',
                error: `Pre-request script error: ${preRequestResult.error}`,
                responseReceived: {},
                ...eventData
              });
              currentRequestIndex++;
              continue;
            }

            skipRequest = preRequestResult.skipRequest || false;
            nextRequestName = preRequestResult.nextRequestName;

            if (preRequestResult.runtimeVariables) {
              Object.assign(runnerRuntimeVariables, preRequestResult.runtimeVariables);
              scriptContext.runtimeVariables = runnerRuntimeVariables;
            }
          } catch (preReqError) {
            const preErr = preReqError as Error;
            sendToWebview('main:run-folder-event', {
              type: 'error',
              error: `Pre-request script error: ${preErr.message}`,
              responseReceived: {},
              ...eventData
            });
            currentRequestIndex++;
            continue;
          }

          if (skipRequest) {
            sendToWebview('main:run-folder-event', {
              type: 'runner-request-skipped',
              error: 'Skipped by pre-request script',
              responseReceived: {
                status: 'skipped',
                statusText: 'Skipped by script',
                data: null,
                responseTime: 0,
                headers: null
              },
              ...eventData
            });
            currentRequestIndex++;
            continue;
          }

          // This handles cases where req.setBody() was called with an array in the script
          const runnerPostScriptContentType = scriptRequest.headers['Content-Type'] || scriptRequest.headers['content-type'] || '';
          const runnerIsFormUrlEncodedAfter = runnerPostScriptContentType === 'application/x-www-form-urlencoded' ||
            (request.body as { mode?: string } | undefined)?.mode === 'formUrlEncoded';
          if (runnerIsFormUrlEncodedAfter && Array.isArray(scriptRequest.data)) {
            scriptRequest.data = brunoUtils.buildFormUrlEncodedPayload(scriptRequest.data);
          } else if (runnerIsFormUrlEncodedAfter && scriptRequest.data && typeof scriptRequest.data === 'object' && !Array.isArray(scriptRequest.data)) {
            scriptRequest.data = Object.entries(scriptRequest.data as Record<string, unknown>)
              .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value ?? ''))}`)
              .join('&');
          }

          const requestSent = {
            url: scriptRequest.url,
            method: scriptRequest.method,
            headers: scriptRequest.headers,
            timestamp: Date.now()
          };

          sendToWebview('main:run-folder-event', {
            type: 'request-sent',
            requestSent,
            ...eventData
          });

          if (delay && !Number.isNaN(delay) && delay > 0) {
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(resolve, delay);
              abortController.signal.addEventListener('abort', () => {
                clearTimeout(timeout);
                reject(new Error('Cancelled'));
              });
            });
          }

          const context: RequestContext = {
            uid: requestUid,
            cancelTokenUid,
            collectionUid,
            collectionPath,
            itemUid,
            itemPathname: item.pathname as string || '',
            envVars,
            collectionVariables: scriptRequest.collectionVariables || {},
            folderVariables: scriptRequest.folderVariables || {},
            requestVariables: scriptRequest.requestVariables || {},
            runtimeVariables: runnerRuntimeVariables as Record<string, string>,
            processEnvVars: runnerProcessEnvVars,
            globalEnvironmentVariables: (scriptRequest.globalEnvironmentVariables || {}) as Record<string, string>
          };

          // Use scriptRequest so pre-request script changes are respected
          const result = await executeRequest(scriptRequest as unknown as BrunoRequest, context, { runnerContext: { isRunningFolder: true, delay } });

          // In this case, skip post-processing and report the error
          if (result.error && result.status === 0) {
            sendToWebview('main:run-folder-event', {
              type: 'error',
              error: result.error,
              responseReceived: {
                status: 0,
                statusText: result.error, // Use actual error message to match bruno-copy's behavior
                headers: {},
                data: null,
                dataBuffer: '',
                size: 0,
                duration: result.duration,
                responseTime: result.duration,
                timeline: result.timeline
              },
              ...eventData
            });
            currentRequestIndex++;
            continue;
          }

          // Use rawBuffer (actual Buffer) for scripts, not base64 dataBuffer
          // Include request property with URL parts for res.getUrl() to work
          let runnerResponseRequest: { protocol: string; host: string; path: string } | undefined;
          try {
            // Use scriptRequest.url since it's interpolated after executeRequest
            const responseUrl = scriptRequest.url;
            if (responseUrl) {
              const parsedUrl = new URL(responseUrl);
              runnerResponseRequest = {
                protocol: parsedUrl.protocol,
                host: parsedUrl.host,
                path: parsedUrl.pathname + parsedUrl.search
              };
            }
          } catch {
          }

          const response = {
            status: result.status,
            statusText: result.statusText,
            headers: result.headers,
            data: result.data,
            dataBuffer: result.rawBuffer,
            size: result.size,
            duration: result.duration,
            responseTime: result.duration,
            request: runnerResponseRequest
          };

          sendToWebview('main:run-folder-event', {
            type: 'response-received',
            responseReceived: {
              status: result.status,
              statusText: result.statusText,
              headers: result.headers,
              data: result.data,
              dataBuffer: result.dataBuffer,
              size: result.size,
              duration: result.duration,
              responseTime: result.duration,
              timeline: result.timeline
            },
            ...eventData
          });

          try {
            const varsResult = runPostResponseVars(scriptRequest, response, scriptContext);
            if (varsResult?.runtimeVariables) {
              Object.assign(runnerRuntimeVariables, varsResult.runtimeVariables);
              scriptContext.runtimeVariables = runnerRuntimeVariables;
            }
          } catch (varsError) {
            console.error('Post-response vars error:', varsError);
          }

          try {
            const postResponseResult = await runPostResponseScript(scriptRequest, response, scriptContext);

            sendToWebview('main:run-folder-event', {
              type: 'test-results-post-response',
              postResponseTestResults: [],
              error: postResponseResult.error || null,
              ...eventData
            });

            if (postResponseResult.runtimeVariables) {
              Object.assign(runnerRuntimeVariables, postResponseResult.runtimeVariables);
              scriptContext.runtimeVariables = runnerRuntimeVariables;
            }

            if (postResponseResult.nextRequestName) {
              nextRequestName = postResponseResult.nextRequestName;
            }
          } catch (postResError) {
            console.error('Post-response script error:', postResError);
            sendToWebview('main:run-folder-event', {
              type: 'test-results-post-response',
              postResponseTestResults: [],
              error: (postResError as Error).message,
              ...eventData
            });
          }

          let assertionResults: Array<unknown> = [];
          try {
            const assertResult = runAssertions(scriptRequest, response, scriptContext);
            assertionResults = assertResult.results || [];

            sendToWebview('main:run-folder-event', {
              type: 'assertion-results',
              assertionResults,
              ...eventData
            });
          } catch (assertError) {
            console.error('Assertions error:', assertError);
            assertionResults = [{
              uid: 'error',
              lhsExpr: 'assertion',
              rhsExpr: 'error',
              operator: 'error',
              error: (assertError as Error).message,
              status: 'fail'
            }];
            sendToWebview('main:run-folder-event', {
              type: 'assertion-results',
              assertionResults,
              ...eventData
            });
          }

          let testResults: Array<unknown> = [];
          try {
            const testResult = await runTests(scriptRequest, response, scriptContext);
            testResults = testResult.results || [];

            sendToWebview('main:run-folder-event', {
              type: 'test-results',
              testResults,
              ...eventData
            });
          } catch (testError) {
            console.error('Tests error:', testError);
            testResults = [{
              uid: 'error',
              description: 'Test execution error',
              passed: false,
              error: (testError as Error).message
            }];
            sendToWebview('main:run-folder-event', {
              type: 'test-results',
              testResults,
              ...eventData
            });
          }

          if (nextRequestName) {
            const nextIndex = folderRequests.findIndex(r => r.name === nextRequestName);
            if (nextIndex !== -1) {
              currentRequestIndex = nextIndex;
              continue;
            }
          }

        } catch (error) {
          const err = error as Error;

          sendToWebview('main:run-folder-event', {
            type: 'error',
            error: err.message || 'An error occurred while running the request',
            responseReceived: {},
            ...eventData
          });
        }

        currentRequestIndex++;
      }

      deleteCancelToken(cancelTokenUid);
      sendToWebview('main:run-folder-event', {
        type: 'testrun-ended',
        collectionUid,
        folderUid,
        runCompletionTime: new Date().toISOString()
      });

      } catch (error) {
        deleteCancelToken(cancelTokenUid);
        sendToWebview('main:run-folder-event', {
          type: 'testrun-ended',
          collectionUid,
          folderUid,
          runCompletionTime: new Date().toISOString(),
          error: error && !(error as { isCancel?: boolean }).isCancel ? error : null
        });
      }
    };

    // Start the collection run asynchronously (don't await)
    runCollection().catch((err) => {
      console.error('Collection runner error:', err);
    });

    return { cancelTokenUid };
  });

  registerWsEventHandlers();
  registerGrpcEventHandlers();

};

export default registerNetworkIpc;
export {
  BrunoRequest,
  RequestContext,
  RequestResult,
  RequestOptions,
  executeRequest
};
