import * as path from 'path';
import { test, expect } from '../utils/fixtures';
import {
  openBrunoSidebar,
  importCollection,
  openRequest,
} from '../utils/page/actions';
import { buildCommonLocators } from '../utils/page/locators';

// The active request's sidebar row carries this class when highlighted.
const ACTIVE_CLASS = /item-focused-in-tab/;

test.describe('Sidebar active item highlight', () => {
  test('highlights the request open in the active editor and moves with it', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const fixturePath = path.resolve(__dirname, 'fixtures/two-requests-collection.json');
    const collectionName = 'Highlight Collection';

    await importCollection(page, sidebar, fixturePath, tmpDir, collectionName);

    const row = (name: string) => buildCommonLocators(sidebar).sidebar.collectionItem(name);

    // Opening a request highlights its sidebar row.
    await openRequest(page, sidebar, collectionName, 'Alpha Request');
    await expect(row('Alpha Request')).toHaveClass(ACTIVE_CLASS, { timeout: 2_000 });

    // Opening another moves the highlight; the previous row is no longer active.
    await openRequest(page, sidebar, collectionName, 'Beta Request');
    await expect(row('Beta Request')).toHaveClass(ACTIVE_CLASS, { timeout: 2_000 });
    await expect(row('Alpha Request')).not.toHaveClass(ACTIVE_CLASS, { timeout: 2_000 });
  });
});
