import { test, expect } from '../../utils/fixtures';
import type { Frame, Page } from '@playwright/test';
import {
  createRequestByType,
  openWsRequest,
  addRequestHeader,
  setBearerToken,
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';
import {
  expectPromptModal,
  expectNoPromptModal,
  fillPromptAndContinue,
  cancelPrompt,
} from './prompt-actions';
import { WS_SERVER, setupCollection } from './request-actions';

/**
 * Prompt-variable coverage for WebSocket requests. `wsConnectOnly` resolves any
 * `{{?prompt}}` in the URL / headers / auth BEFORE opening the socket; the server
 * echoes the handshake bits in its welcome message (`{ path, header, authorization }`),
 * so we can assert they were resolved. Scenarios mirror the HTTP suite except the
 * variable-nested case — the WS pane has no Vars tab.
 */

/** Create a fresh collection + WebSocket request and open it. */
async function newWsRequest(
  page: Page,
  tmpDir: string,
  collectionName: string,
  name: string,
  url: string
): Promise<Frame> {
  const sidebar = await setupCollection(page, tmpDir, collectionName);
  await createRequestByType(page, sidebar, collectionName, { name, url, type: 'WebSocket' });
  return openWsRequest(page, sidebar, collectionName, name);
}

/** Trigger connect (resolves prompts first). */
async function connectWs(editor: Frame): Promise<void> {
  await buildCommonLocators(editor).ws.connectButton().click();
}

/** Assert the socket connected and the welcome message contains `text`. */
async function expectConnectedWelcomeContains(editor: Frame, text: string): Promise<void> {
  const ws = buildCommonLocators(editor).ws;
  await expect(ws.connectionStatusStrip()).toBeVisible();
  await expect(ws.incomingMessage()).toContainText(text);
}

test.describe('Prompt variables — WebSocket connect', () => {

  test('prompt in the WS URL is resolved before connecting', async ({ page, tmpDir }) => {
    const editor = await newWsRequest(page, tmpDir, 'WS URL', 'WS Prompt URL', `${WS_SERVER}/{{?WsPath}}`);

    await connectWs(editor);
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['wspath1']);

    // The welcome message echoes req.url, proving the path was interpolated.
    await expectConnectedWelcomeContains(editor, 'wspath1');
  });

  test('prompt in a WS header is resolved before connecting', async ({ page, tmpDir }) => {
    const editor = await newWsRequest(page, tmpDir, 'WS Header', 'WS Prompt Header', `${WS_SERVER}/`);
    await addRequestHeader(page, editor, 'x-prompt-header', '{{?HeaderValue}}');

    await connectWs(editor);
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['wsheader2']);

    // The welcome message echoes the x-prompt-header handshake header.
    await expectConnectedWelcomeContains(editor, 'wsheader2');
  });

  test('prompt in the WS bearer auth token is resolved before connecting', async ({ page, tmpDir }) => {
    const editor = await newWsRequest(page, tmpDir, 'WS Auth', 'WS Prompt Auth', `${WS_SERVER}/`);
    await setBearerToken(page, editor, '{{?AuthToken}}');

    await connectWs(editor);
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['wsauth3']);

    // The welcome message echoes the Authorization handshake header ("Bearer wsauth3").
    await expectConnectedWelcomeContains(editor, 'wsauth3');
  });

  test('the same prompt used twice in the URL is asked only once (dedup)', async ({ page, tmpDir }) => {
    const editor = await newWsRequest(page, tmpDir, 'WS Dedup', 'WS Dedup', `${WS_SERVER}/{{?Shared}}-{{?Shared}}`);

    await connectWs(editor);
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['dup']);

    // Path becomes /dup-dup.
    await expectConnectedWelcomeContains(editor, 'dup-dup');
  });

  test('multiple distinct prompts each get their own input', async ({ page, tmpDir }) => {
    const editor = await newWsRequest(page, tmpDir, 'WS Multi', 'WS Multi', `${WS_SERVER}/{{?First}}-{{?Second}}`);

    await connectWs(editor);
    await expectPromptModal(editor, 2);
    await fillPromptAndContinue(editor, ['one', 'two']);

    await expectConnectedWelcomeContains(editor, 'one-two');
  });

  test('an empty value is accepted and does not block the connection', async ({ page, tmpDir }) => {
    const editor = await newWsRequest(page, tmpDir, 'WS Empty', 'WS Empty', `${WS_SERVER}/pre{{?Empty}}post`);

    await connectWs(editor);
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['']);

    // Empty value collapses the path to /prepost.
    await expectConnectedWelcomeContains(editor, 'prepost');
  });

  test('an invalid prompt pattern ({{? name}}) does not trigger the modal', async ({ page, tmpDir }) => {
    const editor = await newWsRequest(page, tmpDir, 'WS Invalid', 'WS Invalid', `${WS_SERVER}/{{? Invalid}}`);

    await connectWs(editor);

    // No modal — the connection proceeds directly.
    await expect(buildCommonLocators(editor).ws.connectionStatusStrip()).toBeVisible();
    await expectNoPromptModal(editor);
  });

  test('cancelling the modal aborts the connection', async ({ page, tmpDir }) => {
    const editor = await newWsRequest(page, tmpDir, 'WS Cancel', 'WS Cancel', `${WS_SERVER}/{{?WsPath}}`);

    await connectWs(editor);
    await expectPromptModal(editor, 1);
    await cancelPrompt(editor);

    // Connection never opened — no status strip, connect button still present.
    const ws = buildCommonLocators(editor).ws;
    await expect(ws.connectionStatusStrip()).toHaveCount(0);
    await expect(ws.connectButton()).toBeVisible();
  });
});
