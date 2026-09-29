import * as path from 'path';
import { test, expect } from '../../utils/fixtures';
import { openBrunoSidebar, importCollection } from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

test.describe('Import Postman collection', () => {

  test('TC-3613: Verify the Import multiple postman collection from file as (.Json) file', { tag: '@sanity' }, async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const fixturePath = path.resolve(__dirname, 'fixtures/postman-collection.json');
    const expectedName = 'Postman_Collection';
    await importCollection(page, sidebar, fixturePath, tmpDir, expectedName);

    await test.step('Verify the imported postman collection is visible in the sidebar', async () => {
      const collectionRow = buildCommonLocators(sidebar).sidebar.collectionName(expectedName);
      await expect(collectionRow).toBeVisible();
    });
  });
});
