
import type { AxiosRequestConfig } from 'axios';
import { get, filter } from 'lodash';
import crypto from 'crypto';
import decomment from 'decomment';
import { utils as brunoUtilsRaw } from '@usebruno/common';

// Type assertion for @usebruno/common utils (no type definitions available)
const brunoUtils = brunoUtilsRaw as {
  buildFormUrlEncodedPayload: (fields: Array<{ name: string; value: string; enabled?: boolean }>) => string;
};

interface BrunoRequest {
  url: string;
  method: string;
  headers?: Array<{ name: string; value: string; enabled?: boolean }> | Record<string, string>;
  params?: Array<{ name: string; value: string; enabled?: boolean }>;
  body?: {
    mode?: string;
    json?: string;
    text?: string;
    xml?: string;
    formUrlEncoded?: Array<{ name: string; value: string; enabled?: boolean }>;
    multipartForm?: Array<{ name: string; value: string; type?: string; enabled?: boolean }>;
    graphql?: {
      query?: string;
      variables?: string;
    };
  };
  // data property is set by scripts via req.setBody() or by the extension's getRequestData()
  // If present, it takes precedence over rebuilding from body
  data?: unknown;
  auth?: {
    mode?: string;
    basic?: { username?: string; password?: string };
    bearer?: { token?: string };
    digest?: { username?: string; password?: string };
    apikey?: { key?: string; value?: string; placement?: string };
  };
  timeout?: number;
}

interface PreparedRequest extends AxiosRequestConfig {
  headers: Record<string, string>;
}

const getEnabledHeaders = (headers: Array<{ name: string; value: string; enabled?: boolean }> | Record<string, string> | undefined): Record<string, string> => {
  if (!headers) {
    return {};
  }

  // If headers is already an object (from scriptRequest), return it directly
  if (!Array.isArray(headers)) {
    return headers as Record<string, string>;
  }

  // Array format: [{name, value, enabled}, ...]
  const result: Record<string, string> = {};
  const enabledHeaders = filter(headers, h => h.enabled !== false);

  for (const header of enabledHeaders) {
    if (header.name && header.name.trim()) {
      result[header.name] = header.value || '';
    }
  }

  return result;
};

const getEnabledParams = (params: Array<{ name: string; value: string; enabled?: boolean }> = []): Record<string, string> => {
  const result: Record<string, string> = {};
  const enabledParams = filter(params, p => p.enabled !== false);

  for (const param of enabledParams) {
    if (param.name && param.name.trim()) {
      result[param.name] = param.value || '';
    }
  }

  return result;
};

const prepareBody = (body: BrunoRequest['body'], headers: Record<string, string>): unknown => {
  if (!body || !body.mode) {
    return undefined;
  }

  switch (body.mode) {
    case 'json':
      headers['content-type'] = headers['content-type'] || 'application/json';
      try {
        return (body.json && decomment(body.json).trim()) || undefined;
      } catch {
        return body.json;
      }

    case 'text':
      headers['content-type'] = headers['content-type'] || 'text/plain';
      return body.text;

    case 'xml':
      headers['content-type'] = headers['content-type'] || 'application/xml';
      return body.xml;

    case 'formUrlEncoded':
      headers['content-type'] = headers['content-type'] || 'application/x-www-form-urlencoded';
      const enabledFields = filter(body.formUrlEncoded, f => f.enabled !== false);
      // Use buildFormUrlEncodedPayload to properly handle duplicate keys and order
      return brunoUtils.buildFormUrlEncodedPayload(enabledFields);

    case 'multipartForm':
      // Multipart form requires FormData
      // TODO: Implement with proper FormData handling
      console.warn('Multipart form not yet fully implemented');
      return undefined;

    case 'graphql':
      headers['content-type'] = headers['content-type'] || 'application/json';
      return {
        query: body.graphql?.query || '',
        variables: body.graphql?.variables ? JSON.parse(body.graphql.variables) : {}
      };

    default:
      return undefined;
  }
};

const OAUTH2_FIELDS_BY_GRANT: Record<string, string[]> = {
  password: [
    'accessTokenUrl', 'refreshTokenUrl', 'username', 'password', 'clientId', 'clientSecret', 'scope',
    'credentialsPlacement', 'credentialsId', 'tokenPlacement', 'tokenHeaderPrefix', 'tokenQueryKey',
    'tokenSource', 'autoFetchToken', 'autoRefreshToken'
  ],
  authorization_code: [
    'callbackUrl', 'authorizationUrl', 'accessTokenUrl', 'refreshTokenUrl', 'clientId', 'clientSecret',
    'scope', 'state', 'pkce', 'credentialsPlacement', 'credentialsId', 'tokenPlacement', 'tokenHeaderPrefix',
    'tokenQueryKey', 'tokenSource', 'autoFetchToken', 'autoRefreshToken'
  ],
  implicit: [
    'callbackUrl', 'authorizationUrl', 'clientId', 'scope', 'state', 'credentialsId', 'tokenPlacement',
    'tokenHeaderPrefix', 'tokenQueryKey', 'tokenSource', 'autoFetchToken'
  ],
  client_credentials: [
    'accessTokenUrl', 'refreshTokenUrl', 'clientId', 'clientSecret', 'scope', 'credentialsPlacement',
    'credentialsId', 'tokenPlacement', 'tokenHeaderPrefix', 'tokenQueryKey', 'tokenSource', 'autoFetchToken',
    'autoRefreshToken'
  ]
};

const OAUTH1_FIELDS = [
  'consumerKey', 'consumerSecret', 'accessToken', 'accessTokenSecret', 'callbackUrl', 'verifier',
  'signatureMethod', 'privateKey', 'privateKeyType', 'timestamp', 'nonce', 'version', 'realm', 'placement',
  'includeBodyHash'
];

const EDGEGRID_FIELDS = [
  'accessToken', 'clientToken', 'clientSecret', 'nonce', 'timestamp', 'baseURL', 'headersToSign', 'maxBodySize'
];

const pick = (source: unknown, path: string, fields: string[]): Record<string, unknown> =>
  Object.fromEntries(fields.map((field) => [field, get(source, `${path}.${field}`)]));

const applyAuthConfig = (target: Record<string, unknown> & { headers: Record<string, string> }, auth: Record<string, unknown>): void => {
  switch (auth.mode) {
    case 'awsv4':
      target.awsv4config = pick(auth, 'awsv4', ['accessKeyId', 'secretAccessKey', 'sessionToken', 'service', 'region', 'profileName']);
      break;
    case 'basic':
      target.basicAuth = pick(auth, 'basic', ['username', 'password']);
      break;
    case 'bearer':
      target.headers['Authorization'] = `Bearer ${get(auth, 'bearer.token', '')}`;
      break;
    case 'digest':
      target.digestConfig = pick(auth, 'digest', ['username', 'password']);
      break;
    case 'ntlm':
      target.ntlmConfig = pick(auth, 'ntlm', ['username', 'password', 'domain']);
      break;
    case 'oauth1':
      target.oauth1config = pick(auth, 'oauth1', OAUTH1_FIELDS);
      break;
    case 'oauth2': {
      const grantType = get(auth, 'oauth2.grantType') as string;
      const fields = OAUTH2_FIELDS_BY_GRANT[grantType];
      if (fields) {
        target.oauth2 = {
          grantType,
          ...pick(auth, 'oauth2', fields),
          additionalParameters: get(auth, 'oauth2.additionalParameters', { authorization: [], token: [], refresh: [] })
        };
      }
      break;
    }
    case 'wsse': {
      const username = get(auth, 'wsse.username', '') as string;
      const password = get(auth, 'wsse.password', '') as string;
      const ts = new Date().toISOString();
      const nonce = crypto.randomBytes(16).toString('hex');
      const hash = crypto.createHash('sha1').update(nonce + ts + password).digest('hex');
      const digest = Buffer.from(hash, 'utf8').toString('base64');
      target.headers['X-WSSE'] = `UsernameToken Username="${username}", PasswordDigest="${digest}", Nonce="${nonce}", Created="${ts}"`;
      break;
    }
    case 'apikey': {
      const apiKeyAuth = auth.apikey as { key?: string; value?: string; placement?: string } | undefined;
      if (!apiKeyAuth?.key) break;
      if (apiKeyAuth.placement === 'header') {
        target.headers[apiKeyAuth.key] = apiKeyAuth.value as string;
        target.apiKeyHeaderName = apiKeyAuth.key;
      } else if (apiKeyAuth.placement === 'queryparams') {
        target.apiKeyAuthValueForQueryParams = apiKeyAuth;
      }
      break;
    }
    case 'akamai-edgegrid':
      target.edgeGridConfig = pick(auth, 'akamaiEdgegrid', EDGEGRID_FIELDS);
      break;
  }
};

const setAuthHeaders = <T extends { headers: Record<string, string> }>(
  axiosRequest: T,
  request: { auth?: { mode?: string } },
  collectionRoot: unknown
): T => {
  const target = axiosRequest as unknown as Record<string, unknown> & { headers: Record<string, string> };
  const collectionAuth = get(collectionRoot, 'request.auth') as Record<string, unknown> | undefined;
  if (collectionAuth && request.auth?.mode === 'inherit') {
    applyAuthConfig(target, collectionAuth);
  } else if (request.auth) {
    applyAuthConfig(target, request.auth as Record<string, unknown>);
  }
  return axiosRequest;
};

const applyAuth = (request: PreparedRequest, auth: BrunoRequest['auth']): void => {
  if (!auth || !auth.mode || auth.mode === 'none') {
    return;
  }

  switch (auth.mode) {
    case 'basic':
      // Always set Authorization header for basic auth, even if username is empty
      const username = auth.basic?.username || '';
      const password = auth.basic?.password || '';
      request.headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      break;

    case 'bearer':
      // Always set Authorization header for bearer auth, even if token is empty
      request.headers['Authorization'] = `Bearer ${auth.bearer?.token || ''}`;
      break;

    case 'apikey':
      if (auth.apikey?.key && auth.apikey?.value) {
        if (auth.apikey.placement === 'header') {
          request.headers[auth.apikey.key] = auth.apikey.value;
        } else if (auth.apikey.placement === 'queryparams') {
          const url = new URL(request.url || '');
          url.searchParams.set(auth.apikey.key, auth.apikey.value);
          request.url = url.toString();
        }
      }
      break;

    case 'oauth2':
      // Token is already applied by applyOAuth2ToRequest in the execution pipeline
      break;

    // digest, awsv4 require additional handling
    default:
      console.warn(`Auth mode ${auth.mode} not yet fully implemented`);
  }
};

const prepareRequest = (brunoRequest: BrunoRequest): PreparedRequest => {
  const headers = getEnabledHeaders(brunoRequest.headers);

  const preparedRequest: PreparedRequest = {
    url: brunoRequest.url,
    method: brunoRequest.method.toLowerCase(),
    headers,
    timeout: brunoRequest.timeout || 0
  };

  // If so, use it directly instead of rebuilding from body
  // This is critical for scripts that modify the request body to work correctly
  if (brunoRequest.data !== undefined) {
    preparedRequest.data = brunoRequest.data;
    // Still need to set default content-type headers if not present
    if (brunoRequest.body?.mode === 'json' && !headers['content-type'] && !headers['Content-Type']) {
      preparedRequest.headers['content-type'] = 'application/json';
    } else if (brunoRequest.body?.mode === 'formUrlEncoded' && !headers['content-type'] && !headers['Content-Type']) {
      preparedRequest.headers['content-type'] = 'application/x-www-form-urlencoded';
    } else if (brunoRequest.body?.mode === 'text' && !headers['content-type'] && !headers['Content-Type']) {
      preparedRequest.headers['content-type'] = 'text/plain';
    } else if (brunoRequest.body?.mode === 'xml' && !headers['content-type'] && !headers['Content-Type']) {
      preparedRequest.headers['content-type'] = 'application/xml';
    }
  } else {
    const body = prepareBody(brunoRequest.body, preparedRequest.headers);
    if (body !== undefined) {
      preparedRequest.data = body;
    }
  }

  applyAuth(preparedRequest, brunoRequest.auth);

  return preparedRequest;
};

export default prepareRequest;
export {
  prepareRequest,
  getEnabledHeaders,
  getEnabledParams,
  prepareBody,
  applyAuth,
  setAuthHeaders,
  BrunoRequest,
  PreparedRequest
};
