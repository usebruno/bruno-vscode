import axios, { AxiosRequestConfig, ResponseType } from 'axios';
import crypto from 'crypto';
import qs from 'qs';
import Oauth2Store from '../store/oauth2';
import type { OAuth2, OAuthAdditionalParameter } from '@bruno-types/common/auth';
import {
  getOAuth2AuthorizationCode,
  getOAuth2ImplicitToken,
  type AuthorizationResult
} from '../ipc/network/authorize-user-in-system-browser';

const BRUNO_OAUTH2_CALLBACK_URL = 'https://oauth.usebruno.com/callback';

const oauth2Store = new Oauth2Store();

// --- Types ---

export interface OAuth2TokenResult {
  collectionUid: string;
  url: string;
  credentials: Record<string, unknown> | null;
  credentialsId: string;
  error?: string;
  debugInfo?: { data: unknown[] };
}

interface TokenRequestConfig {
  method: string;
  url: string;
  headers: Record<string, string>;
  data: string;
  responseType: ResponseType;
}

// --- Store wrappers ---

export const persistOauth2Credentials = ({ collectionUid, url, credentials, credentialsId }: {
  collectionUid: string;
  url: string;
  credentials: Record<string, unknown>;
  credentialsId: string;
}): void => {
  if ((credentials as any)?.error || !(credentials as any)?.access_token) return;
  const enhancedCredentials = {
    ...credentials,
    created_at: Date.now()
  };
  oauth2Store.updateCredentialsForCollection({ collectionUid, url, credentials: enhancedCredentials, credentialsId });
};

export const clearOauth2Credentials = ({ collectionUid, url, credentialsId }: {
  collectionUid: string;
  url: string;
  credentialsId: string;
}): void => {
  oauth2Store.clearCredentialsForCollection({ collectionUid, url, credentialsId });
};

export const getStoredOauth2Credentials = ({ collectionUid, url, credentialsId }: {
  collectionUid: string;
  url: string;
  credentialsId: string;
}): Record<string, unknown> | null => {
  try {
    return oauth2Store.getCredentialsForCollection({ collectionUid, url, credentialsId }) as Record<string, unknown> | null;
  } catch {
    return null;
  }
};

// --- Token expiry ---

export const isTokenExpired = (credentials: Record<string, unknown> | null): boolean => {
  if (!credentials?.access_token) {
    return true;
  }
  if (!credentials?.expires_in || !credentials.created_at) {
    return false;
  }
  const expiryTime = (credentials.created_at as number) + (credentials.expires_in as number) * 1000;
  return Date.now() > expiryTime;
};

// --- PKCE helpers ---

export const generateCodeVerifier = (): string => {
  return crypto.randomBytes(22).toString('hex');
};

export const generateCodeChallenge = (codeVerifier: string): string => {
  const hash = crypto.createHash('sha256');
  hash.update(codeVerifier);
  return hash.digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

// --- Additional parameters ---

export const applyAdditionalParameters = (
  requestConfig: { url: string; headers: Record<string, string> },
  data: Record<string, string>,
  params: OAuthAdditionalParameter[] = []
): void => {
  params.forEach((param) => {
    if (!param.enabled || !param.name) return;

    switch (param.sendIn) {
      case 'headers':
        requestConfig.headers[param.name] = param.value || '';
        break;
      case 'queryparams':
        try {
          const url = new URL(requestConfig.url);
          url.searchParams.append(param.name, param.value || '');
          requestConfig.url = url.href;
        } catch {
          console.error('invalid token/refresh url', requestConfig.url);
        }
        break;
      case 'body':
        data[param.name] = param.value || '';
        break;
    }
  });
};

// --- Safe JSON parsing ---

const safeParseJSONBuffer = (data: unknown): Record<string, unknown> | null => {
  try {
    const str = Buffer.isBuffer(data) ? data.toString() : data;
    return typeof str === 'string' ? JSON.parse(str) : str as Record<string, unknown>;
  } catch {
    return null;
  }
};

// --- Token fetching core ---

const fetchTokenFromUrl = async (requestConfig: TokenRequestConfig): Promise<{ credentials: Record<string, unknown> | null; requestDetails: Record<string, unknown> }> => {
  let requestDetails: Record<string, unknown> = { request: {}, response: {} };
  let parsedResponseData: Record<string, unknown> | null = null;

  try {
    const response = await axios(requestConfig as AxiosRequestConfig);
    parsedResponseData = safeParseJSONBuffer(response.data);
    requestDetails = {
      request: {
        url: requestConfig.url,
        headers: requestConfig.headers,
        data: requestConfig.data,
        method: 'POST'
      },
      response: {
        url: response.config?.url,
        headers: response.headers,
        data: parsedResponseData,
        status: response.status,
        statusText: response.statusText
      },
      requestId: Date.now().toString(),
      fromCache: false,
      completed: true
    };
  } catch (error: any) {
    if (error.response) {
      const errorData = safeParseJSONBuffer(error.response.data);
      requestDetails = {
        request: {
          url: requestConfig.url,
          headers: requestConfig.headers,
          data: requestConfig.data,
          method: 'POST'
        },
        response: {
          url: error.response.config?.url,
          headers: error.response.headers,
          data: errorData,
          status: error.response.status,
          statusText: error.response.statusText,
          error: errorData
        },
        requestId: Date.now().toString(),
        fromCache: false,
        completed: true
      };
      parsedResponseData = errorData;
    } else {
      requestDetails = {
        request: {
          url: requestConfig.url,
          headers: requestConfig.headers,
          data: requestConfig.data
        },
        response: {
          status: '-',
          statusText: error?.code || 'Unknown error',
          headers: {},
          data: null
        },
        requestId: Date.now().toString(),
        fromCache: false,
        completed: true
      };
    }
  }

  return { credentials: parsedResponseData, requestDetails };
};

// --- Build request config helpers ---

const buildBaseRequestConfig = (url: string): TokenRequestConfig => ({
  method: 'POST',
  url,
  headers: {
    'content-type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json'
  },
  data: '',
  responseType: 'arraybuffer'
});

const applyBasicAuthHeader = (headers: Record<string, string>, clientId: string, clientSecret?: string | null): void => {
  const secret = clientSecret ?? '';
  headers['Authorization'] = `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`;
};

const applyClientCredentialsToData = (
  data: Record<string, string>,
  clientId: string,
  clientSecret: string | undefined | null,
  credentialsPlacement: string
): void => {
  if (credentialsPlacement !== 'basic_auth_header') {
    data.client_id = clientId;
  }
  if (clientSecret && clientSecret.trim() !== '' && credentialsPlacement !== 'basic_auth_header') {
    data.client_secret = clientSecret;
  }
};

// --- Cached token resolution ---

const resolveStoredCredentials = async ({
  collectionUid,
  url,
  credentialsId,
  autoRefreshToken,
  autoFetchToken,
  requestCopy,
  forceFetch
}: {
  collectionUid: string;
  url: string;
  credentialsId: string;
  autoRefreshToken?: boolean;
  autoFetchToken?: boolean;
  requestCopy?: Record<string, unknown>;
  forceFetch: boolean;
}): Promise<{ shouldFetch: boolean; result?: OAuth2TokenResult }> => {
  if (forceFetch) return { shouldFetch: true };

  const storedCredentials = getStoredOauth2Credentials({ collectionUid, url, credentialsId });

  if (storedCredentials) {
    if (!isTokenExpired(storedCredentials)) {
      return { shouldFetch: false, result: { collectionUid, url, credentials: storedCredentials, credentialsId } };
    }

    // Token is expired
    if (autoRefreshToken && storedCredentials.refresh_token && requestCopy) {
      try {
        const refreshed = await refreshOauth2Token({ requestCopy, collectionUid });
        return { shouldFetch: false, result: { collectionUid, url, credentials: refreshed.credentials, credentialsId } };
      } catch {
        clearOauth2Credentials({ collectionUid, url, credentialsId });
        if (autoFetchToken) return { shouldFetch: true };
        return { shouldFetch: false, result: { collectionUid, url, credentials: storedCredentials, credentialsId } };
      }
    } else if (autoRefreshToken && !storedCredentials.refresh_token) {
      if (autoFetchToken) {
        clearOauth2Credentials({ collectionUid, url, credentialsId });
        return { shouldFetch: true };
      }
      return { shouldFetch: false, result: { collectionUid, url, credentials: storedCredentials, credentialsId } };
    } else if (!autoRefreshToken && autoFetchToken) {
      clearOauth2Credentials({ collectionUid, url, credentialsId });
      return { shouldFetch: true };
    }
    // No auto-refresh, no auto-fetch: return expired token
    return { shouldFetch: false, result: { collectionUid, url, credentials: storedCredentials, credentialsId } };
  }

  // No stored credentials
  if (autoFetchToken) return { shouldFetch: true };
  return { shouldFetch: false, result: { collectionUid, url, credentials: null, credentialsId } };
};

// --- Grant type implementations ---

export const getOAuth2TokenUsingClientCredentials = async ({ request, collectionUid, forceFetch = false }: {
  request: Record<string, unknown>;
  collectionUid: string;
  forceFetch?: boolean;
}): Promise<OAuth2TokenResult> => {
  const oAuth = (request.oauth2 || {}) as OAuth2;
  const {
    clientId,
    clientSecret,
    scope,
    credentialsPlacement = 'basic_auth_header',
    credentialsId = 'default',
    autoRefreshToken,
    autoFetchToken,
    additionalParameters
  } = oAuth;
  const url = oAuth.accessTokenUrl;

  if (!url) {
    return { error: 'Access Token URL is required for OAuth2 client credentials flow', credentials: null, url: url || '', credentialsId: credentialsId || 'default', collectionUid };
  }
  if (!clientId) {
    return { error: 'Client ID is required for OAuth2 client credentials flow', credentials: null, url, credentialsId: credentialsId || 'default', collectionUid };
  }

  const resolved = await resolveStoredCredentials({
    collectionUid, url, credentialsId: credentialsId || 'default',
    autoRefreshToken: autoRefreshToken ?? undefined,
    autoFetchToken: autoFetchToken ?? undefined,
    requestCopy: request, forceFetch
  });
  if (!resolved.shouldFetch && resolved.result) return resolved.result;

  // Fetch new token
  const requestConfig = buildBaseRequestConfig(url);
  if (credentialsPlacement === 'basic_auth_header') {
    applyBasicAuthHeader(requestConfig.headers, clientId, clientSecret);
  }

  const data: Record<string, string> = { grant_type: 'client_credentials' };
  applyClientCredentialsToData(data, clientId, clientSecret, credentialsPlacement || 'basic_auth_header');
  if (scope && scope.trim() !== '') data.scope = scope;

  if (additionalParameters?.token?.length) {
    applyAdditionalParameters(requestConfig, data, additionalParameters.token as OAuthAdditionalParameter[]);
  }
  requestConfig.data = qs.stringify(data);

  const debugInfo: { data: unknown[] } = { data: [] };
  const { credentials, requestDetails } = await fetchTokenFromUrl(requestConfig);
  debugInfo.data.push(requestDetails);

  if (credentials) {
    persistOauth2Credentials({ collectionUid, url, credentials, credentialsId: credentialsId || 'default' });
  }
  return { collectionUid, url, credentials, credentialsId: credentialsId || 'default', debugInfo };
};

export const getOAuth2TokenUsingPasswordCredentials = async ({ request, collectionUid, forceFetch = false }: {
  request: Record<string, unknown>;
  collectionUid: string;
  forceFetch?: boolean;
}): Promise<OAuth2TokenResult> => {
  const oAuth = (request.oauth2 || {}) as OAuth2;
  const {
    username,
    password,
    clientId,
    clientSecret,
    scope,
    credentialsPlacement = 'basic_auth_header',
    credentialsId = 'default',
    autoRefreshToken,
    autoFetchToken,
    additionalParameters
  } = oAuth;
  const url = oAuth.accessTokenUrl;

  if (!url) {
    return { error: 'Access Token URL is required for OAuth2 password credentials flow', credentials: null, url: url || '', credentialsId: credentialsId || 'default', collectionUid };
  }
  if (!username) {
    return { error: 'Username is required for OAuth2 password credentials flow', credentials: null, url, credentialsId: credentialsId || 'default', collectionUid };
  }
  if (!password) {
    return { error: 'Password is required for OAuth2 password credentials flow', credentials: null, url, credentialsId: credentialsId || 'default', collectionUid };
  }
  if (!clientId) {
    return { error: 'Client ID is required for OAuth2 password credentials flow', credentials: null, url, credentialsId: credentialsId || 'default', collectionUid };
  }

  const resolved = await resolveStoredCredentials({
    collectionUid, url, credentialsId: credentialsId || 'default',
    autoRefreshToken: autoRefreshToken ?? undefined,
    autoFetchToken: autoFetchToken ?? undefined,
    requestCopy: request, forceFetch
  });
  if (!resolved.shouldFetch && resolved.result) return resolved.result;

  // Fetch new token
  const requestConfig = buildBaseRequestConfig(url);
  if (credentialsPlacement === 'basic_auth_header') {
    applyBasicAuthHeader(requestConfig.headers, clientId, clientSecret);
  }

  const data: Record<string, string> = {
    grant_type: 'password',
    username,
    password
  };
  applyClientCredentialsToData(data, clientId, clientSecret, credentialsPlacement || 'basic_auth_header');
  if (scope && scope.trim() !== '') data.scope = scope;

  if (additionalParameters?.token?.length) {
    applyAdditionalParameters(requestConfig, data, additionalParameters.token as OAuthAdditionalParameter[]);
  }
  requestConfig.data = qs.stringify(data);

  const debugInfo: { data: unknown[] } = { data: [] };
  const { credentials, requestDetails } = await fetchTokenFromUrl(requestConfig);
  debugInfo.data.push(requestDetails);

  if (credentials) {
    persistOauth2Credentials({ collectionUid, url, credentials, credentialsId: credentialsId || 'default' });
  }
  return { collectionUid, url, credentials, credentialsId: credentialsId || 'default', debugInfo };
};

// --- Authorization code grant ---

export const getOAuth2TokenUsingAuthorizationCode = async ({ request, collectionUid, forceFetch = false }: {
  request: Record<string, unknown>;
  collectionUid: string;
  forceFetch?: boolean;
}): Promise<OAuth2TokenResult> => {
  const oAuth = (request.oauth2 || {}) as OAuth2;
  const {
    clientId,
    clientSecret,
    callbackUrl,
    scope,
    state,
    pkce,
    credentialsPlacement = 'basic_auth_header',
    authorizationUrl,
    credentialsId = 'default',
    autoRefreshToken,
    autoFetchToken,
    additionalParameters
  } = oAuth;
  const effectiveCallbackUrl = callbackUrl && callbackUrl.length ? callbackUrl : BRUNO_OAUTH2_CALLBACK_URL;
  const url = oAuth.accessTokenUrl;

  if (!authorizationUrl) {
    return { error: 'Authorization URL is required for OAuth2 authorization code flow', credentials: null, url: url || '', credentialsId: credentialsId || 'default', collectionUid };
  }
  if (!url) {
    return { error: 'Access Token URL is required for OAuth2 authorization code flow', credentials: null, url: authorizationUrl, credentialsId: credentialsId || 'default', collectionUid };
  }
  if (!clientId) {
    return { error: 'Client ID is required for OAuth2 authorization code flow', credentials: null, url, credentialsId: credentialsId || 'default', collectionUid };
  }

  const resolved = await resolveStoredCredentials({
    collectionUid, url, credentialsId: credentialsId || 'default',
    autoRefreshToken: autoRefreshToken ?? undefined,
    autoFetchToken: autoFetchToken ?? undefined,
    requestCopy: request, forceFetch
  });
  if (!resolved.shouldFetch && resolved.result) return resolved.result;

  // Generate PKCE values
  let codeVerifier: string | undefined;
  let codeChallenge: string | undefined;
  if (pkce) {
    codeVerifier = generateCodeVerifier();
    codeChallenge = generateCodeChallenge(codeVerifier);
  }

  // Open browser and wait for authorization code
  const authResult: AuthorizationResult = await getOAuth2AuthorizationCode({
    authorizationUrl,
    callbackUrl: effectiveCallbackUrl,
    clientId,
    scope: scope || undefined,
    state: state || undefined,
    pkce: pkce || false,
    codeChallenge,
    additionalParameters: additionalParameters?.authorization as OAuthAdditionalParameter[] || undefined
  });

  if (!authResult.authorizationCode) {
    return { error: 'No authorization code received', credentials: null, url, credentialsId: credentialsId || 'default', collectionUid };
  }

  // Exchange authorization code for token
  const requestConfig = buildBaseRequestConfig(url);
  if (credentialsPlacement === 'basic_auth_header') {
    applyBasicAuthHeader(requestConfig.headers, clientId, clientSecret);
  }

  const data: Record<string, string> = {
    grant_type: 'authorization_code',
    code: authResult.authorizationCode,
    redirect_uri: effectiveCallbackUrl
  };
  applyClientCredentialsToData(data, clientId, clientSecret, credentialsPlacement || 'basic_auth_header');
  if (pkce && codeVerifier) {
    data.code_verifier = codeVerifier;
  }

  if (additionalParameters?.token?.length) {
    applyAdditionalParameters(requestConfig, data, additionalParameters.token as OAuthAdditionalParameter[]);
  }
  requestConfig.data = qs.stringify(data);

  const debugInfo: { data: unknown[] } = { data: [] };
  const { credentials, requestDetails } = await fetchTokenFromUrl(requestConfig);
  debugInfo.data.push(requestDetails);

  if (credentials) {
    persistOauth2Credentials({ collectionUid, url, credentials, credentialsId: credentialsId || 'default' });
  }
  return { collectionUid, url, credentials, credentialsId: credentialsId || 'default', debugInfo };
};

// --- Implicit grant ---

export const getOAuth2TokenUsingImplicitGrant = async ({ request, collectionUid, forceFetch = false }: {
  request: Record<string, unknown>;
  collectionUid: string;
  forceFetch?: boolean;
}): Promise<OAuth2TokenResult> => {
  const oAuth = (request.oauth2 || {}) as OAuth2;
  const {
    authorizationUrl,
    clientId,
    scope,
    state,
    callbackUrl,
    credentialsId = 'default',
    autoFetchToken,
    additionalParameters
  } = oAuth;
  const effectiveCallbackUrl = callbackUrl && callbackUrl.length ? callbackUrl : BRUNO_OAUTH2_CALLBACK_URL;

  if (!authorizationUrl) {
    return { error: 'Authorization URL is required for OAuth2 implicit flow', credentials: null, url: authorizationUrl || '', credentialsId: credentialsId || 'default', collectionUid };
  }

  // Check stored credentials
  if (!forceFetch) {
    const stored = getStoredOauth2Credentials({ collectionUid, url: authorizationUrl, credentialsId: credentialsId || 'default' });
    if (stored) {
      if (!isTokenExpired(stored)) {
        return { collectionUid, url: authorizationUrl, credentials: stored, credentialsId: credentialsId || 'default' };
      }
      // Expired — implicit flow has no refresh tokens
      if (autoFetchToken) {
        clearOauth2Credentials({ collectionUid, url: authorizationUrl, credentialsId: credentialsId || 'default' });
      } else {
        return { collectionUid, url: authorizationUrl, credentials: stored, credentialsId: credentialsId || 'default' };
      }
    } else if (!autoFetchToken) {
      return { collectionUid, url: authorizationUrl, credentials: null, credentialsId: credentialsId || 'default' };
    }
  }

  // Open browser for implicit flow
  const authResult: AuthorizationResult = await getOAuth2ImplicitToken({
    authorizationUrl,
    callbackUrl: effectiveCallbackUrl,
    clientId: clientId || '',
    scope: scope || undefined,
    state: state || undefined,
    additionalParameters: additionalParameters?.authorization as OAuthAdditionalParameter[] || undefined
  });

  if (!authResult.implicitTokens?.access_token) {
    return { error: 'No access token received from authorization server', credentials: null, url: authorizationUrl, credentialsId: credentialsId || 'default', collectionUid };
  }

  const credentials: Record<string, unknown> = {
    access_token: authResult.implicitTokens.access_token,
    token_type: authResult.implicitTokens.token_type || 'Bearer',
    state: authResult.implicitTokens.state || '',
    ...(authResult.implicitTokens.expires_in ? { expires_in: parseInt(authResult.implicitTokens.expires_in) } : {}),
    ...(authResult.implicitTokens.scope ? { scope: authResult.implicitTokens.scope } : {}),
    created_at: Date.now()
  };

  persistOauth2Credentials({ collectionUid, url: authorizationUrl, credentials, credentialsId: credentialsId || 'default' });
  return { collectionUid, url: authorizationUrl, credentials, credentialsId: credentialsId || 'default' };
};

// --- Refresh token ---

export const refreshOauth2Token = async ({ requestCopy, collectionUid }: {
  requestCopy: Record<string, unknown>;
  collectionUid: string;
}): Promise<OAuth2TokenResult> => {
  const oAuth = (requestCopy.oauth2 || {}) as OAuth2;
  const { clientId, clientSecret, credentialsId = 'default', credentialsPlacement, additionalParameters } = oAuth;
  const url = oAuth.refreshTokenUrl || oAuth.accessTokenUrl;

  if (!url) {
    return { collectionUid, url: '', credentials: null, credentialsId: credentialsId || 'default' };
  }

  const credentials = getStoredOauth2Credentials({ collectionUid, url, credentialsId: credentialsId || 'default' });
  if (!credentials?.refresh_token) {
    clearOauth2Credentials({ collectionUid, url, credentialsId: credentialsId || 'default' });
    return { collectionUid, url, credentials: null, credentialsId: credentialsId || 'default' };
  }

  const requestConfig = buildBaseRequestConfig(url);
  if (credentialsPlacement === 'basic_auth_header' && clientId) {
    applyBasicAuthHeader(requestConfig.headers, clientId, clientSecret);
  }

  const data: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: credentials.refresh_token as string
  };
  if (clientId) {
    applyClientCredentialsToData(data, clientId, clientSecret, credentialsPlacement || 'basic_auth_header');
  }

  if (additionalParameters?.refresh?.length) {
    applyAdditionalParameters(requestConfig, data, additionalParameters.refresh as OAuthAdditionalParameter[]);
  }
  requestConfig.data = qs.stringify(data);

  const debugInfo: { data: unknown[] } = { data: [] };
  const { credentials: newCredentials, requestDetails } = await fetchTokenFromUrl(requestConfig);
  debugInfo.data.push(requestDetails);

  if (!newCredentials || (newCredentials as any)?.error) {
    clearOauth2Credentials({ collectionUid, url, credentialsId: credentialsId || 'default' });
    return { collectionUid, url, credentials: null, credentialsId: credentialsId || 'default', debugInfo };
  }

  persistOauth2Credentials({ collectionUid, url, credentials: newCredentials, credentialsId: credentialsId || 'default' });
  return { collectionUid, url, credentials: newCredentials, credentialsId: credentialsId || 'default', debugInfo };
};

// --- Token placement ---

export const placeOAuth2Token = (
  request: { headers?: Record<string, string>; url?: string },
  credentials: Record<string, unknown>,
  oauth2Config: OAuth2
): void => {
  const { tokenPlacement, tokenHeaderPrefix = 'Bearer', tokenQueryKey = 'access_token' } = oauth2Config;
  const tokenSource = (oauth2Config as any).tokenSource || 'access_token';
  const tokenValue = tokenSource === 'id_token'
    ? (credentials.id_token as string)
    : (credentials.access_token as string);

  if (!tokenValue) return;

  if (tokenPlacement === 'header' || !tokenPlacement) {
    if (!request.headers) request.headers = {};
    const prefix = tokenHeaderPrefix || 'Bearer';
    request.headers['Authorization'] = `${prefix} ${tokenValue}`.trim();
  } else {
    // Query parameter placement
    const key = tokenQueryKey || 'access_token';
    try {
      const url = new URL(request.url || '');
      url.searchParams.append(key, tokenValue);
      request.url = url.href;
    } catch {
      // If URL parsing fails, append manually
      const separator = request.url?.includes('?') ? '&' : '?';
      request.url = `${request.url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(tokenValue)}`;
    }
  }
};

export {
  BRUNO_OAUTH2_CALLBACK_URL,
  oauth2Store
};
