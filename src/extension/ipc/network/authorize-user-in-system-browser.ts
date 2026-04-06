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

// --- Authorization code flow ---

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

// --- Implicit flow ---

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

  // Implicit flow tokens arrive in the URL fragment (#access_token=...).
  // VS Code URI handlers don't receive fragments, so we use a local HTTP server
  // that serves a page which extracts the fragment and sends it back.
  return openBrowserWithLocalServer(url.toString());
}

// --- Browser + URI handler (for authorization code) ---

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

// --- Local HTTP server (for implicit flow fragment capture) ---

const CALLBACK_HTML = `
<!DOCTYPE html>
<html>
<body>
<p>Processing OAuth2 callback... You can close this tab.</p>
<script>
  // Extract token from URL fragment and send to local server
  const hash = window.location.hash.substring(1);
  if (hash) {
    fetch('/callback?' + hash, { method: 'POST' })
      .then(() => window.close())
      .catch(() => document.body.innerHTML = '<p>Authorization complete. You can close this tab.</p>');
  } else {
    // Fallback: check query params (some providers use query for implicit too)
    const params = window.location.search;
    if (params) {
      fetch('/callback' + params, { method: 'POST' })
        .then(() => window.close())
        .catch(() => document.body.innerHTML = '<p>Authorization complete. You can close this tab.</p>');
    } else {
      document.body.innerHTML = '<p>No authorization data received. You can close this tab.</p>';
    }
  }
</script>
</body>
</html>
`;

async function openBrowserWithLocalServer(authorizeUrl: string): Promise<AuthorizationResult> {
  return new Promise<AuthorizationResult>((resolve, reject) => {
    pendingAuthResolve = resolve;
    pendingAuthReject = reject;

    authTimeoutHandle = setTimeout(() => {
      cleanup();
      pendingAuthResolve = null;
      pendingAuthReject = null;
      reject(new Error('OAuth2 authorization timed out after 5 minutes'));
    }, AUTHORIZATION_TIMEOUT_MS);

    // Start local server on a random available port
    const server = http.createServer((req, res) => {
      if (req.url?.startsWith('/callback')) {
        const callbackUrl = new URL(req.url, `http://localhost`);
        const params = callbackUrl.searchParams;

        const error = params.get('error');
        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><p>Authorization failed. You can close this tab.</p></body></html>');
          cleanup();
          pendingAuthReject?.(new Error(`OAuth2 error: ${params.get('error_description') || error}`));
          pendingAuthResolve = null;
          pendingAuthReject = null;
          return;
        }

        const accessToken = params.get('access_token');
        if (accessToken) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><p>Authorization complete. You can close this tab.</p></body></html>');
          cleanup();
          pendingAuthResolve?.({
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
          return;
        }

        // Authorization code fallback
        const code = params.get('code');
        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><p>Authorization complete. You can close this tab.</p></body></html>');
          cleanup();
          pendingAuthResolve?.({ authorizationCode: code });
          pendingAuthResolve = null;
          pendingAuthReject = null;
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><p>No authorization data. You can close this tab.</p></body></html>');
      } else {
        // Serve the callback page that extracts the fragment
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(CALLBACK_HTML);
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        cleanup();
        pendingAuthResolve = null;
        pendingAuthReject = null;
        reject(new Error('Failed to start local OAuth2 callback server'));
        return;
      }

      localServer = server;
      const localCallbackUrl = `http://127.0.0.1:${addr.port}/`;

      // Replace the callback URL in the authorization URL
      const url = new URL(authorizeUrl);
      url.searchParams.set('redirect_uri', localCallbackUrl);

      vscode.env.openExternal(vscode.Uri.parse(url.toString())).then((opened) => {
        if (!opened) {
          cleanup();
          pendingAuthResolve = null;
          pendingAuthReject = null;
          reject(new Error('Failed to open authorization URL in system browser'));
        }
      });
    });

    server.on('error', (err) => {
      cleanup();
      pendingAuthResolve = null;
      pendingAuthReject = null;
      reject(new Error(`OAuth2 callback server error: ${err.message}`));
    });
  });
}
