/**
 * OAuth2 Client Credentials against a real Keycloak server.
 * Needs Keycloak on :8180; it is started with docker compose if needed, and the test skips if that fails.
 *
 * One VS Code session, one request; each scenario is a step. A step that expects a fresh 200
 * first sees a 401, so a response left over from an earlier step can't satisfy it.
 */
import { test, expect } from '../../utils/fixtures';
import { openBrunoSidebar, sendRequest } from '../../utils/page/actions';
import { getActiveEditorFrame } from '../../utils/page/oauth2-actions';
import { buildCommonLocators } from '../../utils/page/locators';
import { KEYCLOAK, KEYCLOAK_DOWN_REASON, KEYCLOAK_START_TIMEOUT, ensureKeycloakUp } from './keycloak';
import {
  setupOAuth2Request,
  fillField,
  selectCredentialsPlacement,
  clickGetAccessToken,
  expectAccessToken,
  clearTokenCache
} from './keycloak-actions';

test.describe('OAuth2 with Keycloak: Client Credentials', () => {
  const { clientId, clientSecret } = KEYCLOAK.clients.clientCredentials;

  test.beforeAll(async () => {
    test.setTimeout(KEYCLOAK_START_TIMEOUT);
    test.skip(!(await ensureKeycloakUp()), KEYCLOAK_DOWN_REASON);
  });

  test('fetch tokens and call a protected resource', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const editor = await setupOAuth2Request(page, sidebar, tmpDir, 'KC Client Credentials', 'Client Credentials', KEYCLOAK.userInfoUrl);

    await fillField(page, editor, 'accessTokenUrl', KEYCLOAK.accessTokenUrl);
    await fillField(page, editor, 'clientId', clientId);
    await fillField(page, editor, 'clientSecret', clientSecret);
    await fillField(page, editor, 'scope', KEYCLOAK.scope);

    await test.step('without a token the resource is unauthorized', async () => {
      await sendRequest(await getActiveEditorFrame(page, editor), 401);
    });

    await test.step('credentials in the request body', async () => {
      await selectCredentialsPlacement(editor, 'Request Body');
      await clickGetAccessToken(editor);
      await expectAccessToken(editor);
      await sendRequest(await getActiveEditorFrame(page, editor), 200);
    });

    await test.step('clear cache removes the token', async () => {
      await clearTokenCache(editor);
      await sendRequest(await getActiveEditorFrame(page, editor), 401);
    });

    await test.step('credentials in the Basic Auth header', async () => {
      await selectCredentialsPlacement(editor, 'Basic Auth Header');
      await clickGetAccessToken(editor);
      await expectAccessToken(editor);
      await sendRequest(await getActiveEditorFrame(page, editor), 200);
    });

    await test.step('wrong client secret: no token, request stays unauthorized', async () => {
      await clearTokenCache(editor);
      await fillField(page, editor, 'clientSecret', 'not-the-secret');

      await clickGetAccessToken(editor);
      await expect(buildCommonLocators(editor).oauth2.getTokenBtn()).toBeEnabled();
      await expect(buildCommonLocators(editor).oauth2.tokenTitle()).toHaveCount(0);

      await sendRequest(await getActiveEditorFrame(page, editor), 401);
    });
  });
});
