import * as path from 'path';
import type { Frame } from '@playwright/test';
import { test, expect } from '../../utils/fixtures';
import {
  openBrunoSidebar,
  importCollection,
  expandCollection,
  openRequest,
  selectEnvironment,
  openEnvironmentsTab,
  openCollectionSettings
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

const FIXTURE = path.resolve(__dirname, './fixtures/environments-collection.json');
const COLLECTION_NAME = 'Environments Collection';
const REQUEST_NAME = 'Alpha Request';

test.describe('Environment selection across panels', () => {
  test('the selected environment reaches panels opened after the selection', async ({ page, tmpDir }) => {
    let sidebar!: Frame;
    let editor!: Frame;
    let envTab!: Frame;

    await test.step('import a collection with environments and open a request', async () => {
      sidebar = await openBrunoSidebar(page);
      await importCollection(page, sidebar, FIXTURE, tmpDir, COLLECTION_NAME);
      await expandCollection(sidebar, COLLECTION_NAME);
      editor = await openRequest(page, sidebar, COLLECTION_NAME, REQUEST_NAME);
    });

    await test.step('select Local environment while no other panel is open', async () => {
      await selectEnvironment(editor, 'Local');
    });

    await test.step('the Environments tab opened afterwards shows it as active', async () => {
      envTab = await openEnvironmentsTab(page, editor);
      const environments = buildCommonLocators(envTab).environments;
      await expect(environments.activeCheckmark('Local')).toBeVisible();
      await expect(environments.activeCheckmark('Staging')).toHaveCount(0);
      await expect(environments.selectorTrigger()).toHaveText(/Local/);
    });

    await test.step('Switching to Staging environment in the Environments tab moves the active marker', async () => {
      await selectEnvironment(envTab, 'Staging');

      const environments = buildCommonLocators(envTab).environments;
      await expect(environments.activeCheckmark('Staging')).toBeVisible();
      await expect(environments.activeCheckmark('Local')).toHaveCount(0);
    });

    await test.step('the already-open request tab follows the switch', async () => {
      const revealed = await openRequest(page, sidebar, COLLECTION_NAME, REQUEST_NAME);
      await expect(buildCommonLocators(revealed).environments.selectorTrigger()).toHaveText(/Staging/);
    });

    await test.step('collection settings opened afterwards shows the active environment', async () => {
      const settings = await openCollectionSettings(page, sidebar, COLLECTION_NAME);
      await expect(buildCommonLocators(settings).environments.selectorTrigger()).toHaveText(/Staging/);
    });
  });
});
