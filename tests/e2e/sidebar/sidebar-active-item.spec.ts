import * as path from 'path';
import { test, expect } from '../utils/fixtures';
import {
  openBrunoSidebar,
  importCollection,
  openRequest,
} from '../utils/page/actions';
import { buildCommonLocators } from '../utils/page/locators';

test.describe('Sidebar active item highlight', () => {
  test('highlights the request open in the active editor and moves with it', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const fixturePath = path.resolve(__dirname, 'fixtures/two-requests-collection.json');
    const collectionName = 'Highlight Collection';

    await importCollection(sidebar, fixturePath, tmpDir, collectionName);

    // The tree marks the row of the request shown in the active editor as selected.
    const row = (name: string) => buildCommonLocators(sidebar).sidebar.collectionItem(name);

    await openRequest(page, sidebar, collectionName, 'Alpha Request');
    await expect(row('Alpha Request')).toHaveAttribute('aria-selected', 'true');

    // Opening another moves the selection; the previous row loses it.
    await openRequest(page, sidebar, collectionName, 'Beta Request');
    await expect(row('Beta Request')).toHaveAttribute('aria-selected', 'true');
    await expect(row('Alpha Request')).not.toHaveAttribute('aria-selected', 'true');
  });
});
