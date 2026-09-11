import * as path from 'path';
import type { Page, Frame } from '@playwright/test';
import { test, expect } from '../../utils/fixtures';
import { openBrunoSidebar, importCollection, expandCollection, openRequest } from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

const FIXTURE = path.resolve(__dirname, './fixtures/environments-collection.json');
const COLLECTION_NAME = 'Environments Collection';
const REQUEST_NAME = 'Alpha Request';

async function waitForFrameWithMarker(
  page: Page,
  known: Frame[],
  marker: string,
  timeout = 20_000
): Promise<Frame> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame() || known.includes(frame)) continue;
      try {
        if (await frame.locator(marker).count() > 0) return frame;
      } catch (err) {
        console.debug('Frame detached while searching for', marker, err);
      }
    }
    await page.waitForTimeout(500);
  }

  throw new Error(`No webview frame matching "${marker}" appeared within ${timeout}ms`);
}

async function selectEnvironment(frame: Frame, environmentName: string): Promise<void> {
  const environments = buildCommonLocators(frame).environments;
  await environments.selectorTrigger().click();
  await environments.dropdownItem(environmentName).click();
  await expect(environments.selectorTrigger()).toHaveText(new RegExp(environmentName));
}

async function openEnvironmentsTab(page: Page, from: Frame, known: Frame[]): Promise<Frame> {
  const environments = buildCommonLocators(from).environments;
  await environments.selectorTrigger().click();
  await environments.configureButton().click();
  return waitForFrameWithMarker(page, known, '[data-testid="environments-list"]');
}

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

    await test.step('select an environment while no other panel is open', async () => {
      await selectEnvironment(editor, 'Local');
    });

    await test.step('the Environments tab opened afterwards shows it as active', async () => {
      envTab = await openEnvironmentsTab(page, editor, [sidebar, editor]);
      const environments = buildCommonLocators(envTab).environments;
      await expect(environments.activeCheckmark('Local')).toBeVisible();
      await expect(environments.activeCheckmark('Staging')).toHaveCount(0);
      await expect(environments.selectorTrigger()).toHaveText(/Local/);
    });

    await test.step('switching environments in the Environments tab moves the active marker', async () => {
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
      await buildCommonLocators(sidebar).sidebar.collectionName(COLLECTION_NAME).click();
      const settings = await waitForFrameWithMarker(
        page,
        [sidebar, editor, envTab],
        '[data-testid="collection-settings"]'
      );
      await expect(buildCommonLocators(settings).environments.selectorTrigger()).toHaveText(/Staging/);
    });
  });
});
