import { test, expect } from '../../utils/fixtures';
import {
  openBrunoSidebar,
  createCollection,
  removeCollection,
  createFolder,
  deleteItem,
  expandCollection,
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

test.describe('Collection removal', () => {

  test('TC-3645: Verify that Removing the collection from the sidebar and does not reappear when creating a new collection', { tag: '@sanity' },
    async ({ page, tmpDir }) => {
      const sidebar = await openBrunoSidebar(page);
      const collectionA = 'Collection A';
      const collectionB = 'Collection B';
      const sidebarLocators = buildCommonLocators(sidebar);
      const rowA = sidebarLocators.sidebar.collectionName(collectionA);
      const rowB = sidebarLocators.sidebar.collectionName(collectionB);

      await createCollection(page, sidebar, collectionA, tmpDir);
      await test.step('Verify collection A is visible', async () => {
        await expect(rowA).toBeVisible();
      });

      await test.step('Remove collection A', async () => {
        await removeCollection(page, sidebar, collectionA);
        await expect(rowA).not.toBeVisible({ timeout: 10_000 });
      });

      await test.step('Create collection B', async () => {
        await createCollection(page, sidebar, collectionB, tmpDir);
      });

      await test.step('Verify collection B is visible', async () => {
        await expect(rowB).toBeVisible();
      });

      await test.step('Verify collection A is still gone', async () => {
        await expect(rowA).not.toBeVisible();
      });

      await test.step('Count total collections', async () => {
        const ourCollections = sidebarLocators.sidebar.collectionName(/Collection [AB]/);
        await expect(ourCollections).toHaveCount(1);
      });
    }
  );

  test('Removing and recreating a collection with the same name works', async ({ page, tmpDir }) => {
    const fs = require('fs');
    const path = require('path');
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Ephemeral Collection';

    // Create → remove → recreate in a different subfolder
    const dir1 = path.join(tmpDir, 'round1');
    fs.mkdirSync(dir1, { recursive: true });
    await createCollection(page, sidebar, collectionName, dir1);
    await removeCollection(page, sidebar, collectionName);

    const row = buildCommonLocators(sidebar).sidebar.collectionName(collectionName);
    await expect(row).not.toBeVisible({ timeout: 10_000 });

    // Recreate with the same name in a different folder to avoid filesystem conflict
    const dir2 = path.join(tmpDir, 'round2');
    fs.mkdirSync(dir2, { recursive: true });
    await createCollection(page, sidebar, collectionName, dir2);
    await expect(row).toBeVisible();

    // Should be exactly 1 instance, not 2
    await expect(row).toHaveCount(1);
  });

  test('Deleted folder disappears from the sidebar', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Folder Delete Test';
    const folderName = 'my-folder';

    // Create a collection and a folder inside it
    await createCollection(page, sidebar, collectionName, tmpDir);
    await createFolder(sidebar, collectionName, folderName);

    // Expand the collection to see the folder
    await expandCollection(sidebar, collectionName);
    const folderRow = buildCommonLocators(sidebar).sidebar.collectionItem(folderName);
    await expect(folderRow).toBeVisible({ timeout: 10_000 });

    // Delete the folder
    await deleteItem(sidebar, folderName);

    // Verify it's gone
    await expect(folderRow).not.toBeVisible({ timeout: 10_000 });
  });

});
