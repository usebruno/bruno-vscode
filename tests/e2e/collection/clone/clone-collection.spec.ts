import { test, expect } from '../../utils/fixtures';
import {
  openBrunoSidebar,
  createCollection,
  cloneCollection,
  findFilesWithName,
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

test.describe('Clone collection', () => {

  test('TC-3647: Verify the Cloning the collection from collection ellipse clone option', { tag: '@sanity' }, async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Source Collection';
    const locators = buildCommonLocators(sidebar);

    await test.step('Create a collection', async () => {
      await createCollection(page, sidebar, collectionName, tmpDir);
      await expect(locators.sidebar.collectionName(collectionName)).toBeVisible();
    });

    await test.step('Clone it from the collection ellipse menu', async () => {
      const cloneName = await cloneCollection(page, sidebar, collectionName, tmpDir);
      await expect(locators.sidebar.collectionById(collectionName)).toBeVisible();
      await expect(locators.sidebar.collectionName(cloneName)).toBeVisible();
    });

    await test.step('Verify the clone is stored as its own collection', async () => {
      expect(findFilesWithName(tmpDir, 'opencollection.yml')).toHaveLength(2);
    });
  });
});
