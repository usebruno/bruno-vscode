import * as path from 'path';
import { test, expect } from '../../utils/fixtures';
import {
  openBrunoSidebar,
  createCollection,
  openNewRequestPanel,
  createRequest,
  createFolder,
  expandCollection,
  expandFolder,
  dragItemIntoFolder,
  findFilesNamed,
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

test.describe('Drag and drop requests', () => {

  test('TC-3515: Verify that the Drag and drop of a request to specific folder in destination collection', { tag: '@sanity' }, async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const sourceCollection = 'Source Collection';
    const destinationCollection = 'Destination Collection';
    const requestName = 'Ping';
    const folderName = 'Orders';
    const requestUrl = 'https://echo.usebruno.com/ping';
    const locators = buildCommonLocators(sidebar);

    await test.step('Create source request and destination collectionss folder', async () => {
      await createCollection(page, sidebar, sourceCollection, tmpDir);
      await createCollection(page, sidebar, destinationCollection, tmpDir);
      await expect(locators.sidebar.collectionName(sourceCollection)).toBeVisible();
      await expect(locators.sidebar.collectionName(destinationCollection)).toBeVisible();
      const newReqPanel = await openNewRequestPanel(page, sidebar, sourceCollection);
      await createRequest(page, newReqPanel, sidebar, sourceCollection, requestName, requestUrl);
      await createFolder(sidebar, destinationCollection, folderName);
    });

    await test.step('Drag the request into the destination folder', async () => {
      await expandCollection(sidebar, sourceCollection);
      await expandCollection(sidebar, destinationCollection);
      await dragItemIntoFolder(sidebar, requestName, folderName);
      await expect(locators.sidebar.collectionItem(requestName)).toHaveCount(0);
    });

    await test.step('Verify the request is inside the destination folder', async () => {
      await expandCollection(sidebar, destinationCollection);
      await expandFolder(sidebar, folderName);

      const folderRow = locators.sidebar.collectionItem(folderName);
      const requestInFolder = buildCommonLocators(folderRow.locator('..')).sidebar.collectionItem(requestName);
      await expect(requestInFolder).toBeVisible();
      const moved = findFilesNamed(tmpDir, `${requestName}.yml`);
      expect(moved).toHaveLength(1);
      expect(path.basename(path.dirname(moved[0]))).toBe(folderName);
    });
  });
});
