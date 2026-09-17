import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '../../utils/fixtures';
import {
  openBrunoSidebar,
  importMultipleCollections,
  openImportPanelWithFiles,
  mockBrowseDirectory,
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

const FIXTURES = {
  weather: path.resolve(__dirname, 'fixtures/weather-api-collection.json'),
  inventory: path.resolve(__dirname, 'fixtures/inventory-service-collection.json'),
};

test.describe('Bulk import', () => {

  test('imports multiple collections and honours the selection', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const fixtures = [FIXTURES.weather, FIXTURES.inventory];
    const expectedNames = ['Weather API', 'Inventory Service'];

    const importAllDir = path.join(tmpDir, 'import-all');
    const selectiveDir = path.join(tmpDir, 'selective');
    fs.mkdirSync(importAllDir, { recursive: true });
    fs.mkdirSync(selectiveDir, { recursive: true });

    await test.step('imports every collection in the selection', async () => {
      const editor = await importMultipleCollections(page, sidebar, fixtures, importAllDir, expectedNames);
      const importPanel = buildCommonLocators(editor).importCollection;

      const rows = importPanel.rows();
      await expect(rows).toHaveCount(2);
      for (let i = 0; i < 2; i++) {
        await expect(rows.nth(i)).toHaveAttribute('data-status', 'success');
      }

      for (const name of expectedNames) {
        expect(fs.existsSync(path.join(importAllDir, name, 'opencollection.yml'))).toBe(true);
      }

      await importPanel.close().click();
    });

    await test.step('imports only the collections left selected', async () => {
      const editor = await openImportPanelWithFiles(page, sidebar, fixtures);
      const importPanel = buildCommonLocators(editor).importCollection;

      const rows = importPanel.rows();
      const selectedCount = importPanel.selectedCount();
      await expect(rows).toHaveCount(2);
      await expect(selectedCount).toHaveText('2 of 2 selected');

      await test.step('searching narrows the rows without changing the selection', async () => {
        await importPanel.search().fill('Inventory');
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toContainText('Inventory Service');
        await expect(selectedCount).toHaveText('2 of 2 selected');
      });

      await test.step('deselecting a filtered row drops it from the selection', async () => {
        await buildCommonLocators(rows.first()).importCollection.rowCheckbox().uncheck();
        await expect(selectedCount).toHaveText('1 of 2 selected');

        await importPanel.search().fill('');
        await expect(rows).toHaveCount(2);
      });

      await mockBrowseDirectory(editor, selectiveDir);
      await importPanel.browse().click();
      await expect(importPanel.location()).toHaveValue(selectiveDir);

      await importPanel.submit().click();

      await expect(importPanel.progressSummary()).toHaveText('1 of 1 collections imported');
      expect(fs.existsSync(path.join(selectiveDir, 'Weather API', 'opencollection.yml'))).toBe(true);
      expect(fs.existsSync(path.join(selectiveDir, 'Inventory Service'))).toBe(false);
    });
  });
});
