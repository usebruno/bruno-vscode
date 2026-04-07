/**
 * OAuth2 authorization using system browser
 * Opens the authorization URL in the user's default browser
 *
 * In VS Code, we use vscode.env.openExternal instead of Electron's shell
 */

import * as vscode from 'vscode';

interface AuthorizationOptions {
  authorizationUrl: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}

const authorizeUserInSystemBrowser = async (options: AuthorizationOptions): Promise<void> => {
  const {
    authorizationUrl,
    clientId,
    redirectUri,
    scope,
    state,
    codeChallenge,
    codeChallengeMethod
  } = options;

  const url = new URL(authorizationUrl);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');

  if (scope) {
    url.searchParams.set('scope', scope);
  }
  if (state) {
    url.searchParams.set('state', state);
  }
  if (codeChallenge) {
    url.searchParams.set('code_challenge', codeChallenge);
  }
  if (codeChallengeMethod) {
    url.searchParams.set('code_challenge_method', codeChallengeMethod);
  }

  const opened = await vscode.env.openExternal(vscode.Uri.parse(url.toString()));

  if (!opened) {
    throw new Error('Failed to open authorization URL in system browser');
  }
};

export default authorizeUserInSystemBrowser;
export { authorizeUserInSystemBrowser, AuthorizationOptions };
