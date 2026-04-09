/**
 * OAuth2 authorization using system browser.
 * Opens the authorization URL in the user's default browser and listens
 * for the callback via VS Code's URI handler.
 *
 * Supports both authorization code flow (code in query params)
 * and implicit flow (token in URL fragment).
 *
 * For implicit flow, since URI handlers don't receive fragments,
 * we use a local HTTP server to capture the redirect.
 */

import * as vscode from 'vscode';
import * as http from 'http';
import type { OAuthAdditionalParameter } from '@bruno-types/common/auth';

const AUTHORIZATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// --- Module-level state for browser auth tracking ---

let pendingAuthResolve: ((value: AuthorizationResult) => void) | null = null;
let pendingAuthReject: ((reason: Error) => void) | null = null;
let authTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
let localServer: http.Server | null = null;

export function isAuthorizationInProgress(): boolean {
  return pendingAuthResolve !== null;
}

export function cancelAuthorization(): void {
  cleanup();
  if (pendingAuthReject) {
    pendingAuthReject(new Error('Authorization was cancelled by user'));
    pendingAuthResolve = null;
    pendingAuthReject = null;
  }
}

function cleanup(): void {
  if (authTimeoutHandle) {
    clearTimeout(authTimeoutHandle);
    authTimeoutHandle = null;
  }
  if (localServer) {
    localServer.close();
    localServer = null;
  }
}

// --- URI handler for authorization code callback ---

export function createOAuth2UriHandler(): vscode.UriHandler {
  return {
    handleUri(uri: vscode.Uri): void {
      if (!pendingAuthResolve) return;

      const params = new URLSearchParams(uri.query);
      const error = params.get('error');
      if (error) {
        const desc = params.get('error_description') || error;
        cleanup();
        pendingAuthReject?.(new Error(`OAuth2 authorization error: ${desc}`));
        pendingAuthResolve = null;
        pendingAuthReject = null;
        return;
      }

      const code = params.get('code');
      if (code) {
        cleanup();
        pendingAuthResolve({ authorizationCode: code });
        pendingAuthResolve = null;
        pendingAuthReject = null;
        return;
      }

      // For implicit flow via URI handler (unlikely since fragments aren't forwarded)
      const accessToken = params.get('access_token');
      if (accessToken) {
        cleanup();
        pendingAuthResolve({
          implicitTokens: {
            access_token: accessToken,
            token_type: params.get('token_type') || 'Bearer',
            expires_in: params.get('expires_in') || undefined,
            scope: params.get('scope') || undefined,
            state: params.get('state') || undefined
          }
        });
        pendingAuthResolve = null;
        pendingAuthReject = null;
      }
    }
  };
}

// --- Types ---

export interface AuthorizationResult {
  authorizationCode?: string;
  implicitTokens?: {
    access_token: string;
    token_type: string;
    expires_in?: string;
    scope?: string;
    state?: string;
  };
}

interface AuthorizationCodeOptions {
  authorizationUrl: string;
  callbackUrl: string;
  clientId: string;
  scope?: string;
  state?: string;
  pkce?: boolean;
  codeChallenge?: string;
  additionalParameters?: OAuthAdditionalParameter[];
}

interface ImplicitFlowOptions {
  authorizationUrl: string;
  callbackUrl: string;
  clientId: string;
  scope?: string;
  state?: string;
  additionalParameters?: OAuthAdditionalParameter[];
}

export async function getOAuth2AuthorizationCode(options: AuthorizationCodeOptions): Promise<AuthorizationResult> {
  if (isAuthorizationInProgress()) {
    throw new Error('An OAuth2 authorization request is already in progress');
  }

  const { authorizationUrl, callbackUrl, clientId, scope, state, pkce, codeChallenge, additionalParameters } = options;

  const url = new URL(authorizationUrl);
  url.searchParams.append('response_type', 'code');
  url.searchParams.append('client_id', clientId);

  if (callbackUrl) {
    url.searchParams.append('redirect_uri', callbackUrl);
  }
  if (scope) {
    url.searchParams.append('scope', scope);
  }
  if (state) {
    url.searchParams.append('state', state);
  }
  if (pkce && codeChallenge) {
    url.searchParams.append('code_challenge', codeChallenge);
    url.searchParams.append('code_challenge_method', 'S256');
  }

  // Apply additional authorization parameters (queryparams only for auth URL)
  if (additionalParameters?.length) {
    additionalParameters.forEach((param) => {
      if (param.enabled && param.name && param.sendIn === 'queryparams') {
        url.searchParams.append(param.name, param.value || '');
      }
    });
  }

  return openBrowserAndWaitForCallback(url.toString());
}

export async function getOAuth2ImplicitToken(options: ImplicitFlowOptions): Promise<AuthorizationResult> {
  if (isAuthorizationInProgress()) {
    throw new Error('An OAuth2 authorization request is already in progress');
  }

  const { authorizationUrl, callbackUrl, clientId, scope, state, additionalParameters } = options;

  const url = new URL(authorizationUrl);
  url.searchParams.append('response_type', 'token');
  url.searchParams.append('client_id', clientId);

  if (callbackUrl) {
    url.searchParams.append('redirect_uri', callbackUrl);
  }
  if (scope) {
    url.searchParams.append('scope', scope);
  }
  if (state) {
    url.searchParams.append('state', state);
  }

  if (additionalParameters?.length) {
    additionalParameters.forEach((param) => {
      if (param.enabled && param.name && param.sendIn === 'queryparams') {
        url.searchParams.append(param.name, param.value || '');
      }
    });
  }

  return openBrowserAndWaitForCallback(url.toString());
}

async function openBrowserAndWaitForCallback(authorizeUrl: string): Promise<AuthorizationResult> {
  return new Promise<AuthorizationResult>((resolve, reject) => {
    pendingAuthResolve = resolve;
    pendingAuthReject = reject;

    authTimeoutHandle = setTimeout(() => {
      cleanup();
      pendingAuthResolve = null;
      pendingAuthReject = null;
      reject(new Error('OAuth2 authorization timed out after 5 minutes'));
    }, AUTHORIZATION_TIMEOUT_MS);

    vscode.env.openExternal(vscode.Uri.parse(authorizeUrl)).then((opened) => {
      if (!opened) {
        cleanup();
        pendingAuthResolve = null;
        pendingAuthReject = null;
        reject(new Error('Failed to open authorization URL in system browser'));
      }
    });
  });
}