import * as fs from 'fs';
import * as path from 'path';
import type { Page, Frame } from '@playwright/test';
import { test, expect } from '../../utils/fixtures';
import { openBrunoSidebar, createCollection, expandCollection, openRequest, openRequestPaneTab, findCollectionDir } from '../../utils/page/actions';
import { getActiveEditorFrame } from '../../utils/page/oauth2-actions';
import { buildCommonLocators } from '../utils/page/locators';

// A request with a typed (object) pre-request var, a plain string pre-request var,
// and a post-response var (which holds a JS expression, so it must NOT get a type).
const TYPED_REQUEST_BRU = [
  'meta {', '  name: Typed', '  type: http', '  seq: 1', '}', '',
  'get {', '  url: https://usebruno.com/{{cfg}}', '  body: none', '  auth: inherit', '}', '',
  'vars:pre-request {', '  @object', '  cfg: {"host":"localhost"}', '  token: abc123', '}', '',
  'vars:post-response {', '  saved: res.body.token', '}', ''
].join('\n');

const FOLDER_NAME = 'Api';

const COLLECTION_ROOT_BRU = [
  'vars:pre-request {', '  @object', '  cfgCollection: {"scope":"collection"}', '}', ''
].join('\n');

const FOLDER_ROOT_BRU = [
  'meta {', `  name: ${FOLDER_NAME}`, '}', '',
  'vars:pre-request {', '  @object', '  cfgFolder: {"scope":"folder"}', '}', ''
].join('\n');

const NESTED_REQUEST_BRU = [
  'meta {', '  name: Nested', '  type: http', '  seq: 1', '}', '',
  'get {', '  url: https://usebruno.com/{{cfgFolder}}/{{cfgCollection}}', '  body: none', '  auth: inherit', '}', ''
].join('\n');

async function openTypedVars(page: Page, tmpDir: string): Promise<Frame> {
  const sidebar = await openBrunoSidebar(page);
  const collectionName = 'Typed Vars';
  await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

  const collectionDir = findCollectionDir(tmpDir);
  fs.writeFileSync(path.join(collectionDir, 'Typed.bru'), TYPED_REQUEST_BRU, 'utf8');

  const opened = await openRequest(page, sidebar, collectionName, 'Typed');
  // Re-acquire the editor frame (opening can replace the webview) before driving its tabs.
  const editor = await getActiveEditorFrame(page, opened);
  await openRequestPaneTab(editor, 'Vars');
  return editor;
}

// One VS Code launch, every acceptance criterion checked in sequence — launching a fresh
// instance per assertion is slow and flaky, so this stays a single test.
test.describe('Data types in request variables', () => {
  test('display, per-scope selector, dropdown options and type selection all work', async ({ page, tmpDir }) => {
    const editor = await openTypedVars(page, tmpDir);

    const reqTable = editor.locator('[data-testid="request-vars-req"]');
    await expect(reqTable).toBeVisible({ timeout: 15_000 });

    // The @object var round-trips from disk and renders as JSON, never "[object Object]".
    await expect(reqTable).toContainText('{"host":"localhost"}');
    await expect(reqTable).not.toContainText('[object Object]');

    // The type selector reflects the parsed data type per row.
    const cfgSelector = editor.locator('[data-testid="datatype-selector-cfg"]');
    const tokenSelector = editor.locator('[data-testid="datatype-selector-token"]');
    await expect(cfgSelector).toContainText('object');
    await expect(tokenSelector).toContainText('string');

    // Post-response vars hold a JS expression, so no data-type selector is offered.
    const resTable = editor.locator('[data-testid="request-vars-res"]');
    await expect(resTable).toBeVisible();
    await expect(resTable.locator('[data-testid^="datatype-selector-"]')).toHaveCount(0);

    // The dropdown is portaled to the body, so every option is reachable/visible even
    // though it opens over the last row / table edge.
    await tokenSelector.click();
    for (const type of ['string', 'number', 'boolean', 'object']) {
      await expect(editor.locator(`[data-testid="datatype-selector-token-${type}"]`)).toBeVisible();
    }

    // Choosing a type applies it in the UI and persists to disk on save (Cmd/Ctrl+S).
    const requestFile = path.join(findCollectionDir(tmpDir), 'Typed.bru');
    await editor.locator('[data-testid="datatype-selector-token-number"]').click();
    await expect(tokenSelector).toContainText('number');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+S' : 'Control+S');
    await expect.poll(() => fs.readFileSync(requestFile, 'utf8'), { timeout: 15_000 }).toContain('@number');

    // Reverting to the implicit 'string' default drops the annotation on disk.
    await tokenSelector.click();
    await editor.locator('[data-testid="datatype-selector-token-string"]').click();
    await expect(tokenSelector).toContainText('string');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+S' : 'Control+S');
    await expect.poll(() => fs.readFileSync(requestFile, 'utf8'), { timeout: 15_000 }).not.toContain('@number');
    // The object var's annotation is untouched throughout.
    expect(fs.readFileSync(requestFile, 'utf8')).toContain('@object');

    const locators = buildCommonLocators(editor);
    const cfgToken = locators.requestUrl.highlightedToken('cfg');
    await expect(cfgToken).toBeVisible({ timeout: 15_000 });

    const popover = locators.varPopover.container();
    await expect(async () => {
      await locators.requestUrl.editor().hover({ position: { x: 2, y: 2 } });
      await cfgToken.hover();
      await expect(popover).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 5_000 });

    const editableDisplay = locators.varPopover.editableDisplay();
    await expect(editableDisplay).toContainText('"host": "localhost"');
    await expect(popover).not.toContainText('[object Object]');

    await editableDisplay.click();
    const popoverEditor = locators.varPopover.editor();
    await expect(popoverEditor).toContainText('"host": "localhost"');
    await expect(popoverEditor).not.toContainText('[object Object]');
  });

  test('object vars inherited from folder and collection render as JSON in the popover', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Inherited Vars';
    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

    const collectionDir = findCollectionDir(tmpDir);
    const folderDir = path.join(collectionDir, FOLDER_NAME);
    fs.mkdirSync(folderDir, { recursive: true });
    fs.writeFileSync(path.join(collectionDir, 'collection.bru'), COLLECTION_ROOT_BRU, 'utf8');
    fs.writeFileSync(path.join(folderDir, 'folder.bru'), FOLDER_ROOT_BRU, 'utf8');
    fs.writeFileSync(path.join(folderDir, 'Nested.bru'), NESTED_REQUEST_BRU, 'utf8');

    await expandCollection(sidebar, collectionName);
    const folderRow = sidebar
      .locator('[data-testid="sidebar-collection-item-row"]')
      .filter({ hasText: FOLDER_NAME });
    await expect(folderRow).toBeVisible({ timeout: 15_000 });
    await folderRow.click();
    await expect(
      sidebar.locator('[data-testid="sidebar-collection-item-row"]').filter({ hasText: 'Nested' })
    ).toBeVisible({ timeout: 15_000 });

    // A click landing mid re-render never reaches the open-request handler.
    await page.waitForTimeout(1500);
    const opened = await openRequest(page, sidebar, collectionName, 'Nested');
    const editor = await getActiveEditorFrame(page, opened);

    const locators = buildCommonLocators(editor);
    const popover = locators.varPopover.container();

    for (const { name, scope } of [
      { name: 'cfgFolder', scope: 'folder' },
      { name: 'cfgCollection', scope: 'collection' }
    ]) {
      const token = locators.requestUrl.highlightedToken(name);
      await expect(token).toBeVisible({ timeout: 15_000 });

      await expect(async () => {
        await locators.requestUrl.editor().hover({ position: { x: 2, y: 2 } });
        await token.hover();
        await expect(popover).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 5_000 });

      await expect(locators.varPopover.editableDisplay()).toContainText(`"scope": "${scope}"`);
      await expect(popover).not.toContainText('[object Object]');

      await editor.evaluate(() => {
        document.querySelectorAll('.CodeMirror-brunoVarInfo').forEach((el) => el.remove());
      });
      await expect(locators.varPopover.all()).toHaveCount(0, { timeout: 5_000 });
    }
  });
});
