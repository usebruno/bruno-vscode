import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '../../utils/fixtures';
import { openBrunoSidebar, openCollectionFromDisk, expandCollection } from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

// Render showOpenDialog as a quick input so the folder picker can be driven.
test.use({ vscodeSettings: { 'files.simpleDialog.enable': true } });

// Copy a fixture folder into tmpDir so the watcher never touches the checked-in files.
const copyFixture = (fixtureName: string, tmpDir: string): string => {
  const target = path.join(tmpDir, fixtureName);
  fs.cpSync(path.resolve(__dirname, 'fixtures', fixtureName), target, { recursive: true });
  return target;
};

test.describe('Open collection', () => {
  const cases = [
    { title: 'bruno.json with version "1"', fixture: 'bru-with-version', name: 'Bru With Version' },
    { title: 'bruno.json without version', fixture: 'bru-without-version', name: 'Bru Without Version' },
    { title: 'bruno.json with a version other than "1"', fixture: 'bru-version-2', name: 'Bru Version 2' },
    { title: 'opencollection.yml with version', fixture: 'yml-with-version', name: 'Yml With Version' },
    { title: 'opencollection.yml without version', fixture: 'yml-without-version', name: 'Yml Without Version' }
  ];

  for (const { title, fixture, name } of cases) {
    test(`Verify user can open a collection with ${title}`, async ({ page, tmpDir }) => {
      const sidebar = await openBrunoSidebar(page);
      const collectionPath = copyFixture(fixture, tmpDir);
      const sidebarLoc = buildCommonLocators(sidebar).sidebar;

      await openCollectionFromDisk(page, sidebar, collectionPath);

      await test.step('Verify the collection is listed in the sidebar', async () => {
        await expect(sidebarLoc.collectionName(name)).toBeVisible();
      });

      await test.step('Verify the collection request is loaded', async () => {
        await expandCollection(sidebar, name);
        await expect(sidebarLoc.collectionItem('Ping')).toBeVisible();
      });

      await test.step('Verify no error notification is shown', async () => {
        await expect(buildCommonLocators(page).workbench.notificationToasts()).toHaveCount(0);
      });
    });
  }

  test('Verify a collection with an invalid bruno.json is rejected', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionPath = copyFixture('bru-invalid-config', tmpDir);

    await openCollectionFromDisk(page, sidebar, collectionPath);

    await test.step('Verify the format error is shown and nothing is opened', async () => {
      await expect(buildCommonLocators(page).workbench.getNotificationToastByText('bruno.json format is invalid')).toBeVisible();
      await expect(buildCommonLocators(sidebar).sidebar.collectionName('Bru Invalid Config')).toHaveCount(0);
    });
  });
});
