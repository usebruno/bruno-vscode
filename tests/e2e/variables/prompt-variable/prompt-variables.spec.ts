import { test, expect } from '../../utils/fixtures';
import {
  addRequestHeader,
  addQueryParam,
  setBearerToken,
  fillJsonBody,
  addRequestVar,
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';
import {
  expectPromptModal,
  fillPromptAndContinue,
  cancelPrompt,
} from './prompt-actions';
import {
  SERVER,
  setupCollection,
  newHttpRequest,
  clickSend,
  expectResponseContains,
  expectResponseContainsAll,
  expectSentWithoutPrompt,
  expectRequestAborted,
  getActiveEditorFrame,
} from './request-actions';
import { fillOAuth2Field, selectDropdownItem } from '../../utils/page/oauth2-actions';

/**
 * End-to-end coverage for prompt variables (`{{?Name}}`) over HTTP + OAuth2.
 * (GraphQL / WebSocket / gRPC live in the sibling -graphql / -websocket / -grpc specs.)
 *
 * When a request references `{{?Something}}` anywhere (URL, headers, body, auth, or
 * inside another variable's value), Bruno prompts once per unique variable, then
 * interpolates the entered values before sending. Tests author each request via the
 * UI and assert interpolation from what the echo server received; endpoints reflect
 * the value at the TOP LEVEL of the JSON so assertions survive any response rendering:
 *   GET  /api/echo/query   -> query params, e.g. {"token":"abc"}
 *   GET  /api/echo/header  -> {"value": <x-prompt-header>}
 *   GET  /api/echo/auth    -> {"authorization": <Authorization>}
 *   POST /api/echo/json    -> the JSON body verbatim
 */

// ── HTTP send ────────────────────────────────────────────────────────────────

test.describe('Prompt variables — HTTP send', () => {

  test('prompt in the URL / query string is interpolated', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'PV URL');

    const editor = await newHttpRequest(
      page, sidebar, 'PV URL', 'Prompt In URL',
      `${SERVER}/api/echo/query?token={{?ApiKey}}`
    );

    await clickSend(editor);
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['url-secret-42']);

    await expectResponseContains(page, editor, 'url-secret-42');
  });

  test('prompt in a request header is interpolated', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'PV Header');

    const editor = await newHttpRequest(
      page, sidebar, 'PV Header', 'Prompt In Header', `${SERVER}/api/echo/header`
    );
    await addRequestHeader(page, editor, 'x-prompt-header', '{{?HeaderValue}}');

    await clickSend(editor);
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['hdr-secret-7']);

    await expectResponseContains(page, editor, 'hdr-secret-7');
  });

  test('prompt in the JSON body is interpolated', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'PV Body');

    const editor = await newHttpRequest(
      page, sidebar, 'PV Body', 'Prompt In Body', `${SERVER}/api/echo/json`, 'POST'
    );
    await fillJsonBody(page, editor, '{"message":"{{?BodyMessage}}"}');

    await clickSend(editor);
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['body-secret-9']);

    await expectResponseContains(page, editor, 'body-secret-9');
  });

  test('prompt in the bearer auth token is interpolated', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'PV Auth');

    const editor = await newHttpRequest(
      page, sidebar, 'PV Auth', 'Prompt In Auth', `${SERVER}/api/echo/auth`
    );
    await setBearerToken(page, editor, '{{?AuthToken}}');

    await clickSend(editor);
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['auth-secret-3']);

    // Server echoes the Authorization header, e.g. "Bearer auth-secret-3".
    await expectResponseContains(page, editor, 'auth-secret-3');
  });

  test('prompt nested inside a variable value is discovered and interpolated', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'PV Var');

    const editor = await newHttpRequest(
      page, sidebar, 'PV Var', 'Prompt In Variable', `${SERVER}/api/echo/query?v={{dynQuery}}`
    );
    // The request variable's VALUE itself references a prompt variable.
    await addRequestVar(page, editor, 'dynQuery', '{{?VarPrompt}}');

    await clickSend(editor);
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['nested-value-5']);

    await expectResponseContains(page, editor, 'nested-value-5');
  });

  test('the same prompt used in multiple places is asked only once (dedup)', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'PV Dedup');

    // `{{?Shared}}` appears twice in the query string and once in a header.
    const editor = await newHttpRequest(
      page, sidebar, 'PV Dedup', 'Duplicate Prompt',
      `${SERVER}/api/echo/query?a={{?Shared}}&b={{?Shared}}`
    );
    await addRequestHeader(page, editor, 'x-shared', '{{?Shared}}');

    await clickSend(editor);
    // Only ONE input despite three usages.
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['shared-once']);

    // Both query params received the same value.
    await expectResponseContainsAll(page, editor, ['shared-once', '"a"', '"b"']);
  });

  test('multiple distinct prompts each get their own input', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'PV Multi');

    const editor = await newHttpRequest(
      page, sidebar, 'PV Multi', 'Multiple Prompts',
      `${SERVER}/api/echo/query?first={{?First}}&second={{?Second}}`
    );

    await clickSend(editor);
    await expectPromptModal(editor, 2);
    await fillPromptAndContinue(editor, ['alpha-1', 'beta-2']);

    await expectResponseContainsAll(page, editor, ['alpha-1', 'beta-2']);
  });

  test('an empty value is accepted and does not block the request', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'PV Empty');

    const editor = await newHttpRequest(
      page, sidebar, 'PV Empty', 'Empty Prompt Value',
      `${SERVER}/api/echo/query?token={{?EmptyKey}}&marker=sent`
    );

    await clickSend(editor);
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['']); // submit empty

    // Request still goes through (marker proves it was sent with the empty value).
    await expectResponseContains(page, editor, 'sent');
  });

  test('an invalid prompt pattern ({{? name}}) does not trigger the modal', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'PV Invalid');

    const editor = await newHttpRequest(
      page, sidebar, 'PV Invalid', 'Invalid Prompt Pattern', `${SERVER}/api/echo/query?token=literal`
    );
    // Leading space makes this NOT a valid prompt variable.
    await addRequestHeader(page, editor, 'x-prompt-header', '{{? Invalid}}');

    await clickSend(editor);

    // No modal blocks the send — the response arrives directly.
    await expectSentWithoutPrompt(page, editor);
  });

  test('a prompt on a commented out body line does not trigger the modal', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'PV Commented');

    // /raw-body echoes the body as sent, so a commented JSON body does not fail to parse.
    const editor = await newHttpRequest(
      page, sidebar, 'PV Commented', 'Commented Prompt', `${SERVER}/raw-body`, 'POST'
    );
    await fillJsonBody(page, editor, '{\n"marker":"sent"\n// ,"draft":"{{?Commented}}"\n}');

    await clickSend(editor);

    await expectSentWithoutPrompt(page, editor);
  });

  test('a prompt in an unchecked query param does not trigger the modal', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'PV Unchecked');

    const editor = await newHttpRequest(
      page, sidebar, 'PV Unchecked', 'Unchecked Prompt', `${SERVER}/api/echo/query?marker=sent`
    );
    await addQueryParam(page, editor, 'token', '{{?Unchecked}}', { enabled: false });

    await clickSend(editor);

    await expectSentWithoutPrompt(page, editor);
  });

  test('cancelling the modal aborts the request', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'PV Cancel');

    const editor = await newHttpRequest(
      page, sidebar, 'PV Cancel', 'Cancel Prompt', `${SERVER}/api/echo/query?token={{?ApiKey}}`
    );

    await clickSend(editor);
    await expectPromptModal(editor, 1);
    await cancelPrompt(editor);

    // The request was never sent, so no response status appears.
    await expectRequestAborted(page, editor);
  });
});

// ── OAuth2 token fetch ─────────────────────────────────────────────────────────

test.describe('Prompt variables — OAuth2', () => {

  test.beforeEach(async () => {
    await fetch(`${SERVER}/api/auth/oauth2/reset`, { method: 'POST' });
  });

  test('prompts in OAuth2 config are resolved when fetching the token', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'PV OAuth2');

    const editor = await newHttpRequest(
      page, sidebar, 'PV OAuth2', 'OAuth2 Prompt', `${SERVER}/api/auth/oauth2/resource`
    );

    // Configure OAuth2 client-credentials with prompt variables for the credentials.
    const L = buildCommonLocators(editor);
    const authTab = L.tabs.byText('Auth');
    await expect(authTab).toBeVisible({ timeout: 10_000 });
    await authTab.click();

    await selectDropdownItem(editor, L.oauth2.authModeSelector(), 'OAuth 2.0');
    await expect(L.oauth2.grantTypeSelector()).toBeVisible({ timeout: 10_000 });
    await selectDropdownItem(editor, L.oauth2.grantTypeSelector(), 'Client Credentials');
    await expect(L.oauth2.field('accessTokenUrl')).toBeVisible({ timeout: 5_000 });

    await fillOAuth2Field(page, editor, 'accessTokenUrl', `${SERVER}/api/auth/oauth2/client_credentials/token`);
    await fillOAuth2Field(page, editor, 'clientId', '{{?ClientId}}');
    await fillOAuth2Field(page, editor, 'clientSecret', '{{?ClientSecret}}');

    await expect(L.oauth2.credentialsPlacementSelector()).toBeVisible({ timeout: 5_000 });
    await selectDropdownItem(editor, L.oauth2.credentialsPlacementSelector(), 'Request Body');

    // Fetching the token triggers the prompt modal (2 distinct prompts).
    const getTokenBtn = L.oauth2.getTokenBtn();
    await expect(getTokenBtn).toBeEnabled({ timeout: 5_000 });
    await getTokenBtn.click();

    await expectPromptModal(editor, 2);
    await fillPromptAndContinue(editor, ['test-client', 'test-secret']);

    // Token is fetched only if the prompts interpolated to valid credentials.
    await expect(L.oauth2.tokenTitle().first()).toBeVisible({ timeout: 15_000 });

    // Sending re-runs prompt extraction — the auth config still holds
    // {{?ClientId}}/{{?ClientSecret}}, so the modal reappears and must be answered.
    const current = await getActiveEditorFrame(page, editor);
    const currentL = buildCommonLocators(current);
    await currentL.sendRequest().click();
    await expectPromptModal(current, 2);
    await fillPromptAndContinue(current, ['test-client', 'test-secret']);
    await expect(currentL.response.statusCode()).toContainText('200', { timeout: 30_000 });
  });
});
