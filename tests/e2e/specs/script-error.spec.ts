import * as fs from 'fs';
import * as path from 'path';
import type { Page, Frame } from '@playwright/test';
import { test, expect } from '../utils/fixtures';
import { buildCommonLocators } from '../utils/page/locators';
import {
  openBrunoSidebar,
  createCollection,
  createFolder,
  openNewRequestPanel,
  createRequest,
  openRequest,
  sendRequest,
  findCollectionDir,
  setCodeMirrorValue
} from '../utils/page/actions';

const TEST_SERVER = 'http://127.0.0.1:8081';

async function frameWith(page: Page, marker: string, timeout = 15_000): Promise<Frame> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      try {
        if ((await frame.locator(marker).count()) > 0) return frame;
      } catch {}
    }
    await page.waitForTimeout(400);
  }
  throw new Error(`No webview frame with ${marker} within ${timeout}ms`);
}

// `bru.setEnvVar` rejects names with spaces, so the failure comes from the sandbox itself.
const FAILING_REQUEST_BRU = [
  'meta {', '  name: Boom', '  type: http', '  seq: 1', '}', '',
  'get {', `  url: ${TEST_SERVER}/capture`, '  body: none', '  auth: inherit', '}', '',
  'script:post-response {',
  '  const a = 1;',
  '  bru.setEnvVar("Bad Name", "x");',
  '  console.log(a);',
  '}',
  ''
].join('\n');

const UNSENT_TOKEN = 'PRE_REQUEST_SHOULD_NOT_SEND';

const FAILING_PRE_REQUEST_BRU = [
  'meta {', '  name: PreBoom', '  type: http', '  seq: 1', '}', '',
  'get {', `  url: ${TEST_SERVER}/capture`, '  body: none', '  auth: inherit', '}', '',
  'headers {', `  x-token: ${UNSENT_TOKEN}`, '}', '',
  'script:pre-request {',
  '  bru.setEnvVar("Bad Name", "x");',
  '}',
  ''
].join('\n');

test.describe('Script errors in the response pane', () => {
  test('a failing post-response script renders a card with the source line and stack', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Script Error';

    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

    const collectionDir = findCollectionDir(tmpDir);
    fs.writeFileSync(path.join(collectionDir, 'Boom.bru'), FAILING_REQUEST_BRU, 'utf8');

    const editor = await openRequest(page, sidebar, collectionName, 'Boom');
    await sendRequest(editor, 200);

    const card = editor.locator('[data-testid="script-error-card"]').first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.locator('[data-testid="script-error-title"]')).toHaveText('Post-Response Script Error');
    await expect(card.locator('[data-testid="script-error-message"]')).toContainText('contains invalid characters');

    await expect(card.locator('[data-testid="script-error-source-label"]')).toContainText('Request');
    await expect(card.locator('[data-testid="script-error-file-path"]')).toHaveText('Boom.bru');
    await expect(card.getByTestId(/code-line-error-/)).toContainText('bru.setEnvVar("Bad Name", "x")');

    await expect(card.locator('[data-testid="script-error-stack"]')).toHaveCount(0);
    await card.locator('[data-testid="script-error-stack-toggle"]').click();
    await expect(card.locator('[data-testid="script-error-stack"]')).toContainText('Boom.bru');

    await card.locator('[data-testid="script-error-close"]').click();
    await expect(card).toBeHidden();
  });

  test('a failing pre-request script aborts the send and renders no response', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Pre Request Script Error';

    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

    const collectionDir = findCollectionDir(tmpDir);
    fs.writeFileSync(path.join(collectionDir, 'PreBoom.bru'), FAILING_PRE_REQUEST_BRU, 'utf8');

    const editor = await openRequest(page, sidebar, collectionName, 'PreBoom');
    await sendRequest(editor);

    const card = editor.locator('[data-testid="script-error-card"]').first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.locator('[data-testid="script-error-title"]')).toHaveText('Pre-Request Script Error');

    await expect(editor.locator('[data-testid="response-status-code"]')).toContainText('Error');
    await expect(editor.locator('[data-testid="response-preview-container"]')).toHaveCount(0);

    const captured = await (await fetch(`${TEST_SERVER}/last-capture`)).json() as { token: string | null };
    expect(captured.token).not.toBe(UNSENT_TOKEN);
  });

  test('the file path on the card jumps to the failing line in the script editor', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Script Error Navigation';

    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

    const collectionDir = findCollectionDir(tmpDir);
    fs.writeFileSync(path.join(collectionDir, 'Boom.bru'), FAILING_REQUEST_BRU, 'utf8');

    const editor = await openRequest(page, sidebar, collectionName, 'Boom');
    await sendRequest(editor, 200);

    const card = editor.locator('[data-testid="script-error-card"]').first();
    await expect(card).toBeVisible({ timeout: 15_000 });

    const filePath = card.locator('[data-testid="script-error-file-path"]');
    await expect(filePath).toHaveClass(/navigable/);
    await filePath.click();

    const postResponseEditor = editor.locator('[data-testid="post-response-script-editor"]');
    await expect(postResponseEditor).toBeVisible();
    await expect(postResponseEditor.locator('.cm-error-line-flash')).toHaveCount(1);
  });

  test('variables written before a script throws are still applied and persisted', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Partial Script Writes';

    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

    const collectionDir = findCollectionDir(tmpDir);
    fs.mkdirSync(path.join(collectionDir, 'environments'), { recursive: true });
    fs.writeFileSync(path.join(collectionDir, 'environments', 'Local.bru'), 'vars {\n  seed: SEED\n}\n', 'utf8');
    fs.writeFileSync(path.join(collectionDir, 'Boom.bru'), [
      'meta {', '  name: Boom', '  type: http', '  seq: 1', '}', '',
      'get {', `  url: ${TEST_SERVER}/capture`, '  body: none', '  auth: inherit', '}', '',
      'script:post-response {',
      "  bru.setEnvVar('envTok', 'ENVVAL');",
      "  bru.setEnvVar('Bad Name', 'x');",
      '}',
      ''
    ].join('\n'), 'utf8');

    const editor = await openRequest(page, sidebar, collectionName, 'Boom');

    await editor.locator('[data-testid="environment-selector-trigger"]').click();
    await editor.locator('.dropdown-item').filter({ hasText: 'Local' }).first().click();

    await sendRequest(editor, 200);

    await expect(editor.locator('[data-testid="script-error-card"]').first()).toBeVisible({ timeout: 15_000 });

    const envFile = path.join(collectionDir, 'environments', 'Local.bru');
    await expect.poll(() => fs.readFileSync(envFile, 'utf8'), { timeout: 15_000 }).toContain('envTok: ENVVAL');
  });
  test('a failing collection-level script is attributed to the collection, not the request', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Inherited Script Error';

    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

    const collectionDir = findCollectionDir(tmpDir);
    fs.writeFileSync(path.join(collectionDir, 'collection.bru'), [
      'script:post-response {',
      '  const fromCollection = 1;',
      "  throw new Error('boom from collection');",
      '}',
      ''
    ].join('\n'), 'utf8');

    // No request-level script, so this only resolves if a segment is recorded for the collection.
    fs.writeFileSync(path.join(collectionDir, 'Boom.bru'), [
      'meta {', '  name: Boom', '  type: http', '  seq: 1', '}', '',
      'get {', `  url: ${TEST_SERVER}/capture`, '  body: none', '  auth: inherit', '}', ''
    ].join('\n'), 'utf8');

    const editor = await openRequest(page, sidebar, collectionName, 'Boom');
    await sendRequest(editor, 200);

    const card = editor.locator('[data-testid="script-error-card"]').first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.locator('[data-testid="script-error-source-label"]')).toContainText('Collection');
    await expect(card.locator('[data-testid="script-error-file-path"]')).toHaveText('collection.bru');
    await expect(card.getByTestId(/code-line-error-/)).toContainText("throw new Error('boom from collection')");
  });
  test('an empty url with no script at all reports the url', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Empty Url';

    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

    const collectionDir = findCollectionDir(tmpDir);
    fs.writeFileSync(path.join(collectionDir, 'NoUrl.bru'), [
      'meta {', '  name: NoUrl', '  type: http', '  seq: 1', '}', '',
      'get {', '  url: ', '  body: none', '  auth: inherit', '}', ''
    ].join('\n'), 'utf8');

    const editor = await openRequest(page, sidebar, collectionName, 'NoUrl');
    await editor.locator('#send-request').click();

    await expect(editor.locator('.error').first()).toContainText('URL', { timeout: 15_000 });
    await expect(editor.locator('[data-testid="script-error-card"]')).toHaveCount(0);
  });
  test('a failing pre-request script wins over a host that would not resolve', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Bad Host';

    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

    const collectionDir = findCollectionDir(tmpDir);
    fs.writeFileSync(path.join(collectionDir, 'BadHost.bru'), [
      'meta {', '  name: BadHost', '  type: http', '  seq: 1', '}', '',
      'get {', '  url: http://does-not-exist-bruno-test.invalid/x', '  body: none', '  auth: inherit', '}', '',
      'script:pre-request {',
      "  bru.setEnvVar('Bad Name', 'x');",
      '}',
      ''
    ].join('\n'), 'utf8');

    const editor = await openRequest(page, sidebar, collectionName, 'BadHost');
    await sendRequest(editor);

    const card = editor.locator('[data-testid="script-error-card"]').first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.locator('[data-testid="script-error-title"]')).toHaveText('Pre-Request Script Error');
    await expect(editor.locator('.error')).toHaveCount(0);
  });

  test('closing the card leaves the script error reachable from the icon', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Script Error Icon';

    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

    const collectionDir = findCollectionDir(tmpDir);
    fs.writeFileSync(path.join(collectionDir, 'PreBoom.bru'), FAILING_PRE_REQUEST_BRU, 'utf8');

    const editor = await openRequest(page, sidebar, collectionName, 'PreBoom');
    await sendRequest(editor);

    const card = editor.locator('[data-testid="script-error-card"]').first();
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card.locator('[data-testid="script-error-close"]').click();
    await expect(editor.locator('[data-testid="script-error-card"]')).toHaveCount(0);

    await editor.locator('[data-testid="script-error-icon"]').first().click();
    await expect(card).toBeVisible();
    await expect(card.locator('[data-testid="script-error-title"]')).toHaveText('Pre-Request Script Error');
  });

  test('a folder script that was never saved reports its error and opens on click', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Unsaved Folder Script';

    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');
    await createFolder(sidebar, collectionName, 'sub');

    const newRequestPanel = await openNewRequestPanel(page, sidebar, 'sub', true);
    await createRequest(page, newRequestPanel, sidebar, collectionName, 'Boom', `${TEST_SERVER}/capture`);

    await buildCommonLocators(sidebar).sidebar.collectionItem('sub').click();

    const settings = await frameWith(page, '[data-testid="folder-settings"]');
    await settings.locator('[role="tab"]').filter({ hasText: 'Script' }).first().click();
    await settings.locator('.tab-trigger').filter({ hasText: 'Post Response' }).first().click();

    const folderScript = settings.locator('[data-testid="folder-post-response-script-editor"]');
    await expect(folderScript.locator('.CodeMirror')).toBeVisible({ timeout: 15_000 });
    await setCodeMirrorValue(page, folderScript.locator('.CodeMirror'), "throw new Error('boom from the folder draft');");

    const editor = await openRequest(page, sidebar, collectionName, 'Boom');
    await sendRequest(editor, 200);

    const card = editor.locator('[data-testid="script-error-card"]').first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.locator('[data-testid="script-error-title"]')).toHaveText('Post-Response Script Error');
    await expect(card.locator('[data-testid="script-error-source-label"]')).toContainText('Folder');
    await expect(card.locator('[data-testid="script-error-file-path"]')).toHaveText('sub/folder.bru');
    await expect(card.getByTestId(/code-line-error-/)).toContainText('boom from the folder draft');

    await card.locator('[data-testid="script-error-file-path"]').click();
    await expect(folderScript).toBeVisible({ timeout: 15_000 });
    await expect(folderScript.locator('.cm-error-line-flash')).toHaveCount(1);
  });

  test('following a folder error does not lock the editor to the errored script', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Folder Error Editing';

    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');
    await createFolder(sidebar, collectionName, 'sub');

    const collectionDir = findCollectionDir(tmpDir);
    fs.writeFileSync(path.join(collectionDir, 'sub', 'folder.bru'), [
      'meta {', '  name: sub', '}', '',
      'script:pre-request {',
      "  throw new Error('boom before the request');",
      '}',
      ''
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(collectionDir, 'sub', 'Boom.bru'), [
      'meta {', '  name: Boom', '  type: http', '  seq: 1', '}', '',
      'get {', `  url: ${TEST_SERVER}/capture`, '  body: none', '  auth: inherit', '}', ''
    ].join('\n'), 'utf8');

    await buildCommonLocators(sidebar).sidebar.folderChevron('sub').click();

    const editor = await openRequest(page, sidebar, collectionName, 'Boom');
    await sendRequest(editor);

    const card = editor.locator('[data-testid="script-error-card"]').first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.locator('[data-testid="script-error-title"]')).toHaveText('Pre-Request Script Error');
    await card.locator('[data-testid="script-error-file-path"]').click();

    const settings = await frameWith(page, '[data-testid="folder-settings"]');
    const preRequest = settings.locator('[data-testid="folder-pre-request-script-editor"]');
    await expect(preRequest).toBeVisible({ timeout: 15_000 });
    await expect(preRequest.locator('.cm-error-line-flash')).toHaveCount(1);

    await setCodeMirrorValue(page, preRequest.locator('.CodeMirror'), "throw new Error('edited');");
    await expect(preRequest.locator('.cm-error-line-flash')).toHaveCount(0);

    await settings.locator('.tab-trigger').filter({ hasText: 'Post Response' }).first().click();
    const postResponse = settings.locator('[data-testid="folder-post-response-script-editor"]');
    await expect(postResponse).toBeVisible();

    await setCodeMirrorValue(page, postResponse.locator('.CodeMirror'), 'const edited = 1;');

    await expect(postResponse).toBeVisible();
    await expect(preRequest).toBeHidden();
    await expect(postResponse).toContainText('const edited = 1;');
    await expect(postResponse.locator('.cm-error-line-flash')).toHaveCount(0);
  });

  test('a failing pre-request script wins over an empty url', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Empty Url Script';

    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

    const collectionDir = findCollectionDir(tmpDir);
    fs.writeFileSync(path.join(collectionDir, 'NoUrl.bru'), [
      'meta {', '  name: NoUrl', '  type: http', '  seq: 1', '}', '',
      'get {', '  url: ', '  body: none', '  auth: inherit', '}', '',
      'script:pre-request {',
      "  bru.setEnvVar('Bad Name', 'x');",
      '}',
      ''
    ].join('\n'), 'utf8');

    const editor = await openRequest(page, sidebar, collectionName, 'NoUrl');
    await sendRequest(editor);

    const card = editor.locator('[data-testid="script-error-card"]').first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.locator('[data-testid="script-error-title"]')).toHaveText('Pre-Request Script Error');
    await expect(editor.locator('.error')).toHaveCount(0);
  });
});
