/**
 * Axios instance configuration
 * Creates and configures axios instances for HTTP requests
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { NtlmClient, type NtlmCredentials } from 'axios-ntlm';
import FormData from 'form-data';
import https from 'https';
import { URL } from 'url';
import { isSameOrigin } from '@usebruno/common/utils';
import type { NetworkLogEntry } from '@bruno-types';
import { getCookieStringForUrl, saveCookies } from '../../utils/cookies';
import { preferencesUtil } from '../../store/preferences';
import { safeStringifyJSON } from '../../utils/common';
import { MultipartField, createFormData, formatMultipartData } from '../../utils/form-data';
import { createConnectionLoggingTransport, sslValidationMessage } from './connection-log';
import type { CACertificatesCount, CertsAndProxyConfigResult } from './cert-utils';

// Import digest auth helper using require due to type declaration issues in @usebruno/requests
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { addDigestInterceptor, handleNtlmRedirect } = require('@usebruno/requests') as {
  addDigestInterceptor: (axiosInstance: AxiosInstance, request: { digestConfig: { username?: string; password?: string } }) => void;
  handleNtlmRedirect: (requestConfig: AxiosRequestConfig, fromUrl: string, redirectUrl: string, forwardAuthorizationHeader: boolean) => void;
};

const redirectResponseCodes = [301, 302, 303, 307, 308];

/** Set per hop, so a redirect chain times each request. */
type TimedRequestConfig = InternalAxiosRequestConfig & { metadata?: { startTime: number } };

const getHttpVersion = (response: AxiosResponse): string | undefined =>
  (response.request as { res?: { httpVersion?: string } } | undefined)?.res?.httpVersion;

const getElapsedMs = (config?: AxiosRequestConfig): number => {
  const startTime = (config as TimedRequestConfig | undefined)?.metadata?.startTime;
  return startTime ? Date.now() - startTime : 0;
};

/** Error properties are non-enumerable, so JSON.stringify renders an Error as `{}`. */
const describeError = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map(describeError).filter(Boolean).join('\n') || undefined;
  }
  return value instanceof Error ? value.message : safeStringifyJSON(value);
};

const stringifyRequestBody = (config: AxiosRequestConfig): string | undefined => {
  const data = config.data;
  if (data === undefined || data === null || data === '') {
    return undefined;
  }
  if (typeof data === 'string') {
    return data;
  }
  // A buffer body is a file upload; keep the file itself out of the log.
  if (Buffer.isBuffer(data)) {
    return '<request body redacted>';
  }
  if (data instanceof FormData) {
    // Not parseDataFromRequest: it deep-clones what it is given, file buffers included.
    const fields = (config as { _originalMultipartData?: MultipartField[] })._originalMultipartData;
    return fields?.length ? formatMultipartData(fields, (data as { _boundary?: string })._boundary || 'boundary') : undefined;
  }
  if (typeof (data as { pipe?: unknown }).pipe === 'function') {
    return undefined;
  }
  return safeStringifyJSON(data, 2);
};

interface AxiosInstanceOptions {
  timeout?: number;
  maxBodyLength?: number;
  maxContentLength?: number;
  httpsAgentOptions?: https.AgentOptions;
  proxyMode?: 'off' | 'on' | 'system';
  proxyConfig?: {
    protocol?: string;
    hostname?: string;
    port?: number;
    auth?: {
      username?: string;
      password?: string;
    };
  };
  requestMaxRedirects?: number;
  digestConfig?: {
    username?: string;
    password?: string;
  };
  ntlmConfig?: {
    username: string;
    password: string;
    domain?: string;
  };
  collectionPath?: string;
  disableCookies?: boolean;
  timeline?: NetworkLogEntry[];
}

const createAxiosInstance = (options: AxiosInstanceOptions = {}): AxiosInstance => {
  const {
    timeout = 0,
    maxBodyLength = Infinity,
    maxContentLength = Infinity,
    httpsAgentOptions = {},
    proxyMode = 'off',
    proxyConfig,
    requestMaxRedirects = 5,
    digestConfig,
    ntlmConfig,
    collectionPath,
    disableCookies,
    timeline
  } = options;

  const { ca, cert, key, pfx, passphrase, rejectUnauthorized, caCertificatesCount } = httpsAgentOptions as Record<string, unknown>;

  // VS Code's @vscode/proxy-agent replaces the agent under http.proxySupport=override (the default),
  // dropping agent-level TLS options. Request-level options survive, so the transport sets these on each request.
  const tlsOptions: https.AgentOptions = {
    rejectUnauthorized: rejectUnauthorized !== false,
    ...(ca !== undefined && { ca: ca as string | string[] }),
    ...(cert !== undefined && { cert: cert as string | Buffer }),
    ...(key !== undefined && { key: key as string | Buffer }),
    ...(pfx !== undefined && { pfx: pfx as string | Buffer }),
    ...(passphrase !== undefined && { passphrase: passphrase as string }),
  };

  const log = (type: NetworkLogEntry['type'], message?: string): void => {
    timeline?.push({ timestamp: new Date(), type, message });
  };

  const proxyModeMessage = proxyMode === 'on' && proxyConfig
    ? `Proxy mode: on | ${proxyConfig.protocol || 'http'}://${proxyConfig.hostname}${proxyConfig.port ? `:${proxyConfig.port}` : ''}`
    : `Proxy mode: ${proxyMode}`;

  const connectionLoggingTransport = createConnectionLoggingTransport({
    log,
    timeout,
    caCertificatesCount: caCertificatesCount as Partial<CACertificatesCount> | undefined,
    proxyModeMessage,
    tlsOptions
  });

  const config: AxiosRequestConfig = {
    timeout,
    maxBodyLength,
    maxContentLength,
    maxRedirects: 0,
    responseType: 'stream',
    proxy: false,
    httpsAgent: new https.Agent({ keepAlive: true, ...tlsOptions }),
    // Also used without a timeline, where `log` is a no-op, so TLS options apply to every request.
    transport: connectionLoggingTransport,
    headers: {
      'User-Agent': 'bruno-runtime/1.0',
      // VS Code's proxy agent drops the agent above, and Node's global agent sends `Connection: close`.
      Connection: 'keep-alive'
    }
  };

  if (proxyMode === 'on' && proxyConfig) {
    config.proxy = {
      protocol: proxyConfig.protocol || 'http',
      host: proxyConfig.hostname || 'localhost',
      port: proxyConfig.port || 8080,
      auth: proxyConfig.auth ? {
        username: proxyConfig.auth.username || '',
        password: proxyConfig.auth.password || ''
      } : undefined
    };
  } else if (proxyMode === 'system') {
    delete config.proxy;
  }

  const instance = axios.create(config);

  const logResponseHeaders = (headers: Record<string, unknown>, elapsedMs: number): void => {
    Object.entries(headers || {}).forEach(([name, value]) => {
      log('responseHeader', `${name}: ${value}`);
    });
    log('responseHeader', `request-duration: ${elapsedMs}`);
  };

  const shouldSendCookies = () => !disableCookies && preferencesUtil.shouldSendCookies();
  const shouldStoreCookies = () => !disableCookies && preferencesUtil.shouldStoreCookies();

  instance.interceptors.request.use((requestConfig: InternalAxiosRequestConfig) => {
    const startTime = Date.now();
    (requestConfig as TimedRequestConfig).metadata = { startTime };
    requestConfig.headers['request-start-time'] = startTime;

    if (!timeline) {
      return requestConfig;
    }

    log('separator');
    log('info', `Preparing request to ${requestConfig.url}`);
    log('info', `Current time is ${new Date().toISOString()}`);
    log('request', `${(requestConfig.method || 'get').toUpperCase()} ${requestConfig.url}`);

    const requestBody = stringifyRequestBody(requestConfig);
    if (requestBody) {
      log('requestData', requestBody);
    }

    // Headers and the proxy line are logged from the request the transport creates, where the wire set is complete.
    requestConfig.transport = connectionLoggingTransport;

    return requestConfig;
  });

  let redirectCount = 0;

  instance.interceptors.response.use(
    (response: AxiosResponse) => {
      const elapsedMs = getElapsedMs(response.config);
      const httpVersion = getHttpVersion(response);
      if (httpVersion?.startsWith('2')) {
        log('info', 'Using HTTP/2, server supports multiplexing');
      }
      log('response', `HTTP/${httpVersion || '1.1'} ${response.status} ${response.statusText}`);
      logResponseHeaders(response.headers as unknown as Record<string, unknown>, elapsedMs);
      log('info', `Request completed in ${elapsedMs} ms`);

      if (response.config.url && shouldStoreCookies()) {
        saveCookies(response.config.url, response.headers as Record<string, string | string[]>);
      }

      redirectCount = 0;

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers['location'];
        if (location) {
          (response as unknown as { redirectLocation: string }).redirectLocation = location;
        }
      }
      return response;
    },
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & {
        _retry?: boolean;
        _originalMultipartData?: unknown;
        collectionPath?: string;
      };

      const elapsedMs = getElapsedMs(error.config);

      log('error', 'there was an error executing the request!');

      if (error.response) {
        const httpVersion = getHttpVersion(error.response);
        log('response', `HTTP/${httpVersion || '1.1'} ${error.response.status} ${error.response.statusText}`);
        logResponseHeaders(error.response.headers as unknown as Record<string, unknown>, elapsedMs);
      } else {
        const cause = describeError(error.cause);
        if (cause) {
          log('error', cause);
        }
        const aggregatedErrors = describeError((error as { errors?: unknown }).errors);
        if (aggregatedErrors) {
          log('error', aggregatedErrors);
        }
      }

      if (!originalRequest) {
        return Promise.reject(error);
      }

      if (error.response && redirectResponseCodes.includes(error.response.status)) {
        log('info', `Request completed in ${elapsedMs} ms`);

        if (originalRequest.url && shouldStoreCookies()) {
          saveCookies(originalRequest.url, error.response.headers as Record<string, string | string[]>);
        }

        if (redirectCount >= requestMaxRedirects) {
          redirectCount = 0;
          return Promise.reject(error);
        }

        redirectCount++;

        const locationHeader = error.response.headers['location'];
        if (!locationHeader) {
          return Promise.reject(error);
        }

        let redirectUrl = locationHeader;
        if (!locationHeader.match(/^https?:\/\//i)) {
          try {
            redirectUrl = new URL(locationHeader, originalRequest.url).toString();
          } catch {
            redirectUrl = locationHeader;
          }
          log('info', `Resolving relative redirect URL: ${locationHeader} → ${redirectUrl}`);
        }

        const requestConfig: AxiosRequestConfig = {
          ...originalRequest,
          url: redirectUrl,
          headers: { ...originalRequest.headers }
        };

        if (originalRequest.url) {
          handleNtlmRedirect(requestConfig, originalRequest.url, redirectUrl, true);
        }
        
        if (!isSameOrigin(originalRequest.url || '', redirectUrl)) {
          for (const name of Object.keys(requestConfig.headers || {})) {
            // Header names starting with x-amz- (any case), such as X-Amz-Date and X-Amz-Security-Token, belong to the AWS signature
            if (/^x-amz-/i.test(name)) {
              delete (requestConfig.headers as Record<string, unknown>)[name];
            }
          }
          (requestConfig as { __skipAwsV4Sign?: boolean }).__skipAwsV4Sign = true;
        }

        const statusCode = error.response.status;
        const originalMethod = (originalRequest.method || 'get').toLowerCase();

        if ([301, 302, 303].includes(statusCode) && originalMethod !== 'head') {
          requestConfig.method = 'get';
          requestConfig.data = undefined;
          if (requestConfig.headers) {
            delete requestConfig.headers['content-length'];
            delete requestConfig.headers['Content-Length'];
            delete requestConfig.headers['content-type'];
            delete requestConfig.headers['Content-Type'];
          }
          log('info', `Changed method from ${originalMethod.toUpperCase()} to GET for ${statusCode} redirect and removed request body`);
        } else {
          if (requestConfig.data && typeof requestConfig.data === 'object' &&
              requestConfig.data.constructor && requestConfig.data.constructor.name === 'FormData') {
            const formData = requestConfig.data as { _released?: boolean; _streams?: unknown[] };
            if (formData._released || (formData._streams && formData._streams.length === 0)) {
              if (originalRequest._originalMultipartData && (originalRequest.collectionPath || collectionPath)) {
                log('info', `Recreating consumed FormData for ${statusCode} redirect`);
                const recreatedForm = createFormData(
                  originalRequest._originalMultipartData as Array<{ name: string; type: string; value: string; contentType?: string }>,
                  originalRequest.collectionPath || collectionPath || ''
                );
                requestConfig.data = recreatedForm;
                const formHeaders = recreatedForm.getHeaders();
                Object.assign(requestConfig.headers || {}, formHeaders);
              } else {
                log('info', `FormData consumed but no original data available for ${statusCode} redirect`);
              }
            }
          }
        }

        if (shouldSendCookies()) {
          const cookieString = getCookieStringForUrl(redirectUrl);
          if (cookieString && requestConfig.headers) {
            requestConfig.headers['cookie'] = cookieString;
          }
        }

        // Repeated once more by the transport, as the desktop app does for every hop.
        log('info', proxyModeMessage);
        if (/^https:/i.test(redirectUrl)) {
          log('info', sslValidationMessage(tlsOptions.rejectUnauthorized));
        }

        return instance(requestConfig);
      }

      return Promise.reject(error);
    }
  );

  // Registered last so the challenge is logged as its own hop before this retries.
  if (digestConfig && digestConfig.username && digestConfig.password) {
    addDigestInterceptor(instance, { digestConfig });
  }

  if (ntlmConfig) {
    const credentials: NtlmCredentials = {
      username: ntlmConfig.username,
      password: ntlmConfig.password,
      domain: ntlmConfig.domain || ''
    };
    const ntlmClient = NtlmClient(credentials, {});
    instance.defaults.adapter = (requestConfig) => ntlmClient.request({
      ...requestConfig,
      headers: { ...requestConfig.headers },
      adapter: axios.getAdapter('http')
    });
  }

  return instance;
};

/** The TLS and proxy options of `createAxiosInstance`, from the result of `getCertsAndProxyConfig`. */
const axiosOptionsFromCertsAndProxyConfig = ({
  httpsAgentRequestFields,
  proxyMode,
  proxyConfig
}: CertsAndProxyConfigResult): Pick<AxiosInstanceOptions, 'httpsAgentOptions' | 'proxyMode' | 'proxyConfig'> => ({
  httpsAgentOptions: { ...httpsAgentRequestFields },
  proxyMode,
  proxyConfig: proxyMode === 'on' ? {
    protocol: proxyConfig.protocol,
    hostname: proxyConfig.hostname,
    port: proxyConfig.port || undefined,
    auth: proxyConfig.auth ? {
      username: proxyConfig.auth.username,
      password: proxyConfig.auth.password
    } : undefined
  } : undefined
});

/**
 * Make a request using a fresh axios instance
 */
const makeRequest = async (
  config: AxiosRequestConfig,
  instanceOptions: AxiosInstanceOptions = {}
): Promise<AxiosResponse> => {
  const instance = createAxiosInstance(instanceOptions);
  return instance.request(config);
};

export default createAxiosInstance;
export {
  createAxiosInstance,
  axiosOptionsFromCertsAndProxyConfig,
  makeRequest,
  AxiosInstanceOptions
};
