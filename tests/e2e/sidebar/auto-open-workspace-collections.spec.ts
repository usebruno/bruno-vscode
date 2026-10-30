import * as path from 'path';
import { test, expect } from '../utils/fixtures';
import { openBrunoSidebar, expandCollection } from '../utils/page/actions';
import { buildCommonLocators } from '../utils/page/locators';

// A workspace folder with a nested bru collection and a yml collection.
const workspaceFixture = path.resolve(__dirname, 'fixtures/workspace-collections');
const collectionNames = ['Workspace Bru Collection', 'Workspace Yml Collection'];

test.describe('Auto-open workspace collections', () => {
  test.describe('with bruno.autoOpenWorkspaceCollections enabled', () => {
    test.use({ workspaceFixture, vscodeSettings: { 'bruno.autoOpenWorkspaceCollections': true } });

    test('Verify collections in the workspace folder are listed in the sidebar', async ({ page }) => {
      const sidebar = await openBrunoSidebar(page);
      const sidebarLoc = buildCommonLocators(sidebar).sidebar;

      await test.step('Verify each collection is listed', async () => {
        for (const name of collectionNames) {
          await expect(sidebarLoc.collectionName(name)).toBeVisible();
        }
      });

      await test.step('Verify the collection requests are loaded', async () => {
        await expandCollection(sidebar, 'Workspace Bru Collection');
        await expect(sidebarLoc.collectionItem('Ping')).toBeVisible();
      });
    });
  });

  test.describe('with the setting at its default', () => {
    test.use({ workspaceFixture });

    test('Verify collections in the workspace folder are not listed in the sidebar', async ({ page }) => {
      const sidebar = await openBrunoSidebar(page);
      const sidebarLoc = buildCommonLocators(sidebar).sidebar;

      await expect(sidebar.getByText('No collections found.')).toBeVisible();
      for (const name of collectionNames) {
        await expect(sidebarLoc.collectionName(name)).toHaveCount(0);
      }
    });
  });
});
