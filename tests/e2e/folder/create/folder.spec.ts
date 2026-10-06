import { test, expect } from '../../utils/fixtures';
import {
  openBrunoSidebar,
  createCollection,
  createFolder,
  findFilesWithName,
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

test.describe('Folder management', () => {

  test('TC-3648:Verify Adding a new folder under collection', { tag: '@sanity' }, async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Folder Collection';
    const folderName = 'Orders';

    await createCollection(page, sidebar, collectionName, tmpDir);
    await createFolder(sidebar, collectionName, folderName);

    const collectionId = `collection-${collectionName.replace(/\s+/g, '-').toLowerCase()}`;
    const folderRow = buildCommonLocators(sidebar.locator(`#${collectionId}`)).sidebar.collectionItem(folderName);
    await expect(folderRow).toBeVisible();
    expect(findFilesWithName(tmpDir, 'folder.yml')).toHaveLength(1);
  });
});
