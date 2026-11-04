/**
 * OAuth2 Implicit against a real Keycloak server.
 *
 * Needs Keycloak on :8180; it is started with docker compose if needed, and the test skips if that fails.
 * The login goes through a fake system browser (see keycloak/browser-shim.ts): the test reads the
 * authorize URL the extension opened, logs in to Keycloak over HTTP, then hands the callback back
 * to VS Code as a `vscode://` URI.
 *
 * One VS Code session, one request; each scenario is a step and starts from an empty token cache.
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
  clickGetAccessToken,
  expectAccessToken,
  clearTokenCache,
  expectErrorToast,
  openVSCodeUri
} from './keycloak-actions';

test.describe('OAuth2 with Keycloak: Implicit', () => {
  test.beforeAll(async () => {
    test.setTimeout(KEYCLOAK_START_TIMEOUT);
    test.skip(!(await ensureKeycloakUp()), KEYCLOAK_DOWN_REASON);
  });

  test('log in through the system browser', async ({ page, tmpDir, browserShim }) => {
    const sidebar = await openBrunoSidebar(page);
    const editor = await setupOAuth2Request(page, sidebar, tmpDir, 'KC Implicit', 'Implicit', KEYCLOAK.userInfoUrl);
    const oauth2 = buildCommonLocators(editor).oauth2;
    const { clientId } = KEYCLOAK.clients.implicit;

    await fillField(page, editor, 'Authorization URL', KEYCLOAK.authorizationUrl);
    await fillField(page, editor, 'Client ID', clientId);
    await fillField(page, editor, 'Scope', KEYCLOAK.scope);

    // Click "Get Access Token" and return the authorize URL the extension opened.
    const startAuthorization = async () => {
      clearOpenedUrls(browserShim);
      await clickGetAccessToken(editor);
      return waitForOpenedUrl(browserShim);
    };

    await test.step('receive the token in the fragment and call a protected resource', async () => {
      const authorizeUrl = await startAuthorization();
      expect(authorizeUrl.searchParams.get('response_type')).toBe('token');
      expect(authorizeUrl.searchParams.get('client_id')).toBe(clientId);
      expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(BRUNO_CALLBACK_URL);
      expect(authorizeUrl.searchParams.get('state')).toMatch(/^[0-9a-f]{32}$/);

      const redirect = await loginToKeycloak(authorizeUrl.toString());
      expect(new URLSearchParams(redirect.hash.slice(1)).get('access_token')).toBeTruthy();
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
      expect(new URLSearchParams(redirect.hash.slice(1)).get('state')).toBe('my-fixed-state');
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
  });
});
