import * as fs from 'fs';
import * as path from 'path';
import type { Page, Frame } from '@playwright/test';
import { test, expect } from '../../utils/fixtures';
import { openBrunoSidebar, createCollection, openRequest, createFolder, findCollectionDir } from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

// Scan the webview frames for the one exposing `marker`, re-acquiring after a panel opens.
async function frameWith(page: Page, marker: string, timeout = 15_000): Promise<Frame> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      try {
        if ((await frame.locator(marker).count()) > 0) return frame;
      } catch {
        /* frame detached mid-scan */
      }
    }
    await page.waitForTimeout(400);
  }
  throw new Error(`No webview frame with ${marker} within ${timeout}ms`);
}

test.describe('Data types in collection & environment variables', () => {
  test('collection Vars: an object value shows as JSON with a type selector reflecting the on-disk type', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Typed Coll';
    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

    const collectionDir = findCollectionDir(tmpDir);
    fs.writeFileSync(path.join(collectionDir, 'collection.bru'), [
      'vars:pre-request {', '  @object', '  cfg: {"host":"localhost"}', '  tok: plain', '}', ''
    ].join('\n'), 'utf8');

    // Open collection settings by clicking the collection name, then the Vars tab.
    await buildCommonLocators(sidebar).sidebar.collectionName(collectionName).click();
    const settings = await frameWith(page, '[data-testid="collection-settings"]');
    await settings.locator('[role="tab"]').filter({ hasText: 'Vars' }).first().click();

    const table = settings.locator('[data-testid="collection-vars-req"]');
    await expect(table).toBeVisible({ timeout: 15_000 });
    // Parsed from disk, the object renders as JSON and the collection doesn't break.
    await expect(table).toContainText('{"host":"localhost"}');
    await expect(table).not.toContainText('[object Object]');
    // The selector reflects the on-disk data type.
    await expect(settings.locator('[data-testid="datatype-selector-cfg"]')).toContainText('object');
    await expect(settings.locator('[data-testid="datatype-selector-tok"]')).toContainText('string');

    // Change tok -> number and Save; the collection file gains @number, @object survives.
    const collectionFile = path.join(collectionDir, 'collection.bru');
    await settings.locator('[data-testid="datatype-selector-tok"]').click();
    await settings.locator('[data-testid="datatype-selector-tok-number"]').click();
    await expect(settings.locator('[data-testid="datatype-selector-tok"]')).toContainText('number');
    await settings.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => fs.readFileSync(collectionFile, 'utf8'), { timeout: 15_000 }).toContain('@number');
    expect(fs.readFileSync(collectionFile, 'utf8')).toContain('@object');
  });

  test('environment Vars: typed values display, and choosing a type persists it to the env file', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Typed Env';
    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

    const collectionDir = findCollectionDir(tmpDir);
    fs.mkdirSync(path.join(collectionDir, 'environments'), { recursive: true });
    const envFile = path.join(collectionDir, 'environments', 'Local.bru');
    // Environment vars use the `vars { }` block (not `vars:pre-request`).
    fs.writeFileSync(envFile, ['vars {', '  @object', '  cfg: {"host":"localhost"}', '  tok: plain', '}', ''].join('\n'), 'utf8');
    // A request is needed so the environment selector renders in the editor toolbar.
    fs.writeFileSync(path.join(collectionDir, 'Ping.bru'), [
      'meta {', '  name: Ping', '  type: http', '  seq: 1', '}', '',
      'get {', '  url: https://usebruno.com', '  body: none', '  auth: inherit', '}', ''
    ].join('\n'), 'utf8');

    const editor = await openRequest(page, sidebar, collectionName, 'Ping');
    await editor.locator('[data-testid="environment-selector-trigger"]').click();
    await editor.locator('.dropdown-item').filter({ hasText: 'Local' }).first().click();

    // Re-open the selector and click "Configure" to open the environment settings panel.
    await editor.locator('[data-testid="environment-selector-trigger"]').click();
    await editor.locator('#configure-env').click();

    const envSettings = await frameWith(page, '[data-testid="save-env"]');
    // The @object env var round-trips from disk and renders as JSON (the env editor
    // pretty-prints, so assert on format-agnostic substrings rather than the exact JSON string).
    const cfgRow = envSettings.locator('[data-testid="env-var-row-cfg"]');
    await expect(cfgRow).toContainText('"host"');
    await expect(cfgRow).toContainText('localhost');
    await expect(cfgRow).not.toContainText('[object Object]');
    await expect(envSettings.locator('[data-testid="datatype-selector-cfg"]')).toContainText('object');

    // Change `tok` to number and save — the env file gains the @number annotation.
    await envSettings.locator('[data-testid="datatype-selector-tok"]').click();
    await envSettings.locator('[data-testid="datatype-selector-tok-number"]').click();
    await expect(envSettings.locator('[data-testid="datatype-selector-tok"]')).toContainText('number');
    await envSettings.locator('[data-testid="save-env"]').click();
    await expect.poll(() => fs.readFileSync(envFile, 'utf8'), { timeout: 15_000 }).toContain('@number');
    // The pre-existing @object annotation survives the save.
    expect(fs.readFileSync(envFile, 'utf8')).toContain('@object');
  });

  test('folder Vars: an object value shows as JSON with a type selector reflecting the on-disk type', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Typed Folder';
    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');
    await createFolder(sidebar, collectionName, 'sub');

    const collectionDir = findCollectionDir(tmpDir);
    fs.writeFileSync(path.join(collectionDir, 'sub', 'folder.bru'), [
      'vars:pre-request {', '  @object', '  cfg: {"host":"localhost"}', '  tok: plain', '}', ''
    ].join('\n'), 'utf8');

    // Open folder settings via the folder row's context menu.
    const folderRow = sidebar.locator('[data-testid="sidebar-collection-item-row"]').filter({ hasText: 'sub' });
    await folderRow.hover();
    await folderRow.locator('[data-testid="collection-item-menu"]').click();
    await sidebar.locator('[role="menuitem"]').filter({ hasText: 'Settings' }).click();

    const settings = await frameWith(page, '[data-testid="folder-settings"]');
    await settings.locator('[role="tab"]').filter({ hasText: 'Vars' }).first().click();

    const table = settings.locator('[data-testid="folder-vars-req"]');
    await expect(table).toBeVisible({ timeout: 15_000 });
    await expect(table).toContainText('{"host":"localhost"}');
    await expect(table).not.toContainText('[object Object]');
    await expect(settings.locator('[data-testid="datatype-selector-cfg"]')).toContainText('object');
    await expect(settings.locator('[data-testid="datatype-selector-tok"]')).toContainText('string');

    // Change tok -> number and Save; the folder file gains @number, @object survives.
    const folderFile = path.join(collectionDir, 'sub', 'folder.bru');
    await settings.locator('[data-testid="datatype-selector-tok"]').click();
    await settings.locator('[data-testid="datatype-selector-tok-number"]').click();
    await expect(settings.locator('[data-testid="datatype-selector-tok"]')).toContainText('number');
    await settings.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => fs.readFileSync(folderFile, 'utf8'), { timeout: 15_000 }).toContain('@number');
    expect(fs.readFileSync(folderFile, 'utf8')).toContain('@object');
  });
});
