/**
 * Keycloak test server for the OAuth2 e2e suite.
 */

export const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8180';
const REALM_URL = `${KEYCLOAK_URL}/realms/bruno`;

export const KEYCLOAK = {
  authorizationUrl: `${REALM_URL}/protocol/openid-connect/auth`,
  accessTokenUrl: `${REALM_URL}/protocol/openid-connect/token`,
  userInfoUrl: `${REALM_URL}/protocol/openid-connect/userinfo`,
  scope: 'openid',
  user: { username: 'testuser', password: 'testpass' },
  clients: {
    clientCredentials: { clientId: 'bruno-client-credentials', clientSecret: 'bruno-client-credentials-secret' },
    password: { clientId: 'bruno-password', clientSecret: 'bruno-password-secret' },
    authCode: { clientId: 'bruno-auth-code', clientSecret: 'bruno-auth-code-secret' },
    authCodePkce: { clientId: 'bruno-auth-code-pkce' },
    implicit: { clientId: 'bruno-implicit' }
  }
} as const;

export const BRUNO_CALLBACK_URL = 'https://oauth.usebruno.com/vscode/callback';
const EXTENSION_ID = 'bruno-api-client.bruno';

export const KEYCLOAK_DOWN_REASON = 'Keycloak is not running — start it with `npm run test:keycloak:up`';

export async function isKeycloakUp(): Promise<boolean> {
  try {
    const res = await fetch(`${REALM_URL}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(3_000) });
    return res.ok;
  } catch {
    return false;
  }
}

function cookieHeader(res: Response): string {
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

export async function loginToKeycloak(
  authorizeUrl: string,
  { username, password } = KEYCLOAK.user
): Promise<URL> {
  const loginPage = await fetch(authorizeUrl, { redirect: 'manual' });
  const html = await loginPage.text();
  if (loginPage.status !== 200) {
    throw new Error(`Keycloak authorize request failed (${loginPage.status}): ${html.slice(0, 500)}`);
  }

  const action = html.match(/<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"/)?.[1];
  if (!action) {
    throw new Error(`Keycloak login form not found — authorize request was probably rejected:\n${html.slice(0, 500)}`);
  }

  const res = await fetch(action.replace(/&amp;/g, '&'), {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookieHeader(loginPage) },
    body: new URLSearchParams({ username, password, credentialId: '' })
  });

  const location = res.headers.get('location');
  if (res.status !== 302 || !location) {
    throw new Error(`Keycloak login did not redirect (${res.status}) — check the realm user and client`);
  }
  return new URL(location);
}

export function toVSCodeCallbackUri(redirect: URL, overrides: Record<string, string> = {}): string {
  const params = new URLSearchParams(redirect.search);
  new URLSearchParams(redirect.hash.slice(1)).forEach((value, key) => params.set(key, value));
  Object.entries(overrides).forEach(([key, value]) => params.set(key, value));
  return `vscode://${EXTENSION_ID}/oauth2/callback?${params}`;
}

export const VSCODE_URI_HANDLER_SETTINGS = {
  // Skip the "Allow 'Bruno' to open this URI?" confirmation.
  'extensions.confirmedUriHandlerExtensionIds': [EXTENSION_ID]
};
