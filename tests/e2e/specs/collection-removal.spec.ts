import { test, expect } from '../fixtures';
import {
  openBrunoSidebar,
  createCollection,
  removeCollection,
  createFolder,
  deleteItem,
  expandCollection,
} from '../utils/actions';

test.describe('Collection removal', () => {

  test('Removed collection does not reappear when creating a new collection', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);

    // Step 1: Create collection A
    const collectionA = 'Collection A';
    await createCollection(page, sidebar, collectionA, tmpDir);

    const rowA = sidebar
      .locator('[data-testid="sidebar-collection-row"]')
      .filter({ hasText: collectionA });
    await expect(rowA).toBeVisible();

    // Step 2: Remove collection A
    await removeCollection(page, sidebar, collectionA);
    await expect(rowA).not.toBeVisible({ timeout: 10_000 });

    // Step 3: Create collection B — this triggers workspace-config-updated
    // which re-reads workspace.yml. If collection A wasn't properly removed,
    // it will reappear here.
    const collectionB = 'Collection B';
    await createCollection(page, sidebar, collectionB, tmpDir);

    const rowB = sidebar
      .locator('[data-testid="sidebar-collection-row"]')
      .filter({ hasText: collectionB });
    await expect(rowB).toBeVisible();

    // Step 4: Verify collection A is still gone
    await expect(rowA).not.toBeVisible();

    // Step 5: Count total collections — should be exactly 1 (Collection B)
    const allCollections = sidebar.locator('[data-testid="sidebar-collection-row"]');
    // Filter to only the ones we created (exclude any pre-existing workspace collections)
    const ourCollections = allCollections.filter({ hasText: /Collection [AB]/ });
    await expect(ourCollections).toHaveCount(1);
  });

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

    const row = sidebar
      .locator('[data-testid="sidebar-collection-row"]')
      .filter({ hasText: collectionName });
    await expect(row).not.toBeVisible({ timeout: 10_000 });

    // Recreate with the same name in a different folder to avoid filesystem conflict
    const dir2 = path.join(tmpDir, 'round2');
    fs.mkdirSync(dir2, { recursive: true });
    await createCollection(page, sidebar, collectionName, dir2);
    await expect(row).toBeVisible();

    // Should be exactly 1 instance, not 2
    const matches = sidebar
      .locator('[data-testid="sidebar-collection-row"]')
      .filter({ hasText: collectionName });
    await expect(matches).toHaveCount(1);
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
    const folderRow = sidebar
      .locator('[data-testid="sidebar-collection-item-row"]')
      .filter({ hasText: folderName });
    await expect(folderRow).toBeVisible({ timeout: 10_000 });

    // Delete the folder
    await deleteItem(sidebar, folderName);

    // Verify it's gone
    await expect(folderRow).not.toBeVisible({ timeout: 10_000 });
  });

});
