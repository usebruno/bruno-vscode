import * as path from 'path';
import { test, expect } from '../../utils/fixtures';
import {
  openBrunoSidebar,
  createCollection,
  createRequestByType,
  createFolder,
  expandCollection,
  collapseCollection,
  expandFolder,
  dragItemIntoFolder,
  findFilesWithName,
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
      await createCollection(sidebar, sourceCollection, tmpDir);
      await createCollection(sidebar, destinationCollection, tmpDir);
      await expect(locators.sidebar.collectionName(sourceCollection)).toBeVisible();
      await expect(locators.sidebar.collectionName(destinationCollection)).toBeVisible();
      await createRequestByType(sidebar, sourceCollection, { name: requestName, url: requestUrl });
      await createFolder(sidebar, destinationCollection, folderName);
    });

    await test.step('Drag the request into the destination folder', async () => {
      await expandCollection(sidebar, sourceCollection);
      await expandCollection(sidebar, destinationCollection);
      await dragItemIntoFolder(sidebar, requestName, folderName);
      // The tree expands the folder it was dropped in, so hide the destination to check the source is empty.
      await collapseCollection(sidebar, destinationCollection);
      await expect(locators.sidebar.collectionItem(requestName)).toHaveCount(0);
    });

    await test.step('Verify the request is inside the destination folder', async () => {
      await expandCollection(sidebar, destinationCollection);
      await expandFolder(sidebar, folderName);

      // The row was gone before the folder was expanded, so its return proves it moved there.
      await expect(locators.sidebar.collectionItem(requestName)).toBeVisible();
      const moved = findFilesWithName(tmpDir, `${requestName}.yml`);
      expect(moved).toHaveLength(1);
      expect(path.basename(path.dirname(moved[0]))).toBe(folderName);
    });
  });
});
