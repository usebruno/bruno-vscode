
import type { AxiosRequestConfig } from 'axios';
import { get, filter } from 'lodash';
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
        return body.json ? JSON.parse(body.json) : undefined;
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

/**
 * Set auth headers based on request and collection root auth settings
 * Used for WebSocket and gRPC requests
 */
const setAuthHeaders = <T extends { headers: Record<string, string>; oauth2?: unknown; awsv4config?: unknown; basicAuth?: unknown; digestConfig?: unknown; ntlmConfig?: unknown }>(
  axiosRequest: T,
  request: { auth?: { mode?: string } },
  collectionRoot: unknown
): T => {
  const collectionAuth = get(collectionRoot, 'request.auth') as Record<string, unknown> | undefined;
  if (collectionAuth && request.auth?.mode === 'inherit') {
    const mode = collectionAuth.mode as string;
    switch (mode) {
      case 'awsv4':
        (axiosRequest as { awsv4config?: unknown }).awsv4config = {
          accessKeyId: get(collectionAuth, 'awsv4.accessKeyId'),
          secretAccessKey: get(collectionAuth, 'awsv4.secretAccessKey'),
          sessionToken: get(collectionAuth, 'awsv4.sessionToken'),
          service: get(collectionAuth, 'awsv4.service'),
          region: get(collectionAuth, 'awsv4.region'),
          profileName: get(collectionAuth, 'awsv4.profileName')
        };
        break;
      case 'basic':
        (axiosRequest as { basicAuth?: unknown }).basicAuth = {
          username: get(collectionAuth, 'basic.username'),
          password: get(collectionAuth, 'basic.password')
        };
        break;
      case 'bearer':
        axiosRequest.headers['Authorization'] = `Bearer ${get(collectionAuth, 'bearer.token', '')}`;
        break;
      case 'digest':
        (axiosRequest as { digestConfig?: unknown }).digestConfig = {
          username: get(collectionAuth, 'digest.username'),
          password: get(collectionAuth, 'digest.password')
        };
        break;
      case 'ntlm':
        (axiosRequest as { ntlmConfig?: unknown }).ntlmConfig = {
          username: get(collectionAuth, 'ntlm.username'),
          password: get(collectionAuth, 'ntlm.password'),
          domain: get(collectionAuth, 'ntlm.domain')
        };
        break;
      case 'oauth2':
        axiosRequest.oauth2 = collectionAuth.oauth2;
        break;
      case 'apikey':
        const apiKey = get(collectionAuth, 'apikey.key') as string;
        const apiValue = get(collectionAuth, 'apikey.value') as string;
        const placement = get(collectionAuth, 'apikey.placement') as string;
        if (placement === 'header' && apiKey) {
          axiosRequest.headers[apiKey] = apiValue || '';
        }
        break;
    }
  } else {
    const requestAuth = request.auth as Record<string, unknown> | undefined;
    if (requestAuth) {
      const mode = requestAuth.mode as string;
      switch (mode) {
        case 'awsv4':
          (axiosRequest as { awsv4config?: unknown }).awsv4config = {
            accessKeyId: get(requestAuth, 'awsv4.accessKeyId'),
            secretAccessKey: get(requestAuth, 'awsv4.secretAccessKey'),
            sessionToken: get(requestAuth, 'awsv4.sessionToken'),
            service: get(requestAuth, 'awsv4.service'),
            region: get(requestAuth, 'awsv4.region'),
            profileName: get(requestAuth, 'awsv4.profileName')
          };
          break;
        case 'basic':
          (axiosRequest as { basicAuth?: unknown }).basicAuth = {
            username: get(requestAuth, 'basic.username'),
            password: get(requestAuth, 'basic.password')
          };
          break;
        case 'bearer':
          axiosRequest.headers['Authorization'] = `Bearer ${get(requestAuth, 'bearer.token', '')}`;
          break;
        case 'digest':
          (axiosRequest as { digestConfig?: unknown }).digestConfig = {
            username: get(requestAuth, 'digest.username'),
            password: get(requestAuth, 'digest.password')
          };
          break;
        case 'ntlm':
          (axiosRequest as { ntlmConfig?: unknown }).ntlmConfig = {
            username: get(requestAuth, 'ntlm.username'),
            password: get(requestAuth, 'ntlm.password'),
            domain: get(requestAuth, 'ntlm.domain')
          };
          break;
        case 'oauth2':
          axiosRequest.oauth2 = requestAuth.oauth2;
          break;
        case 'apikey':
          const apiKey = get(requestAuth, 'apikey.key') as string;
          const apiValue = get(requestAuth, 'apikey.value') as string;
          const placement = get(requestAuth, 'apikey.placement') as string;
          if (placement === 'header' && apiKey) {
            axiosRequest.headers[apiKey] = apiValue || '';
          }
          break;
      }
    }
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
