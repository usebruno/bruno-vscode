import * as fs from 'fs';
import * as path from 'path';
import type { Frame, Page } from '@playwright/test';
import { test, expect } from '../utils/fixtures';
import {
  openBrunoSidebar,
  createCollection,
  findCollectionDir,
  openCollectionSettings,
  openEnvironmentsTab
} from '../utils/page/actions';
import { buildCommonLocators } from '../utils/page/locators';

/** Seed a collection environment on disk; the file watcher picks it up. */
function writeEnvironmentFile(collectionDir: string, name: string, vars: Record<string, string>): void {
  const envDir = path.join(collectionDir, 'environments');
  fs.mkdirSync(envDir, { recursive: true });
  const body = Object.entries(vars).map(([key, value]) => `  ${key}: ${value}`).join('\n');
  fs.writeFileSync(path.join(envDir, `${name}.bru`), `vars {\n${body}\n}\n`, 'utf8');
}

/** Open environment settings; "Configure" only appears once an environment exists. */
async function openEnvironmentSettings(
  page: Page,
  sidebar: Frame,
  collectionName: string,
  collectionDir: string
): Promise<Frame> {
  const settings = await test.step('open the collection with an environment on disk', async () => {
    writeEnvironmentFile(collectionDir, 'Local', { host: 'localhost' });
    return openCollectionSettings(page, sidebar, collectionName);
  });

  return test.step('the Environments tab opens with the .env section', async () => {
    const environments = await openEnvironmentsTab(page, settings);
    await expect(buildCommonLocators(environments).dotEnv.section()).toBeVisible();
    return environments;
  });
}

test.describe('.env files', () => {
  test('lists, edits and deletes .env files alongside environments', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'DotEnv Collection';
    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

    const collectionDir = findCollectionDir(tmpDir);
    const dotEnvPath = path.join(collectionDir, '.env');
    fs.writeFileSync(dotEnvPath, '# credentials\nHOST=localhost\n');

    const environments = await openEnvironmentSettings(page, sidebar, collectionName, collectionDir);
    const { dotEnv } = buildCommonLocators(environments);

    await test.step('the .env file on disk is listed in the .env section', async () => {
      await dotEnv.section().click();
      await expect(dotEnv.file('.env')).toBeVisible();
    });

    await test.step('opening the file shows its variables in the table view', async () => {
      await dotEnv.file('.env').click();
      await expect(dotEnv.varRow('HOST')).toBeVisible();
    });

    await test.step('adding a variable and saving writes it to the file', async () => {
      await dotEnv.varNameInputs().last().fill('PORT');
      await dotEnv.save().click();

      await expect(environments.getByText('Changes saved successfully')).toBeVisible();
      const content = fs.readFileSync(dotEnvPath, 'utf8');
      expect(content).toContain('PORT=');
      expect(content).toContain('HOST=localhost');
    });

    await test.step('deleting the file removes it from disk and from the list', async () => {
      await dotEnv.deleteFile().click();
      await buildCommonLocators(environments).modal.confirm().click();

      await expect(environments.getByText('.env file deleted!')).toBeVisible();
      expect(fs.existsSync(dotEnvPath)).toBe(false);
      await expect(dotEnv.file('.env')).toBeHidden();
    });
  });

  test('keeps comments when saving from the raw view', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'DotEnv Raw Collection';
    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

    const collectionDir = findCollectionDir(tmpDir);
    const dotEnvPath = path.join(collectionDir, '.env.local');
    fs.writeFileSync(dotEnvPath, '# staging credentials\nTOKEN=abc\n');

    const environments = await openEnvironmentSettings(page, sidebar, collectionName, collectionDir);
    const { dotEnv } = buildCommonLocators(environments);

    await test.step('the raw view shows the file content including comments', async () => {
      await dotEnv.section().click();
      await dotEnv.file('.env.local').click();
      await dotEnv.viewRaw().click();
      await expect(dotEnv.rawEditor()).toContainText('# staging credentials');
    });

    await test.step('saving from the raw view preserves comments and values', async () => {
      await dotEnv.saveRaw().click();

      await expect(environments.getByText('Changes saved successfully')).toBeVisible();
      const content = fs.readFileSync(dotEnvPath, 'utf8');
      expect(content).toContain('# staging credentials');
      expect(content).toContain('TOKEN=abc');
    });
  });
});
