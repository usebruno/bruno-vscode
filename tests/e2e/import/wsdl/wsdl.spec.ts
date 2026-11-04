import * as path from 'path';
import { test, expect } from '../../utils/fixtures';
import { openBrunoSidebar, importCollection } from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

test.describe('Import WSDL collection', () => {

  test('TC-3624: Verify user Importing a WSDL collection (.WSDL file)', { tag: '@sanity' }, async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const fixturePath = path.resolve(__dirname, 'fixtures/wsdl-collection.wsdl');
    const expectedName = 'WSDL Collection';
    await importCollection(page, sidebar, fixturePath, tmpDir, expectedName);

    await test.step('Verify the imported WSDL collection is visible in the sidebar', async () => {
      const collectionRow = buildCommonLocators(sidebar).sidebar.collectionName(expectedName);
      await expect(collectionRow).toBeVisible();
    });
  });
});
