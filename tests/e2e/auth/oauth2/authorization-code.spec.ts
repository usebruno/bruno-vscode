/**
 * OAuth2 Authorization Code against a real Keycloak server.
 *
 * Needs Keycloak on :8180; it is started with docker compose if needed, and the test skips if that fails.
 * The login goes through a fake system browser (see keycloak/browser-shim.ts): the test reads the
 * authorize URL the extension opened, logs in to Keycloak over HTTP, then hands the callback back
 * to VS Code as a `vscode://` URI.
 *
 * One VS Code session, one request; each scenario is a step and starts from an empty token cache.
 * PKCE runs last because it switches the request to the public client.
 */
import { expect } from '../../utils/fixtures';
import { openBrunoSidebar, sendRequest } from '../../utils/page/actions';
import { getActiveEditorFrame } from '../../utils/page/oauth2-actions';
import { buildCommonLocators } from '../../utils/page/locators';
import {
  KEYCLOAK,
  KEYCLOAK_DOWN_REASON,
  KEYCLOAK_START_TIMEOUT,
  BRUNO_CALLBACK_URL,
  ensureKeycloakUp,
  loginToKeycloak,
  toVSCodeCallbackUri
} from './keycloak';
import { test, clearOpenedUrls, waitForOpenedUrl } from './keycloak/browser-shim';
import {
  setupOAuth2Request,
  fillField,
  selectCredentialsPlacement,
  enablePkce,
  clickGetAccessToken,
  expectAccessToken,
  clearTokenCache,
  expectErrorToast,
  openVSCodeUri
} from './keycloak-actions';

test.describe('OAuth2 with Keycloak: Authorization Code', () => {
  test.beforeAll(async () => {
    test.setTimeout(KEYCLOAK_START_TIMEOUT);
    test.skip(!(await ensureKeycloakUp()), KEYCLOAK_DOWN_REASON);
  });

  test('log in through the system browser', async ({ page, tmpDir, browserShim }) => {
    const sidebar = await openBrunoSidebar(page);
    const editor = await setupOAuth2Request(page, sidebar, tmpDir, 'KC Auth Code', 'Authorization Code', KEYCLOAK.userInfoUrl);
    const oauth2 = buildCommonLocators(editor).oauth2;
    const client = KEYCLOAK.clients.authCode;

    await fillField(page, editor, 'Authorization URL', KEYCLOAK.authorizationUrl);
    await fillField(page, editor, 'Access Token URL', KEYCLOAK.accessTokenUrl);
    await fillField(page, editor, 'Client ID', client.clientId);
    await fillField(page, editor, 'Client Secret', client.clientSecret);
    await fillField(page, editor, 'Scope', KEYCLOAK.scope);
    await selectCredentialsPlacement(editor, 'Request Body');

    // Click "Get Access Token" and return the authorize URL the extension opened.
    const startAuthorization = async () => {
      clearOpenedUrls(browserShim);
      await clickGetAccessToken(editor);
      return waitForOpenedUrl(browserShim);
    };

    await test.step('confidential client: log in, exchange the code, call a protected resource', async () => {
      const authorizeUrl = await startAuthorization();
      expect(authorizeUrl.origin + authorizeUrl.pathname).toBe(KEYCLOAK.authorizationUrl);
      expect(authorizeUrl.searchParams.get('response_type')).toBe('code');
      expect(authorizeUrl.searchParams.get('client_id')).toBe(client.clientId);
      expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(BRUNO_CALLBACK_URL);
      expect(authorizeUrl.searchParams.get('scope')).toBe(KEYCLOAK.scope);
      expect(authorizeUrl.searchParams.get('state')).toMatch(/^[0-9a-f]{32}$/);
      expect(authorizeUrl.searchParams.has('code_challenge')).toBe(false);

      const redirect = await loginToKeycloak(authorizeUrl.toString());
      expect(redirect.searchParams.get('code')).toBeTruthy();
      await openVSCodeUri(page, toVSCodeCallbackUri(redirect));

      await expectAccessToken(editor);
      await sendRequest(await getActiveEditorFrame(page, editor), 200);
    });

    await test.step('configured state is sent as-is', async () => {
      await clearTokenCache(editor);
      await fillField(page, editor, 'State', 'my-fixed-state');

      const authorizeUrl = await startAuthorization();
      expect(authorizeUrl.searchParams.get('state')).toBe('my-fixed-state');

      const redirect = await loginToKeycloak(authorizeUrl.toString());
      expect(redirect.searchParams.get('state')).toBe('my-fixed-state');
      await openVSCodeUri(page, toVSCodeCallbackUri(redirect));
      await expectAccessToken(editor);

      await fillField(page, editor, 'State', '');
    });

    await test.step('state mismatch on the callback is rejected', async () => {
      await clearTokenCache(editor);

      const authorizeUrl = await startAuthorization();
      const redirect = await loginToKeycloak(authorizeUrl.toString());
      await openVSCodeUri(page, toVSCodeCallbackUri(redirect, { state: 'forged-state' }));

      await expectErrorToast(editor, /state mismatch/i);
      await expect(oauth2.getTokenBtn()).toBeEnabled();
      await expect(oauth2.tokenTitle()).toHaveCount(0);
    });

    await test.step('cancel authorization while waiting for the browser', async () => {
      await startAuthorization();

      const cancelBtn = editor.getByTestId('oauth2-cancel-auth-btn');
      await expect(cancelBtn).toBeVisible();
      await cancelBtn.click();

      await expectErrorToast(editor, /Authorization cancelled/);
      await expect(cancelBtn).toBeHidden();
      await expect(oauth2.getTokenBtn()).toBeEnabled();
      await expect(oauth2.tokenTitle()).toHaveCount(0);
    });

    await test.step('PKCE with a public client: sends an S256 code challenge and the verifier is accepted', async () => {
      await fillField(page, editor, 'Client ID', KEYCLOAK.clients.authCodePkce.clientId);
      await fillField(page, editor, 'Client Secret', '');
      await enablePkce(editor);
      await sendRequest(await getActiveEditorFrame(page, editor), 401);

      const authorizeUrl = await startAuthorization();
      expect(authorizeUrl.searchParams.get('client_id')).toBe(KEYCLOAK.clients.authCodePkce.clientId);
      expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256');
      expect(authorizeUrl.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const redirect = await loginToKeycloak(authorizeUrl.toString());
      await openVSCodeUri(page, toVSCodeCallbackUri(redirect));

      await expectAccessToken(editor);
      await sendRequest(await getActiveEditorFrame(page, editor), 200);
    });
  });
});
