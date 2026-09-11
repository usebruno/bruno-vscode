import * as path from 'path';
import { test, expect } from '../utils/fixtures';
import { openBrunoSidebar, importCollection, openCollectionSettings } from '../utils/page/actions';
import { buildCommonLocators } from '../utils/page/locators';

test.describe('Collection overview', () => {
  test('Collection settings Overview shows the correct request count', async ({ page, tmpDir }) => {
    // Import a fixture with a known request count (2 root requests + 1 request
    // inside a folder = 3) rather than creating requests through the UI.
    const sidebar = await openBrunoSidebar(page);
    const fixturePath = path.resolve(__dirname, '../fixtures/request-count-collection.json');
    const collectionName = 'Request Count Collection';

    await importCollection(page, sidebar, fixturePath, tmpDir, collectionName);

    const settings = await openCollectionSettings(page, sidebar, collectionName);

    // The Overview's Requests line must report all 3 requests (including the one
    // nested in a folder).
    const requestsInfo = buildCommonLocators(settings).collectionSettings.requestsInfo();
    await expect(requestsInfo).toHaveText('3 requests in collection', { timeout: 5_000 });

    // Lazily-scanned requests are metadata-only (partial) until opened and must not be reported as "not loaded".
    const requestsNotLoaded = buildCommonLocators(settings).collectionSettings.requestsNotLoaded();
    await expect(requestsNotLoaded).toHaveCount(0);
  });
});
