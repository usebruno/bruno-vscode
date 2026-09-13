import { test, expect } from '../utils/fixtures';
import {
  openBrunoSidebar,
  createCollection,
  createTransientRequest,
  closeEditorTab,
} from '../utils/page/actions';
import { buildCommonLocators } from '../utils/page/locators';

test.describe('Transient request naming', () => {
  test('numbers new transient requests sequentially and reuses freed numbers', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Transient Name Collection';
    await createCollection(page, sidebar, collectionName, tmpDir);

    const tab = (title: string) => buildCommonLocators(page).workbench.editorTab(title);

    // First transient is "Untitled 1", the next increments to "Untitled 2".
    await createTransientRequest(sidebar, collectionName, 'http');
    await expect(tab('Untitled 1')).toBeVisible();

    await createTransientRequest(sidebar, collectionName, 'http');
    await expect(tab('Untitled 2')).toBeVisible({ timeout: 2_000 });

    // Closing frees both numbers.
    await closeEditorTab(page, 'Untitled 1');
    await closeEditorTab(page, 'Untitled 2');

    // A new transient reuses "Untitled 1" instead of continuing to "Untitled 3".
    await createTransientRequest(sidebar, collectionName, 'http');
    await expect(tab('Untitled 1')).toBeVisible({ timeout: 2_000 });
    await expect(tab('Untitled 3')).toHaveCount(0, { timeout: 2_000 });
  });
});
