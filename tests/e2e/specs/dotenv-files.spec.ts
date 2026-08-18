import * as fs from 'fs';
import * as path from 'path';
import type { Frame, Page } from '@playwright/test';
import { test, expect } from '../utils/fixtures';
import {
  openBrunoSidebar,
  createCollection,
  findCollectionDir,
  waitForNewWebviewFrame
} from '../utils/page/actions';
import { buildCommonLocators } from '../utils/page/locators';

/**
 * Open the environment settings panel. It is only reachable from the environment
 * selector in the collection toolbar, and the "Configure" entry only appears once
 * an environment exists, so one is created on the way in.
 */
async function openEnvironmentSettings(page: Page, sidebar: Frame, collectionName: string): Promise<Frame> {
  await buildCommonLocators(sidebar).sidebar.collectionName(collectionName).click();

  const settings = await waitForNewWebviewFrame(page, sidebar);
  await settings.locator('[data-testid="environment-selector-trigger"]').click();
  await settings.locator('#create-env').click();
  await settings.locator('#environment-name').fill('Local');
  await settings.locator('button').filter({ hasText: 'Create' }).last().click();

  const environments = await waitForNewWebviewFrame(page, settings);
  await expect(environments.locator('[data-testid="dotenv-files-section"]')).toBeVisible({ timeout: 15_000 });

  return environments;
}

test.describe('.env files', () => {
  test('lists, edits and deletes .env files alongside environments', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'DotEnv Collection';
    await createCollection(page, sidebar, collectionName, tmpDir);

    const dotEnvPath = path.join(findCollectionDir(tmpDir), '.env');
    fs.writeFileSync(dotEnvPath, '# credentials\nHOST=localhost\n');

    const environments = await openEnvironmentSettings(page, sidebar, collectionName);

    await environments.locator('[data-testid="dotenv-files-section"]').click();
    const dotEnvRow = environments.locator('[data-testid="dotenv-file-.env"]');
    await expect(dotEnvRow).toBeVisible({ timeout: 10_000 });

    await dotEnvRow.click();
    await expect(environments.locator('[data-testid="dotenv-var-row-HOST"]')).toBeVisible({ timeout: 10_000 });

    const lastNameInput = environments.locator('[data-testid^="dotenv-var-row-"] input[type="text"]').last();
    await lastNameInput.fill('PORT');
    await environments.locator('[data-testid="save-dotenv"]').click();

    await expect(async () => {
      expect(fs.readFileSync(dotEnvPath, 'utf8')).toContain('PORT=');
    }).toPass({ timeout: 10_000 });
    expect(fs.readFileSync(dotEnvPath, 'utf8')).toContain('HOST=localhost');

    await environments.locator('[data-testid="delete-dotenv-file"]').click();
    await environments.locator('button').filter({ hasText: 'Delete' }).last().click();

    await expect(async () => {
      expect(fs.existsSync(dotEnvPath)).toBe(false);
    }).toPass({ timeout: 10_000 });
    await expect(dotEnvRow).toBeHidden({ timeout: 10_000 });
  });

  test('keeps comments when saving from the raw view', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'DotEnv Raw Collection';
    await createCollection(page, sidebar, collectionName, tmpDir);

    const dotEnvPath = path.join(findCollectionDir(tmpDir), '.env.local');
    fs.writeFileSync(dotEnvPath, '# staging credentials\nTOKEN=abc\n');

    const environments = await openEnvironmentSettings(page, sidebar, collectionName);

    await environments.locator('[data-testid="dotenv-files-section"]').click();
    await environments.locator('[data-testid="dotenv-file-.env.local"]').click();
    await environments.locator('[data-testid="dotenv-view-raw"]').click();

    const editor = environments.locator('[data-testid="dotenv-raw-editor"] .CodeMirror');
    await expect(editor).toContainText('# staging credentials', { timeout: 10_000 });

    await environments.locator('[data-testid="save-dotenv-raw"]').click();

    await expect(async () => {
      const content = fs.readFileSync(dotEnvPath, 'utf8');
      expect(content).toContain('# staging credentials');
      expect(content).toContain('TOKEN=abc');
    }).toPass({ timeout: 10_000 });
  });
});
