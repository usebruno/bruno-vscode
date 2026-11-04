import type { test as Test } from '../../utils/fixtures';
import { Workspace, AuthFields } from '../../e2e-helper';
import { setAuth, setVars, sendRequestAndExpect, getOAuth2AccessToken, refreshOAuth2Token, clearOAuth2Cache } from '../../utils/page/actions';
import { TEST_SERVER_LOCAL_URL } from '../../utils/urls';

export const desc = 'OAuth 2.0 fetches tokens for each grant type and placement, refreshes and clears them, resolves variables and validates';

const RESOURCE_URL = `${TEST_SERVER_LOCAL_URL}/api/auth/oauth2/resource`;
const CLIENT_CREDENTIALS_URL = `${TEST_SERVER_LOCAL_URL}/api/auth/oauth2/client_credentials/token`;
const PASSWORD_CREDENTIALS_URL = `${TEST_SERVER_LOCAL_URL}/api/auth/oauth2/password_credentials/token`;

export const workspace: Workspace = {
  collections: [
    {
      name: 'oauth2-collection',
      format: 'yml',
      requests: [
        { name: 'cc-body', url: RESOURCE_URL, type: 'HTTP', method: 'GET' },
        { name: 'cc-header', url: RESOURCE_URL, type: 'HTTP', method: 'GET' },
        { name: 'cc-scope', url: RESOURCE_URL, type: 'HTTP', method: 'GET' },
        { name: 'cc-wrong-secret', url: RESOURCE_URL, type: 'HTTP', method: 'GET' },
        { name: 'pw-body', url: RESOURCE_URL, type: 'HTTP', method: 'GET' },
        { name: 'pw-header', url: RESOURCE_URL, type: 'HTTP', method: 'GET' },
        { name: 'pw-wrong-password', url: RESOURCE_URL, type: 'HTTP', method: 'GET' },
        { name: 'token-url', url: RESOURCE_URL, type: 'HTTP', method: 'GET' },
        { name: 'clear-cache', url: RESOURCE_URL, type: 'HTTP', method: 'GET' },
        { name: 'refresh', url: RESOURCE_URL, type: 'HTTP', method: 'GET' },
        { name: 'validation', url: RESOURCE_URL, type: 'HTTP', method: 'GET' },
        { name: 'interpolation', url: RESOURCE_URL, type: 'HTTP', method: 'GET' },
      ],
    },
  ],
};

export function setup(test: typeof Test) {
  test.describe.configure({ timeout: 10 * 60_000 });
  test.beforeEach(async () => {
    await fetch(`${TEST_SERVER_LOCAL_URL}/api/auth/oauth2/reset`, { method: 'POST' });
  });
}

const clientCredentials: AuthFields = {
  grantType: 'clientCredentials', accessTokenUrl: CLIENT_CREDENTIALS_URL, clientId: 'test-client', clientSecret: 'test-secret'
};
const passwordCredentials: AuthFields = {
  grantType: 'passwordCredentials', accessTokenUrl: PASSWORD_CREDENTIALS_URL, username: 'testuser', password: 'testpass',
  clientId: 'test-client', clientSecret: 'test-secret'
};

async function fetchTokenAndSend(request: string) {
  await getOAuth2AccessToken(request);
  await sendRequestAndExpect(request, 200);
}

async function verifyClientCredentials() {
  await setAuth('cc-body', 'oauth2', { ...clientCredentials, addCredentialsTo: 'requestBody' });
  await fetchTokenAndSend('cc-body');

  await setAuth('cc-header', 'oauth2', { ...clientCredentials, addCredentialsTo: 'basicAuthHeader' });
  await fetchTokenAndSend('cc-header');

  await setAuth('cc-scope', 'oauth2', { ...clientCredentials, scope: 'admin' });
  await fetchTokenAndSend('cc-scope');

  await setAuth('cc-wrong-secret', 'oauth2', { ...clientCredentials, clientSecret: 'not-the-secret' });
  await clearOAuth2Cache('cc-wrong-secret');
  await getOAuth2AccessToken('cc-wrong-secret', { expectToken: false });
  await sendRequestAndExpect('cc-wrong-secret', 401);
}

async function verifyPasswordCredentials() {
  await setAuth('pw-body', 'oauth2', { ...passwordCredentials, addCredentialsTo: 'requestBody' });
  await fetchTokenAndSend('pw-body');

  await setAuth('pw-header', 'oauth2', { ...passwordCredentials, addCredentialsTo: 'basicAuthHeader' });
  await fetchTokenAndSend('pw-header');

  await setAuth('pw-wrong-password', 'oauth2', { ...passwordCredentials, password: 'wrong-password' });
  await clearOAuth2Cache('pw-wrong-password');
  await getOAuth2AccessToken('pw-wrong-password', { expectToken: false });
  await sendRequestAndExpect('pw-wrong-password', 401);
}

async function verifyTokenPlacement() {
  await setAuth('token-url', 'oauth2', { ...clientCredentials, addTokenTo: 'url' });
  await fetchTokenAndSend('token-url');
}

async function verifyTokenLifecycle() {
  await setAuth('clear-cache', 'oauth2', clientCredentials);
  await getOAuth2AccessToken('clear-cache');
  await clearOAuth2Cache('clear-cache');
  await sendRequestAndExpect('clear-cache', 401);

  await setAuth('refresh', 'oauth2', { ...clientCredentials, refreshTokenUrl: `${TEST_SERVER_LOCAL_URL}/api/auth/oauth2/refresh` });
  await getOAuth2AccessToken('refresh');
  await refreshOAuth2Token();
  await sendRequestAndExpect('refresh', 200);
}

async function verifyValidation() {
  await setAuth('validation', 'oauth2', { grantType: 'clientCredentials', accessTokenUrl: CLIENT_CREDENTIALS_URL, addCredentialsTo: 'requestBody' });
  await clearOAuth2Cache('validation');
  await getOAuth2AccessToken('validation', { expectToken: false });
  await sendRequestAndExpect('validation', 401);
}

async function verifyInterpolation() {
  await setVars('interpolation', [
    { name: 'tokenUrl', value: CLIENT_CREDENTIALS_URL },
    { name: 'myClientId', value: 'test-client' },
    { name: 'myClientSecret', value: 'test-secret' },
  ]);
  await setAuth('interpolation', 'oauth2', {
    grantType: 'clientCredentials', accessTokenUrl: '{{tokenUrl}}', clientId: '{{myClientId}}', clientSecret: '{{myClientSecret}}',
    addCredentialsTo: 'requestBody'
  });
  await fetchTokenAndSend('interpolation');
}

export async function run() {
  await verifyClientCredentials();
  await verifyPasswordCredentials();
  await verifyTokenPlacement();
  await verifyTokenLifecycle();
  await verifyValidation();
  await verifyInterpolation();
}
