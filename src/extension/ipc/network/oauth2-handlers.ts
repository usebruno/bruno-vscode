import { registerHandler } from '../handlers';
import {
  getOAuth2TokenUsingClientCredentials,
  getOAuth2TokenUsingPasswordCredentials,
  getOAuth2TokenUsingAuthorizationCode,
  getOAuth2TokenUsingImplicitGrant,
  refreshOauth2Token,
  clearOauth2Credentials,
  getStoredOauth2Credentials,
  isTokenExpired,
  placeOAuth2Token,
  OAuth2TokenResult
} from '../../utils/oauth2';
import { isAuthorizationInProgress, cancelAuthorization } from './authorize-user-in-system-browser';
import { interpolate } from '@usebruno/common';
import { cloneDeep } from 'lodash';
import type { OAuth2 } from '@bruno-types/common/auth';

export function registerOAuth2Handlers(): void {
  // Fetch credentials (all grant types)
  registerHandler('renderer:fetch-oauth2-credentials', async (args) => {
    const [payload] = args as [{ itemUid: string; request: Record<string, unknown>; collection: Record<string, unknown> }];
    const { request, collection } = payload;
    const collectionUid = (collection as any)?.uid || (collection as any)?.collectionUid || '';

    // Interpolate OAuth2 config before token fetch (resolves {{variables}})
    const interpolatedRequest = interpolateOAuth2Config(request);
    const oauth2Config = (interpolatedRequest as any)?.oauth2 || {};
    const grantType = oauth2Config.grantType;

    switch (grantType) {
      case 'client_credentials':
        return getOAuth2TokenUsingClientCredentials({ request: interpolatedRequest, collectionUid, forceFetch: true });
      case 'password':
        return getOAuth2TokenUsingPasswordCredentials({ request: interpolatedRequest, collectionUid, forceFetch: true });
      case 'authorization_code':
        return getOAuth2TokenUsingAuthorizationCode({ request: interpolatedRequest, collectionUid, forceFetch: true });
      case 'implicit':
        return getOAuth2TokenUsingImplicitGrant({ request: interpolatedRequest, collectionUid, forceFetch: true });
      default:
        throw new Error(`Unsupported OAuth2 grant type: ${grantType}`);
    }
  });

  // Refresh credentials
  registerHandler('renderer:refresh-oauth2-credentials', async (args) => {
    const [payload] = args as [{ itemUid: string; request: Record<string, unknown>; collection: Record<string, unknown> }];
    const { request, collection } = payload;
    const collectionUid = (collection as any)?.uid || (collection as any)?.collectionUid || '';
    return refreshOauth2Token({ requestCopy: request, collectionUid });
  });

  // Clear cached credentials
  registerHandler('clear-oauth2-cache', async (args) => {
    const [collectionUid, url, credentialsId] = args as [string, string, string];
    clearOauth2Credentials({ collectionUid, url, credentialsId });
  });

  // Check if browser authorization is in progress
  registerHandler('renderer:is-oauth2-authorization-request-in-progress', async () => {
    return isAuthorizationInProgress();
  });

  // Cancel pending browser authorization
  registerHandler('renderer:cancel-oauth2-authorization-request', async () => {
    cancelAuthorization();
  });
}

/**
 * Interpolate OAuth2 config values using the request's variable context.
 * The main interpolateVars call handles the request URL/headers/body, but
 * nested auth.oauth2 fields (accessTokenUrl, clientId, etc.) need separate
 * interpolation before we use them for token fetching.
 */
function interpolateOAuth2Config(request: Record<string, unknown>): Record<string, unknown> {
  const requestCopy = cloneDeep(request);
  const oauth2 = ((requestCopy.auth as any)?.oauth2 || requestCopy.oauth2) as Record<string, unknown> | undefined;
  if (!oauth2) return requestCopy;

  // Build the variable context from the request (same sources as interpolateVars)
  // Flatten vars.req array into a key-value map (request variables defined in the Vars tab)
  const varsReq = ((requestCopy as any)?.vars?.req || (requestCopy as any)?.auth?.oauth2?.vars?.req || []) as Array<{ name: string; value: string; enabled?: boolean }>;
  const flattenedRequestVars: Record<string, unknown> = {};
  for (const v of varsReq) {
    if (v.enabled !== false && v.name) {
      flattenedRequestVars[v.name] = v.value;
    }
  }

  const vars: Record<string, unknown> = {
    ...(requestCopy.globalEnvironmentVariables as Record<string, unknown> || {}),
    ...(requestCopy.collectionVariables as Record<string, unknown> || {}),
    ...(requestCopy.folderVariables as Record<string, unknown> || {}),
    ...(requestCopy.requestVariables as Record<string, unknown> || {}),
    ...flattenedRequestVars,
    ...(requestCopy.oauth2CredentialVariables as Record<string, unknown> || {}),
  };

  // Interpolate all string values in the oauth2 config
  const fieldsToInterpolate = [
    'accessTokenUrl', 'refreshTokenUrl', 'authorizationUrl', 'callbackUrl',
    'clientId', 'clientSecret', 'username', 'password', 'scope', 'state'
  ];

  for (const field of fieldsToInterpolate) {
    if (typeof oauth2[field] === 'string' && (oauth2[field] as string).includes('{{')) {
      oauth2[field] = (interpolate as any)(oauth2[field], vars);
    }
  }

  // Write back interpolated config
  if ((requestCopy.auth as any)?.oauth2) {
    (requestCopy.auth as any).oauth2 = oauth2;
  }
  if (requestCopy.oauth2) {
    requestCopy.oauth2 = oauth2;
  }

  return requestCopy;
}

/**
 * Populate oauth2CredentialVariables on the request after token fetch.
 * Enables {{$oauth2.credentialsId.access_token}} syntax in scripts and tests.
 */
function populateOAuth2CredentialVariables(
  request: Record<string, unknown>,
  credentialsId: string,
  credentials: Record<string, unknown>
): void {
  const vars = (request.oauth2CredentialVariables || {}) as Record<string, unknown>;

  for (const [key, value] of Object.entries(credentials)) {
    vars[`$oauth2.${credentialsId}.${key}`] = value;
  }

  request.oauth2CredentialVariables = vars;
}

/**
 * Apply OAuth2 token to an outgoing request.
 * Called in the execution pipeline after variable interpolation, before prepareRequest.
 *
 * Mirrors the configureRequest logic in the main Bruno repo
 * (packages/bruno-electron/src/ipc/network/index.js lines 170-298).
 *
 * 1. Interpolates OAuth2 config values (accessTokenUrl, clientId, etc.)
 * 2. Checks stored credentials / auto-fetches / auto-refreshes
 * 3. Places the token on the request (header or query param)
 * 4. Populates oauth2CredentialVariables for script access
 */
export async function applyOAuth2ToRequest(
  request: Record<string, unknown>,
  collectionUid: string
): Promise<void> {
  const auth = request.auth as { mode?: string; oauth2?: OAuth2 } | undefined;
  const oauth2Raw = (request.oauth2 as OAuth2 | undefined) || auth?.oauth2;
  if (!oauth2Raw) return;

  // Fix 1: Interpolate OAuth2 config values before using them
  const interpolatedRequest = interpolateOAuth2Config(request);
  const interpolatedAuth = interpolatedRequest.auth as { mode?: string; oauth2?: OAuth2 } | undefined;
  const oauth2 = (interpolatedRequest.oauth2 as OAuth2 | undefined) || interpolatedAuth?.oauth2;
  if (!oauth2) return;

  const { grantType, credentialsId = 'default', autoFetchToken } = oauth2;
  const url = oauth2.accessTokenUrl || '';
  const effectiveCredentialsId = credentialsId || 'default';

  if (!grantType) return;
  // For implicit flow, url may be empty (uses authorizationUrl instead)
  if (!url && grantType !== 'implicit') return;

  let result: OAuth2TokenResult | null = null;

  if (grantType === 'client_credentials' || grantType === 'password') {
    const stored = getStoredOauth2Credentials({ collectionUid, url, credentialsId: effectiveCredentialsId });

    if (stored && !isTokenExpired(stored)) {
      placeOAuth2Token(request as any, stored, oauth2);
      populateOAuth2CredentialVariables(request, effectiveCredentialsId, stored);
      return;
    }

    // Expired or missing — delegate to grant type function (handles auto-refresh/auto-fetch)
    if (grantType === 'client_credentials') {
      result = await getOAuth2TokenUsingClientCredentials({ request: interpolatedRequest, collectionUid });
    } else {
      result = await getOAuth2TokenUsingPasswordCredentials({ request: interpolatedRequest, collectionUid });
    }
  } else if (grantType === 'authorization_code' || grantType === 'implicit') {
    const storedUrl = grantType === 'implicit' ? (oauth2.authorizationUrl || '') : url;
    const stored = getStoredOauth2Credentials({ collectionUid, url: storedUrl, credentialsId: effectiveCredentialsId });

    if (stored && !isTokenExpired(stored)) {
      placeOAuth2Token(request as any, stored, oauth2);
      populateOAuth2CredentialVariables(request, effectiveCredentialsId, stored);
      return;
    }

    // Fix 3: Auto-fetch for browser flows when autoFetchToken is true
    if (autoFetchToken) {
      if (grantType === 'authorization_code') {
        result = await getOAuth2TokenUsingAuthorizationCode({ request: interpolatedRequest, collectionUid });
      } else {
        result = await getOAuth2TokenUsingImplicitGrant({ request: interpolatedRequest, collectionUid });
      }
    } else if (stored) {
      // Return expired token if autoFetchToken is disabled
      placeOAuth2Token(request as any, stored, oauth2);
      populateOAuth2CredentialVariables(request, effectiveCredentialsId, stored);
      return;
    } else {
      return;
    }
  }

  // Fix 2: Place token and populate credential variables for script access
  if (result?.credentials) {
    placeOAuth2Token(request as any, result.credentials, oauth2);
    populateOAuth2CredentialVariables(request, effectiveCredentialsId, result.credentials);

    // Store oauth2Credentials on request for UI to read back
    (request as any).oauth2Credentials = {
      credentials: result.credentials,
      url: result.url,
      collectionUid,
      credentialsId: effectiveCredentialsId,
      debugInfo: result.debugInfo,
      folderUid: (request as any).oauth2Credentials?.folderUid
    };
  }
}
