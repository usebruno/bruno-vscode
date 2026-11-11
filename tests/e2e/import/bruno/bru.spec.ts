import * as path from 'path';
import { test, expect } from '../../utils/fixtures';
import { openBrunoSidebar, importCollection, findFilesWithName } from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

test.describe('Import Bruno collection', () => {

  test('TC-3617: Verify user Importing a Bruno collection (.BRU file)', { tag: '@sanity' }, async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const fixturePath = path.resolve(__dirname, 'fixtures/bruno-collection.json');
    const expectedName = 'Bruno Collection';
    await importCollection(sidebar, fixturePath, tmpDir, expectedName, 'bru');

    await test.step('Verify the imported Bruno collection is visible in the sidebar', async () => {
      const collectionRow = buildCommonLocators(sidebar).sidebar.collectionName(expectedName);
      await expect(collectionRow).toBeVisible();
    });

    await test.step('Verify the collection is stored as .bru files', async () => {
      // An export without collection-level settings gets bruno.json only; collection.bru is written when there are some.
      expect(findFilesWithName(tmpDir, 'bruno.json')).toHaveLength(1);
      expect(findFilesWithName(tmpDir, 'ping.bru')).toHaveLength(1);
    });
  });
});
