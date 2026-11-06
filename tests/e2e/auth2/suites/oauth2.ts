import type { Page } from '@playwright/test';
import type { test as Test } from '../../utils/fixtures';
import type { AuthFields, Workspace } from '../../e2e-helper';
import { setAuth, setVars, getOAuth2AccessToken, refreshOAuth2Token, clearOAuth2Cache } from '../../utils/page/actions';
import { sendRequestAndVerify } from '../../utils/page/assertions';
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

async function fetchTokenAndSend(page: Page, request: string) {
  await getOAuth2AccessToken(page, request);
  await sendRequestAndVerify(page, request, 200);
}

async function verifyClientCredentials(page: Page) {
  await setAuth(page, 'cc-body', 'oauth2', { ...clientCredentials, addCredentialsTo: 'requestBody' });
  await fetchTokenAndSend(page, 'cc-body');

  await setAuth(page, 'cc-header', 'oauth2', { ...clientCredentials, addCredentialsTo: 'basicAuthHeader' });
  await fetchTokenAndSend(page, 'cc-header');

  await setAuth(page, 'cc-scope', 'oauth2', { ...clientCredentials, scope: 'admin' });
  await fetchTokenAndSend(page, 'cc-scope');

  await setAuth(page, 'cc-wrong-secret', 'oauth2', { ...clientCredentials, clientSecret: 'not-the-secret' });
  await clearOAuth2Cache(page, 'cc-wrong-secret');
  await getOAuth2AccessToken(page, 'cc-wrong-secret', { expectToken: false });
  await sendRequestAndVerify(page, 'cc-wrong-secret', 401);
}

async function verifyPasswordCredentials(page: Page) {
  await setAuth(page, 'pw-body', 'oauth2', { ...passwordCredentials, addCredentialsTo: 'requestBody' });
  await fetchTokenAndSend(page, 'pw-body');

  await setAuth(page, 'pw-header', 'oauth2', { ...passwordCredentials, addCredentialsTo: 'basicAuthHeader' });
  await fetchTokenAndSend(page, 'pw-header');

  await setAuth(page, 'pw-wrong-password', 'oauth2', { ...passwordCredentials, password: 'wrong-password' });
  await clearOAuth2Cache(page, 'pw-wrong-password');
  await getOAuth2AccessToken(page, 'pw-wrong-password', { expectToken: false });
  await sendRequestAndVerify(page, 'pw-wrong-password', 401);
}

async function verifyTokenPlacement(page: Page) {
  await setAuth(page, 'token-url', 'oauth2', { ...clientCredentials, addTokenTo: 'url' });
  await fetchTokenAndSend(page, 'token-url');
}

async function verifyTokenLifecycle(page: Page) {
  await setAuth(page, 'clear-cache', 'oauth2', clientCredentials);
  await getOAuth2AccessToken(page, 'clear-cache');
  await clearOAuth2Cache(page, 'clear-cache');

  await setAuth(page, 'refresh', 'oauth2', { ...clientCredentials, refreshTokenUrl: `${TEST_SERVER_LOCAL_URL}/api/auth/oauth2/refresh` });
  await getOAuth2AccessToken(page, 'refresh');
  await refreshOAuth2Token(page);
  await sendRequestAndVerify(page, 'refresh', 200);
}

async function verifyValidation(page: Page) {
  await setAuth(page, 'validation', 'oauth2', { grantType: 'clientCredentials', accessTokenUrl: CLIENT_CREDENTIALS_URL, addCredentialsTo: 'requestBody' });
  await clearOAuth2Cache(page, 'validation');
  await getOAuth2AccessToken(page, 'validation', { expectToken: false });
  await sendRequestAndVerify(page, 'validation', 401);
}

async function verifyInterpolation(page: Page) {
  await setVars(page, 'interpolation', [
    { name: 'tokenUrl', value: CLIENT_CREDENTIALS_URL },
    { name: 'myClientId', value: 'test-client' },
    { name: 'myClientSecret', value: 'test-secret' },
  ]);
  await setAuth(page, 'interpolation', 'oauth2', {
    grantType: 'clientCredentials', accessTokenUrl: '{{tokenUrl}}', clientId: '{{myClientId}}', clientSecret: '{{myClientSecret}}',
    addCredentialsTo: 'requestBody'
  });
  await fetchTokenAndSend(page, 'interpolation');
}

export async function run(page: Page) {
  await verifyClientCredentials(page);
  await verifyPasswordCredentials(page);
  await verifyTokenPlacement(page);
  await verifyTokenLifecycle(page);
  await verifyValidation(page);
  await verifyInterpolation(page);
}
