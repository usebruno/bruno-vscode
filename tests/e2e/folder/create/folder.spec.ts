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

    await createCollection(sidebar, collectionName, tmpDir);
    await createFolder(sidebar, collectionName, folderName);

    const folderRow = buildCommonLocators(sidebar).sidebar.collectionItem(folderName);
    await expect(folderRow).toBeVisible();
    expect(findFilesWithName(tmpDir, 'folder.yml')).toHaveLength(1);
  });
});
