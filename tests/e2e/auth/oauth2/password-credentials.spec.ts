/**
 * OAuth2 Password Credentials against a real Keycloak server.
 * Needs Keycloak on :8180; it is started with docker compose if needed, and the test skips if that fails.
 *
 * One VS Code session, one request; each scenario is a step.
 */
import { test, expect } from '../../utils/fixtures';
import { openBrunoSidebar, sendRequest } from '../../utils/page/actions';
import { getActiveEditorFrame } from '../../utils/page/oauth2-actions';
import { buildCommonLocators } from '../../utils/page/locators';
import { KEYCLOAK, KEYCLOAK_DOWN_REASON, KEYCLOAK_START_TIMEOUT, ensureKeycloakUp } from './keycloak';
import { setupOAuth2Request, fillField, clickGetAccessToken, expectAccessToken, clearTokenCache } from './keycloak-actions';

test.describe('OAuth2 with Keycloak: Password Credentials', () => {
  const { clientId, clientSecret } = KEYCLOAK.clients.password;

  test.beforeAll(async () => {
    test.setTimeout(KEYCLOAK_START_TIMEOUT);
    test.skip(!(await ensureKeycloakUp()), KEYCLOAK_DOWN_REASON);
  });

  test('fetch, refresh and reject tokens', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const editor = await setupOAuth2Request(page, sidebar, tmpDir, 'KC Password', 'Password Credentials', KEYCLOAK.userInfoUrl);

    await fillField(page, editor, 'accessTokenUrl', KEYCLOAK.accessTokenUrl);
    await fillField(page, editor, 'username', KEYCLOAK.user.username);
    await fillField(page, editor, 'password', KEYCLOAK.user.password);
    await fillField(page, editor, 'clientId', clientId);
    await fillField(page, editor, 'clientSecret', clientSecret);
    await fillField(page, editor, 'scope', KEYCLOAK.scope);

    await test.step('fetch token and call a protected resource', async () => {
      await clickGetAccessToken(editor);
      await expectAccessToken(editor);
      await sendRequest(await getActiveEditorFrame(page, editor), 200);
    });

    await test.step('refresh token: exchanges the refresh token for a new access token', async () => {
      const refreshBtn = editor.getByTestId('oauth2-refresh-token-btn');
      await expect(refreshBtn).toBeVisible();
      await refreshBtn.click();
      await expect(editor.getByRole('status').filter({ hasText: 'Token refreshed successfully' })).toBeVisible();
      await expectAccessToken(editor);
    });

    await test.step('wrong user password: no token', async () => {
      await clearTokenCache(editor);
      await fillField(page, editor, 'password', 'wrong-password');

      await clickGetAccessToken(editor);
      await expect(buildCommonLocators(editor).oauth2.getTokenBtn()).toBeEnabled();
      await expect(buildCommonLocators(editor).oauth2.tokenTitle()).toHaveCount(0);

      await sendRequest(await getActiveEditorFrame(page, editor), 401);
    });
  });
});
