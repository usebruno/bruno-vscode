import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '../../utils/fixtures';
import { openBrunoSidebar, importCollections, openImportReview } from '../../utils/page/actions';

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
      await importCollections(sidebar, fixtures, importAllDir, expectedNames);

      for (const name of expectedNames) {
        expect(fs.existsSync(path.join(importAllDir, name, 'opencollection.yml'))).toBe(true);
      }
    });

    await test.step('imports only the collections left checked', async () => {
      const review = await openImportReview(sidebar, fixtures);

      await expect(review.rows()).toHaveCount(2);
      for (const name of expectedNames) {
        await expect(review.checkbox(name)).toBeChecked();
      }

      await test.step('filtering narrows the rows without changing the selection', async () => {
        await review.filter('Inventory');
        await expect(review.rows()).toHaveCount(1);
        await expect(review.row('Inventory Service')).toBeVisible();

        await review.filter('');
        await expect(review.rows()).toHaveCount(2);
        for (const name of expectedNames) {
          await expect(review.checkbox(name)).toBeChecked();
        }
      });

      await test.step('unchecking a filtered row drops it from the import', async () => {
        await review.filter('Inventory');
        await review.checkbox('Inventory Service').uncheck();

        await review.filter('');
        await expect(review.rows()).toHaveCount(2);
        await expect(review.checkbox('Inventory Service')).not.toBeChecked();
        await expect(review.checkbox('Weather API')).toBeChecked();
      });

      await review.submit(selectiveDir, 'yml');

      // A second "Weather API" row joins the one from the first step.
      await expect(sidebar.locators.collectionName('Weather API')).toHaveCount(2, { timeout: 20_000 });
      expect(fs.existsSync(path.join(selectiveDir, 'Weather API', 'opencollection.yml'))).toBe(true);
      expect(fs.existsSync(path.join(selectiveDir, 'Inventory Service'))).toBe(false);
    });
  });
});
