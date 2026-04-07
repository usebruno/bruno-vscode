
import { interpolate as interpolateRaw } from '@usebruno/common';

// Type assertion for @usebruno/common interpolate (no type definitions available)
const interpolate = interpolateRaw as (
  str: string,
  obj: Record<string, unknown>,
  options?: { escapeJSONStrings?: boolean }
) => string;
import { each, forOwn, cloneDeep } from 'lodash';
import FormData from 'form-data';

const getContentType = (headers: Record<string, unknown> = {}): string => {
  let contentType = '';
  forOwn(headers, (value, key) => {
    if (key && key.toLowerCase() === 'content-type') {
      contentType = value as string;
    }
  });

  return contentType;
};

const getRawQueryString = (url: string): string => {
  const queryIndex = url.indexOf('?');
  return queryIndex !== -1 ? url.slice(queryIndex) : '';
};

interface InterpolationOptions {
  globalEnvironmentVariables?: Record<string, unknown>;
  collectionVariables?: Record<string, unknown>;
  envVars?: Record<string, unknown>;
  folderVariables?: Record<string, unknown>;
  requestVariables?: Record<string, unknown>;
  runtimeVariables?: Record<string, unknown>;
  processEnvVars?: Record<string, string>;
  promptVariables?: Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const interpolateVars = (request: any, options: InterpolationOptions): any => {
  const globalEnvironmentVariables = request?.globalEnvironmentVariables || options.globalEnvironmentVariables || {};
  const oauth2CredentialVariables = request?.oauth2CredentialVariables || {};
  const collectionVariables = request?.collectionVariables || options.collectionVariables || {};
  const folderVariables = request?.folderVariables || options.folderVariables || {};
  const requestVariables = request?.requestVariables || options.requestVariables || {};
  const processEnvVars = options.processEnvVars || {};
  const promptVariables = options.promptVariables || {};
  // we clone envVars because we don't want to modify the original object
  let envVariables = cloneDeep(options.envVars || {});

  // envVars can inturn have values as {{process.env.VAR_NAME}}
  // so we need to interpolate envVars first with processEnvVars
  forOwn(envVariables, (value, key) => {
    if (typeof value === 'string') {
      envVariables[key] = interpolate(value, {
        process: {
          env: {
            ...processEnvVars
          }
        }
      });
    }
  });

  const _interpolate = (str: unknown, opts?: { escapeJSONStrings?: boolean }): unknown => {
    if (!str || typeof str !== 'string' || !str.length) {
      return str;
    }

    // runtimeVariables take precedence over envVars
    const combinedVars = {
      ...globalEnvironmentVariables,
      ...collectionVariables,
      ...envVariables,
      ...folderVariables,
      ...requestVariables,
      ...oauth2CredentialVariables,
      ...(options.runtimeVariables || {}),
      ...promptVariables,
      process: {
        env: {
          ...processEnvVars
        }
      }
    };

    return interpolate(str, combinedVars, {
      escapeJSONStrings: opts?.escapeJSONStrings
    });
  };

  // Interpolate URL
  request.url = _interpolate(request.url);
  const isGrpcRequest = request.mode === 'grpc';

  // Interpolate headers - handle both array and object formats
  if (request.headers) {
    if (Array.isArray(request.headers)) {
      // Array format: [{name, value, enabled}, ...] - used by BrunoRequest
      request.headers = request.headers.map((h: { name?: string; value?: string; enabled?: boolean }) => ({
        ...h,
        name: _interpolate(h.name) as string,
        value: _interpolate(h.value) as string
      }));
    } else if (typeof request.headers === 'object') {
      // Object format: {key: value, ...} - used by axios-ready request
      forOwn(request.headers, (value, key) => {
        delete request.headers[key];
        request.headers[_interpolate(key) as string] = _interpolate(value);
      });
    }
  }

  // Interpolate query params (BrunoRequest format)
  if (request.params && Array.isArray(request.params)) {
    request.params = request.params.map((p: { name?: string; value?: string; enabled?: boolean }) => ({
      ...p,
      name: _interpolate(p.name) as string,
      value: _interpolate(p.value) as string
    }));
  }

  let contentType = '';
  if (request.headers) {
    if (Array.isArray(request.headers)) {
      const ctHeader = request.headers.find((h: { name?: string }) =>
        h.name && h.name.toLowerCase() === 'content-type'
      );
      if (ctHeader) {
        contentType = (ctHeader as { value?: string }).value || '';
      }
    } else {
      contentType = getContentType(request.headers);
    }
  }

  // Interpolate body in BrunoRequest format (body.json, body.text, etc.)
  if (request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body)) {
    if (request.body.json) {
      request.body.json = _interpolate(request.body.json, { escapeJSONStrings: true }) as string;
    }
    if (request.body.text) {
      request.body.text = _interpolate(request.body.text) as string;
    }
    if (request.body.xml) {
      request.body.xml = _interpolate(request.body.xml) as string;
    }
    if (request.body.formUrlEncoded && Array.isArray(request.body.formUrlEncoded)) {
      request.body.formUrlEncoded = request.body.formUrlEncoded.map((f: { name?: string; value?: string; enabled?: boolean }) => ({
        ...f,
        name: _interpolate(f.name) as string,
        value: _interpolate(f.value) as string
      }));
    }
    if (request.body.multipartForm && Array.isArray(request.body.multipartForm)) {
      request.body.multipartForm = request.body.multipartForm.map((f: { name?: string; value?: string; enabled?: boolean }) => ({
        ...f,
        name: _interpolate(f.name) as string,
        value: _interpolate(f.value) as string
      }));
    }
    if (request.body.graphql) {
      if (request.body.graphql.query) {
        request.body.graphql.query = _interpolate(request.body.graphql.query) as string;
      }
      if (request.body.graphql.variables) {
        request.body.graphql.variables = _interpolate(request.body.graphql.variables, { escapeJSONStrings: true }) as string;
      }
    }
  }

  if (isGrpcRequest && request.body) {
    const jsonDoc = JSON.stringify(request.body);
    const parsed = _interpolate(jsonDoc, {
      escapeJSONStrings: true
    });
    request.body = JSON.parse(parsed as string);
  }

  // Interpolate WebSocket message body
  const isWsRequest = request.mode === 'ws';
  if (isWsRequest && request.body && request.body.ws && Array.isArray(request.body.ws)) {
    request.body.ws.forEach((message: { content?: string }) => {
      if (message && message.content) {
        // Try to detect if content is JSON for proper escaping
        let isJson = false;
        try {
          JSON.parse(message.content);
          isJson = true;
        } catch {
          // Not JSON, treat as regular string
        }

        message.content = _interpolate(message.content, {
          escapeJSONStrings: isJson
        }) as string;
      }
    });
  }

  if (typeof contentType === 'string') {
    /*
      We explicitly avoid interpolating buffer values because the file content is read as a buffer object in raw body mode.
      Even if the selected file's content type is JSON, this prevents the buffer object from being interpolated.
    */
    if (contentType.includes('json') && !Buffer.isBuffer(request.data)) {
      if (typeof request.data === 'string') {
        if (request.data.length) {
          request.data = _interpolate(request.data, {
            escapeJSONStrings: true
          });
        }
      } else if (typeof request.data === 'object') {
        try {
          const jsonDoc = JSON.stringify(request.data);
          const parsed = _interpolate(jsonDoc, {
            escapeJSONStrings: true
          });
          request.data = JSON.parse(parsed as string);
        } catch {
          // Ignore JSON parsing errors
        }
      }
    } else if (contentType === 'application/x-www-form-urlencoded') {
      if (request.data && Array.isArray(request.data)) {
        request.data = request.data.map((d: { value?: string }) => ({
          ...d,
          value: _interpolate(d?.value)
        }));
      }
    } else if (contentType === 'multipart/form-data') {
      if (Array.isArray(request?.data) && !(request.data instanceof FormData)) {
        try {
          request.data = request?.data?.map((d: { value?: string }) => ({
            ...d,
            value: _interpolate(d?.value)
          }));
        } catch {
          // Ignore errors
        }
      }
    } else {
      request.data = _interpolate(request.data);
    }
  }

  // Interpolate path params
  each(request.pathParams, (param: { value?: string }) => {
    param.value = _interpolate(param.value) as string;
  });

  if (request?.pathParams?.length) {
    let urlStr: string = request.url;
    const urlSearchRaw = getRawQueryString(request.url);
    if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
      urlStr = `http://${urlStr}`;
    }

    let url: URL;
    try {
      url = new URL(urlStr);
    } catch (e) {
      throw { message: 'Invalid URL format', originalError: (e as Error).message };
    }

    const urlPathnameInterpolatedWithPathParams = url.pathname
      .split('/')
      .filter((path) => path !== '')
      .map((path) => {
        if (path.startsWith(':')) {
          const paramName = path.slice(1);
          const existingPathParam = request.pathParams.find((param: { name: string }) => param.name === paramName);
          if (!existingPathParam) {
            return '/' + path;
          }
          return '/' + existingPathParam.value;
        }

        // for OData-style parameters (parameters inside parentheses)
        if (/^[A-Za-z0-9_.-]+\([^)]*\)$/.test(path)) {
          const paramRegex = /[:](\w+)/g;
          let match;
          let result = path;
          while ((match = paramRegex.exec(path))) {
            if (match[1]) {
              let name = match[1].replace(/[')"`]+$/, '');
              name = name.replace(/^[('"`]+/, '');
              if (name) {
                const existingPathParam = request.pathParams.find((param: { name: string }) => param.name === name);
                if (existingPathParam) {
                  result = result.replace(':' + match[1], existingPathParam.value);
                }
              }
            }
          }
          return '/' + result;
        }
        return '/' + path;
      })
      .join('');

    const trailingSlash = url.pathname.endsWith('/') ? '/' : '';
    request.url = url.origin + urlPathnameInterpolatedWithPathParams + trailingSlash + urlSearchRaw;
  }

  // Interpolate proxy config
  if (request.proxy) {
    request.proxy.protocol = _interpolate(request.proxy.protocol);
    request.proxy.hostname = _interpolate(request.proxy.hostname);
    request.proxy.port = _interpolate(request.proxy.port);

    if (request.proxy.auth) {
      request.proxy.auth.username = _interpolate(request.proxy.auth.username);
      request.proxy.auth.password = _interpolate(request.proxy.auth.password);
    }
  }

  if (request.basicAuth) {
    const username = (_interpolate(request.basicAuth.username) || '') as string;
    const password = (_interpolate(request.basicAuth.password) || '') as string;
    // use auth header based approach and delete the request.auth object
    request.headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    delete request.basicAuth;
  }

  // Interpolate OAuth2 config
  if (request?.oauth2?.grantType) {
    switch (request.oauth2.grantType) {
      case 'password':
        request.oauth2.accessTokenUrl = _interpolate(request.oauth2.accessTokenUrl) || '';
        request.oauth2.refreshTokenUrl = _interpolate(request.oauth2.refreshTokenUrl) || '';
        request.oauth2.username = _interpolate(request.oauth2.username) || '';
        request.oauth2.password = _interpolate(request.oauth2.password) || '';
        request.oauth2.clientId = _interpolate(request.oauth2.clientId) || '';
        request.oauth2.clientSecret = _interpolate(request.oauth2.clientSecret) || '';
        request.oauth2.scope = _interpolate(request.oauth2.scope) || '';
        request.oauth2.credentialsPlacement = _interpolate(request.oauth2.credentialsPlacement) || '';
        request.oauth2.credentialsId = _interpolate(request.oauth2.credentialsId) || '';
        request.oauth2.tokenPlacement = _interpolate(request.oauth2.tokenPlacement) || '';
        request.oauth2.tokenHeaderPrefix = _interpolate(request.oauth2.tokenHeaderPrefix) || '';
        request.oauth2.tokenQueryKey = _interpolate(request.oauth2.tokenQueryKey) || '';
        request.oauth2.autoFetchToken = _interpolate(request.oauth2.autoFetchToken);
        request.oauth2.autoRefreshToken = _interpolate(request.oauth2.autoRefreshToken);
        break;
      case 'implicit':
        request.oauth2.callbackUrl = _interpolate(request.oauth2.callbackUrl) || '';
        request.oauth2.authorizationUrl = _interpolate(request.oauth2.authorizationUrl) || '';
        request.oauth2.clientId = _interpolate(request.oauth2.clientId) || '';
        request.oauth2.scope = _interpolate(request.oauth2.scope) || '';
        request.oauth2.state = _interpolate(request.oauth2.state) || '';
        request.oauth2.credentialsId = _interpolate(request.oauth2.credentialsId) || '';
        request.oauth2.tokenPlacement = _interpolate(request.oauth2.tokenPlacement) || '';
        request.oauth2.tokenHeaderPrefix = _interpolate(request.oauth2.tokenHeaderPrefix) || '';
        request.oauth2.tokenQueryKey = _interpolate(request.oauth2.tokenQueryKey) || '';
        request.oauth2.autoFetchToken = _interpolate(request.oauth2.autoFetchToken);
        break;
      case 'authorization_code':
        request.oauth2.callbackUrl = _interpolate(request.oauth2.callbackUrl) || '';
        request.oauth2.authorizationUrl = _interpolate(request.oauth2.authorizationUrl) || '';
        request.oauth2.accessTokenUrl = _interpolate(request.oauth2.accessTokenUrl) || '';
        request.oauth2.refreshTokenUrl = _interpolate(request.oauth2.refreshTokenUrl) || '';
        request.oauth2.clientId = _interpolate(request.oauth2.clientId) || '';
        request.oauth2.clientSecret = _interpolate(request.oauth2.clientSecret) || '';
        request.oauth2.scope = _interpolate(request.oauth2.scope) || '';
        request.oauth2.state = _interpolate(request.oauth2.state) || '';
        request.oauth2.pkce = _interpolate(request.oauth2.pkce) || false;
        request.oauth2.credentialsPlacement = _interpolate(request.oauth2.credentialsPlacement) || '';
        request.oauth2.credentialsId = _interpolate(request.oauth2.credentialsId) || '';
        request.oauth2.tokenPlacement = _interpolate(request.oauth2.tokenPlacement) || '';
        request.oauth2.tokenHeaderPrefix = _interpolate(request.oauth2.tokenHeaderPrefix) || '';
        request.oauth2.tokenQueryKey = _interpolate(request.oauth2.tokenQueryKey) || '';
        request.oauth2.autoFetchToken = _interpolate(request.oauth2.autoFetchToken);
        request.oauth2.autoRefreshToken = _interpolate(request.oauth2.autoRefreshToken);
        break;
      case 'client_credentials':
        request.oauth2.accessTokenUrl = _interpolate(request.oauth2.accessTokenUrl) || '';
        request.oauth2.refreshTokenUrl = _interpolate(request.oauth2.refreshTokenUrl) || '';
        request.oauth2.clientId = _interpolate(request.oauth2.clientId) || '';
        request.oauth2.clientSecret = _interpolate(request.oauth2.clientSecret) || '';
        request.oauth2.scope = _interpolate(request.oauth2.scope) || '';
        request.oauth2.credentialsPlacement = _interpolate(request.oauth2.credentialsPlacement) || '';
        request.oauth2.credentialsId = _interpolate(request.oauth2.credentialsId) || '';
        request.oauth2.tokenPlacement = _interpolate(request.oauth2.tokenPlacement) || '';
        request.oauth2.tokenHeaderPrefix = _interpolate(request.oauth2.tokenHeaderPrefix) || '';
        request.oauth2.tokenQueryKey = _interpolate(request.oauth2.tokenQueryKey) || '';
        request.oauth2.autoFetchToken = _interpolate(request.oauth2.autoFetchToken);
        request.oauth2.autoRefreshToken = _interpolate(request.oauth2.autoRefreshToken);
        break;
    }

    // Interpolate additional parameters for all OAuth2 grant types
    if (request.oauth2.additionalParameters) {
      // Interpolate authorization parameters
      if (Array.isArray(request.oauth2.additionalParameters.authorization)) {
        request.oauth2.additionalParameters.authorization.forEach((param: { name?: string; value?: string; enabled?: boolean }) => {
          if (param && param.enabled !== false) {
            param.name = (_interpolate(param.name) || '') as string;
            param.value = (_interpolate(param.value) || '') as string;
          }
        });
      }

      // Interpolate token parameters
      if (Array.isArray(request.oauth2.additionalParameters.token)) {
        request.oauth2.additionalParameters.token.forEach((param: { name?: string; value?: string; enabled?: boolean }) => {
          if (param && param.enabled !== false) {
            param.name = (_interpolate(param.name) || '') as string;
            param.value = (_interpolate(param.value) || '') as string;
          }
        });
      }

      // Interpolate refresh parameters
      if (Array.isArray(request.oauth2.additionalParameters.refresh)) {
        request.oauth2.additionalParameters.refresh.forEach((param: { name?: string; value?: string; enabled?: boolean }) => {
          if (param && param.enabled !== false) {
            param.name = (_interpolate(param.name) || '') as string;
            param.value = (_interpolate(param.value) || '') as string;
          }
        });
      }
    }
  }

  // interpolate vars for aws sigv4 auth
  if (request.awsv4config) {
    request.awsv4config.accessKeyId = _interpolate(request.awsv4config.accessKeyId) || '';
    request.awsv4config.secretAccessKey = _interpolate(request.awsv4config.secretAccessKey) || '';
    request.awsv4config.sessionToken = _interpolate(request.awsv4config.sessionToken) || '';
    request.awsv4config.service = _interpolate(request.awsv4config.service) || '';
    request.awsv4config.region = _interpolate(request.awsv4config.region) || '';
    request.awsv4config.profileName = _interpolate(request.awsv4config.profileName) || '';
  }

  // interpolate vars for digest auth
  if (request.digestConfig) {
    request.digestConfig.username = _interpolate(request.digestConfig.username) || '';
    request.digestConfig.password = _interpolate(request.digestConfig.password) || '';
  }

  // interpolate vars for wsse auth
  if (request.wsse) {
    request.wsse.username = _interpolate(request.wsse.username) || '';
    request.wsse.password = _interpolate(request.wsse.password) || '';
  }

  // interpolate vars for ntlmConfig auth
  if (request.ntlmConfig) {
    request.ntlmConfig.username = _interpolate(request.ntlmConfig.username) || '';
    request.ntlmConfig.password = _interpolate(request.ntlmConfig.password) || '';
    request.ntlmConfig.domain = _interpolate(request.ntlmConfig.domain) || '';
  }

  // Interpolate auth in BrunoRequest format
  if (request.auth && typeof request.auth === 'object') {
    if (request.auth.basic) {
      request.auth.basic.username = _interpolate(request.auth.basic.username) as string || '';
      request.auth.basic.password = _interpolate(request.auth.basic.password) as string || '';
    }
    if (request.auth.bearer) {
      request.auth.bearer.token = _interpolate(request.auth.bearer.token) as string || '';
    }
    if (request.auth.digest) {
      request.auth.digest.username = _interpolate(request.auth.digest.username) as string || '';
      request.auth.digest.password = _interpolate(request.auth.digest.password) as string || '';
    }
    if (request.auth.apikey) {
      request.auth.apikey.key = _interpolate(request.auth.apikey.key) as string || '';
      request.auth.apikey.value = _interpolate(request.auth.apikey.value) as string || '';
    }
  }

  // Delete auth after setting up auth configs (bruno-electron behavior)
  // But only if basicAuth or other config was set
  if (request.basicAuth || request.digestConfig || request.ntlmConfig || request.awsv4config) {
    if (request?.auth) delete request.auth;
  }

  return request;
};

export default interpolateVars;
export { interpolateVars, InterpolationOptions };
