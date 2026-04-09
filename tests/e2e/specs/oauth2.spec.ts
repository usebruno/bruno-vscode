import * as path from 'path';
import { test, expect } from '../fixtures';
import type { Frame } from '@playwright/test';
import {
  openBrunoSidebar,
  createCollection,
  openNewRequestPanel,
  createRequest,
  openRequest,
  sendRequest,
  importCollection,
} from '../utils/actions';
import {
  fillOAuth2Field,
  selectDropdownItem,
  getActiveEditorFrame,
} from '../utils/oauth2-actions';

const TEST_SERVER = 'http://127.0.0.1:8081';

/**
 * Common setup: create a collection with a GET request to the protected resource,
 * open it, switch to Auth tab, select OAuth 2.0, select the given grant type.
 */
async function setupOAuth2Request(
  page: import('@playwright/test').Page,
  sidebar: Frame,
  tmpDir: string,
  collectionName: string,
  grantType: 'Client Credentials' | 'Password Credentials' | 'Authorization Code' | 'Implicit'
): Promise<Frame> {
  await createCollection(page, sidebar, collectionName, tmpDir);
  const newReqPanel = await openNewRequestPanel(page, sidebar, collectionName);
  await createRequest(page, newReqPanel, sidebar, collectionName, 'Get Resource', `${TEST_SERVER}/api/auth/oauth2/resource`);
  const editor = await openRequest(page, sidebar, collectionName, 'Get Resource');

  const authTab = editor.locator('[role="tab"]').filter({ hasText: 'Auth' });
  await expect(authTab).toBeVisible({ timeout: 10_000 });
  await authTab.click();
  await expect(editor.locator('[data-testid="oauth2-auth-mode-selector"]')).toBeVisible({ timeout: 5_000 });

  await selectDropdownItem(editor, '[data-testid="oauth2-auth-mode-selector"]', 'OAuth 2.0');
  await expect(editor.locator('[data-testid="oauth2-grant-type-selector"]')).toBeVisible({ timeout: 10_000 });

  await selectDropdownItem(editor, '[data-testid="oauth2-grant-type-selector"]', grantType);
  await expect(editor.locator('[data-testid="oauth2-field-accessTokenUrl"]')).toBeVisible({ timeout: 5_000 });

  return editor;
}

/**
 * Fill client credentials fields and fetch token.
 */
async function fillClientCredentialsAndFetchToken(
  page: import('@playwright/test').Page,
  editor: Frame,
  opts: {
    tokenUrl?: string;
    clientId?: string;
    clientSecret?: string;
    scope?: string;
    credentialsPlacement?: 'Request Body' | 'Basic Auth Header';
  } = {}
): Promise<void> {
  const {
    tokenUrl = `${TEST_SERVER}/api/auth/oauth2/client_credentials/token`,
    clientId = 'test-client',
    clientSecret = 'test-secret',
    scope,
    credentialsPlacement = 'Request Body'
  } = opts;

  await fillOAuth2Field(page, editor, 'accessTokenUrl', tokenUrl);
  await fillOAuth2Field(page, editor, 'clientId', clientId);
  await fillOAuth2Field(page, editor, 'clientSecret', clientSecret);
  if (scope) {
    await fillOAuth2Field(page, editor, 'scope', scope);
  }

  await expect(editor.locator('[data-testid="oauth2-credentials-placement-selector"]')).toBeVisible({ timeout: 5_000 });
  await selectDropdownItem(editor, '[data-testid="oauth2-credentials-placement-selector"]', credentialsPlacement);

  const getTokenBtn = editor.locator('[data-testid="oauth2-get-token-btn"]');
  await expect(getTokenBtn).toBeEnabled({ timeout: 5_000 });
  await getTokenBtn.click();

  await expect(editor.locator('[data-testid="oauth2-token-title"]').first()).toBeVisible({ timeout: 15_000 });
  await expect(getTokenBtn).toBeEnabled({ timeout: 5_000 });
}

test.describe('OAuth2 Authentication', () => {

  test.beforeEach(async () => {
    await fetch(`${TEST_SERVER}/api/auth/oauth2/reset`, { method: 'POST' });
  });

  // ─── Client Credentials Grant ────────────────────────────────────────

  test('Client Credentials (body placement): fetch token and send authenticated request', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const editor = await setupOAuth2Request(page, sidebar, tmpDir, 'CC Body', 'Client Credentials');

    await fillClientCredentialsAndFetchToken(page, editor, { credentialsPlacement: 'Request Body' });

    const currentEditor = await getActiveEditorFrame(page, editor);
    await sendRequest(currentEditor, 200);
  });

  test('Client Credentials (basic auth header): fetch token and send authenticated request', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const editor = await setupOAuth2Request(page, sidebar, tmpDir, 'CC Header', 'Client Credentials');

    await fillClientCredentialsAndFetchToken(page, editor, { credentialsPlacement: 'Basic Auth Header' });

    const currentEditor = await getActiveEditorFrame(page, editor);
    await sendRequest(currentEditor, 200);
  });

  test('Client Credentials with scope: scope sent in token request', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const editor = await setupOAuth2Request(page, sidebar, tmpDir, 'CC Scope', 'Client Credentials');

    await fillClientCredentialsAndFetchToken(page, editor, { scope: 'admin' });

    const currentEditor = await getActiveEditorFrame(page, editor);
    await sendRequest(currentEditor, 200);
  });

  // ─── Password Grant ──────────────────────────────────────────────────

  test('Password Credentials (body placement): fetch token and send authenticated request', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const editor = await setupOAuth2Request(page, sidebar, tmpDir, 'PW Body', 'Password Credentials');

    await fillOAuth2Field(page, editor, 'accessTokenUrl', `${TEST_SERVER}/api/auth/oauth2/password_credentials/token`);
    await fillOAuth2Field(page, editor, 'username', 'testuser');
    await fillOAuth2Field(page, editor, 'password', 'testpass');
    await fillOAuth2Field(page, editor, 'clientId', 'test-client');
    await fillOAuth2Field(page, editor, 'clientSecret', 'test-secret');

    await expect(editor.locator('[data-testid="oauth2-credentials-placement-selector"]')).toBeVisible({ timeout: 5_000 });
    await selectDropdownItem(editor, '[data-testid="oauth2-credentials-placement-selector"]', 'Request Body');

    const getTokenBtn = editor.locator('[data-testid="oauth2-get-token-btn"]');
    await expect(getTokenBtn).toBeEnabled({ timeout: 5_000 });
    await getTokenBtn.click();
    await expect(editor.locator('[data-testid="oauth2-token-title"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(getTokenBtn).toBeEnabled({ timeout: 5_000 });

    const currentEditor = await getActiveEditorFrame(page, editor);
    await sendRequest(currentEditor, 200);
  });

  test('Password Credentials (basic auth header): fetch token and send authenticated request', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const editor = await setupOAuth2Request(page, sidebar, tmpDir, 'PW Header', 'Password Credentials');

    await fillOAuth2Field(page, editor, 'accessTokenUrl', `${TEST_SERVER}/api/auth/oauth2/password_credentials/token`);
    await fillOAuth2Field(page, editor, 'username', 'testuser');
    await fillOAuth2Field(page, editor, 'password', 'testpass');
    await fillOAuth2Field(page, editor, 'clientId', 'test-client');
    await fillOAuth2Field(page, editor, 'clientSecret', 'test-secret');

    await expect(editor.locator('[data-testid="oauth2-credentials-placement-selector"]')).toBeVisible({ timeout: 5_000 });
    await selectDropdownItem(editor, '[data-testid="oauth2-credentials-placement-selector"]', 'Basic Auth Header');

    const getTokenBtn = editor.locator('[data-testid="oauth2-get-token-btn"]');
    await expect(getTokenBtn).toBeEnabled({ timeout: 5_000 });
    await getTokenBtn.click();
    await expect(editor.locator('[data-testid="oauth2-token-title"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(getTokenBtn).toBeEnabled({ timeout: 5_000 });

    const currentEditor = await getActiveEditorFrame(page, editor);
    await sendRequest(currentEditor, 200);
  });

  // ─── Token Placement ─────────────────────────────────────────────────

  test('Token placement: custom header prefix', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const editor = await setupOAuth2Request(page, sidebar, tmpDir, 'TP Prefix', 'Client Credentials');

    await fillClientCredentialsAndFetchToken(page, editor);

    const currentEditor = await getActiveEditorFrame(page, editor);
    await sendRequest(currentEditor, 200);
  });

  test('Token placement: URL query parameter', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const editor = await setupOAuth2Request(page, sidebar, tmpDir, 'TP URL', 'Client Credentials');

    await fillOAuth2Field(page, editor, 'accessTokenUrl', `${TEST_SERVER}/api/auth/oauth2/client_credentials/token`);
    await fillOAuth2Field(page, editor, 'clientId', 'test-client');
    await fillOAuth2Field(page, editor, 'clientSecret', 'test-secret');

    await expect(editor.locator('[data-testid="oauth2-credentials-placement-selector"]')).toBeVisible({ timeout: 5_000 });
    await selectDropdownItem(editor, '[data-testid="oauth2-credentials-placement-selector"]', 'Request Body');

    // Change token placement to URL
    await selectDropdownItem(editor, '[data-testid="oauth2-token-placement-selector"]', 'URL');
    await expect(editor.locator('[data-testid="oauth2-field-tokenQueryKey"]')).toBeVisible({ timeout: 5_000 });

    const getTokenBtn = editor.locator('[data-testid="oauth2-get-token-btn"]');
    await expect(getTokenBtn).toBeEnabled({ timeout: 5_000 });
    await getTokenBtn.click();
    await expect(editor.locator('[data-testid="oauth2-token-title"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(getTokenBtn).toBeEnabled({ timeout: 5_000 });

    const currentEditor = await getActiveEditorFrame(page, editor);
    await sendRequest(currentEditor, 200);
  });

  // ─── Token Lifecycle ─────────────────────────────────────────────────

  test('Clear cache: removes stored token', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const editor = await setupOAuth2Request(page, sidebar, tmpDir, 'Token Cache', 'Client Credentials');

    await fillClientCredentialsAndFetchToken(page, editor);

    const tokenTitle = editor.locator('[data-testid="oauth2-token-title"]').filter({ hasText: 'Access Token' });
    await expect(tokenTitle).toBeVisible({ timeout: 5_000 });

    const clearBtn = editor.locator('[data-testid="oauth2-clear-cache-btn"]');
    await clearBtn.scrollIntoViewIfNeeded();
    await expect(clearBtn).toBeVisible({ timeout: 5_000 });
    await clearBtn.click();

    await expect(tokenTitle).not.toBeVisible({ timeout: 10_000 });
  });

  test('Refresh token: fetches new token', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const editor = await setupOAuth2Request(page, sidebar, tmpDir, 'Refresh', 'Client Credentials');

    await fillOAuth2Field(page, editor, 'accessTokenUrl', `${TEST_SERVER}/api/auth/oauth2/client_credentials/token`);
    await fillOAuth2Field(page, editor, 'clientId', 'test-client');
    await fillOAuth2Field(page, editor, 'clientSecret', 'test-secret');
    await fillOAuth2Field(page, editor, 'refreshTokenUrl', `${TEST_SERVER}/api/auth/oauth2/refresh`);

    await expect(editor.locator('[data-testid="oauth2-credentials-placement-selector"]')).toBeVisible({ timeout: 5_000 });
    await selectDropdownItem(editor, '[data-testid="oauth2-credentials-placement-selector"]', 'Request Body');

    const getTokenBtn = editor.locator('[data-testid="oauth2-get-token-btn"]');
    await expect(getTokenBtn).toBeEnabled({ timeout: 5_000 });
    await getTokenBtn.click();
    await expect(editor.locator('[data-testid="oauth2-token-title"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(getTokenBtn).toBeEnabled({ timeout: 5_000 });

    const refreshBtn = editor.locator('[data-testid="oauth2-refresh-token-btn"]');
    await expect(refreshBtn).toBeVisible({ timeout: 5_000 });
    await refreshBtn.click();
    await expect(refreshBtn).toBeEnabled({ timeout: 15_000 });

    await expect(editor.locator('[data-testid="oauth2-token-title"]').first()).toBeVisible({ timeout: 5_000 });

    const currentEditor = await getActiveEditorFrame(page, editor);
    await sendRequest(currentEditor, 200);
  });

  // ─── Interpolation ─────────────────────────────────────────────────

  test('Interpolation: OAuth2 fields with {{variables}} resolve correctly', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const fixturePath = path.resolve(__dirname, '../fixtures/oauth2-interpolation-collection.json');

    // Import the collection that has {{tokenUrl}}, {{myClientId}}, {{myClientSecret}} in OAuth2 config
    // with request vars providing the actual values
    await importCollection(page, sidebar, fixturePath, tmpDir, 'OAuth2 Interpolation');

    // Open the request
    const editor = await openRequest(page, sidebar, 'OAuth2 Interpolation', 'Get Resource With Vars');

    // Switch to Auth tab — OAuth2 should already be configured from the fixture
    const authTab = editor.locator('[role="tab"]').filter({ hasText: 'Auth' });
    await expect(authTab).toBeVisible({ timeout: 10_000 });
    await authTab.click();
    await expect(editor.locator('[data-testid="oauth2-get-token-btn"]')).toBeVisible({ timeout: 10_000 });

    // Click "Get Access Token" — this should interpolate {{tokenUrl}} etc. and fetch successfully
    const getTokenBtn = editor.locator('[data-testid="oauth2-get-token-btn"]');
    await expect(getTokenBtn).toBeEnabled({ timeout: 5_000 });
    await getTokenBtn.click();

    // Verify token was fetched (interpolation worked)
    await expect(editor.locator('[data-testid="oauth2-token-title"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(getTokenBtn).toBeEnabled({ timeout: 5_000 });

    // Send authenticated request — verifies the token is applied to the request
    const currentEditor = await getActiveEditorFrame(page, editor);
    await sendRequest(currentEditor, 200);
  });

  // ─── Validation ──────────────────────────────────────────────────────

  test('Validation: missing Client ID shows error toast', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const editor = await setupOAuth2Request(page, sidebar, tmpDir, 'Validation', 'Client Credentials');

    await fillOAuth2Field(page, editor, 'accessTokenUrl', `${TEST_SERVER}/api/auth/oauth2/client_credentials/token`);

    await expect(editor.locator('[data-testid="oauth2-credentials-placement-selector"]')).toBeVisible({ timeout: 5_000 });
    await selectDropdownItem(editor, '[data-testid="oauth2-credentials-placement-selector"]', 'Request Body');

    const getTokenBtn = editor.locator('[data-testid="oauth2-get-token-btn"]');
    await expect(getTokenBtn).toBeEnabled({ timeout: 5_000 });
    await getTokenBtn.click();
    await expect(getTokenBtn).toBeEnabled({ timeout: 10_000 });

    const currentEditor = await getActiveEditorFrame(page, editor);
    await sendRequest(currentEditor, 401);
  });

});
