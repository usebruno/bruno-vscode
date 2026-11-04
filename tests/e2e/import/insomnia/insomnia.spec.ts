import * as path from 'path';
import { test, expect } from '../../utils/fixtures';
import { openBrunoSidebar, importCollection } from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

test.describe('Import Insomnia collection', () => {

  test('TC-3612: Verify the Importing insomnia collection as .Yaml File', { tag: '@sanity' }, async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const fixturePath = path.resolve(__dirname, 'fixtures/insomnia-collection.yml');
    const expectedName = 'Insomnia Collection';
    await importCollection(page, sidebar, fixturePath, tmpDir, expectedName);

    await test.step('Verify the imported Insomnia collection is visible in the sidebar', async () => {
      const collectionRow = buildCommonLocators(sidebar).sidebar.collectionName(expectedName);
      await expect(collectionRow).toBeVisible();
    });
  });
});
