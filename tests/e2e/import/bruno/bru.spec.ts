import * as path from 'path';
import { test, expect } from '../../utils/fixtures';
import { openBrunoSidebar, importCollection, findFilesNamed } from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

test.describe('Import Bruno collection', () => {

  test('TC-3617: Verify user Importing a Bruno collection (.BRU file)', { tag: '@sanity' }, async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const fixturePath = path.resolve(__dirname, 'fixtures/bruno-collection.json');
    const expectedName = 'Bruno Collection';
    await importCollection(page, sidebar, fixturePath, tmpDir, expectedName, 'bru');

    await test.step('Verify the imported Bruno collection is visible in the sidebar', async () => {
      const collectionRow = buildCommonLocators(sidebar).sidebar.collectionName(expectedName);
      await expect(collectionRow).toBeVisible();
    });

    await test.step('Verify the collection is stored as .bru files', async () => {
      expect(findFilesNamed(tmpDir, 'collection.bru')).toHaveLength(1);
      expect(findFilesNamed(tmpDir, 'ping.bru')).toHaveLength(1);
    });
  });
});
