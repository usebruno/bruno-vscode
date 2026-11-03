import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '../utils/fixtures';
import {
  openBrunoSidebar,
  createCollection,
  createFolder,
  expandFolder,
  openTransientRequest,
  saveFileByKeyboard,
  setRequestUrl
} from '../utils/page/actions';
import { buildCommonLocators } from '../utils/page/locators';
import { TEST_SERVER_LOCAL_URL } from '../utils/urls';

test.describe('Save a transient request into a folder', () => {
  test('saved request shows up in the sidebar under the selected folder without a reload', async ({ page, tmpDir }) => {
    const collectionName = 'transient-request-collection';
    const folderName = 'folder-1';
    const requestName = 'request-1';
    const sidebar = await openBrunoSidebar(page);

    await test.step('Create a collection with a folder', async () => {
      await createCollection(page, sidebar, collectionName, tmpDir);
      await createFolder(sidebar, collectionName, folderName);
    });

    await test.step('Create a transient request and set its URL', async () => {
      const panel = await openTransientRequest(page, sidebar, collectionName);
      await setRequestUrl(page, panel, `${TEST_SERVER_LOCAL_URL}/ping`);
    });

    await test.step('Save with cmd+s and pick the folder in the save picker', async () => {
      const workbench = buildCommonLocators(page).workbench;
      const quickInputWidget = workbench.quickInput();

      await saveFileByKeyboard(page);

      await workbench.getQuickInputByLabel(folderName).click();
      await workbench.getQuickInputByLabel('Select this folder').click();

      await expect(quickInputWidget).toContainText('Enter a name for the request');
      await workbench.quickInputBox().fill(requestName);
      await page.keyboard.press('Enter');
      await expect(quickInputWidget).toBeHidden();
    });

    await test.step('Verify the request file was written inside the folder', async () => {
      expect(fs.existsSync(path.join(tmpDir, collectionName, folderName, `${requestName}.yml`))).toBe(true);
    });

    await test.step('Verify the request is visible under the folder in the sidebar', async () => {
      const sidebarLocators = buildCommonLocators(sidebar);

      await expandFolder(sidebar, folderName);
      await expect(sidebarLocators.sidebar.collectionItem(requestName)).toBeVisible({ timeout: 10_000 });
    });
  });
});
