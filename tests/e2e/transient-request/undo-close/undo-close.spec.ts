import type { Frame, Page } from '@playwright/test';
import { test, expect } from '../../utils/fixtures';
import {
  closeEditorTab,
  getWebviewFrame,
  openBrunoSidebar,
  openTransientRequest,
  sendRequest,
  setRequestUrl
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';
import { TEST_SERVER_LOCAL_URL } from '../../utils/urls';

test.use({ vscodeSettings: { 'files.simpleDialog.enable': true } });

// Close the panel, click Undo and return the restored frame
async function closeAndUndo(page: Page, sidebar: Frame): Promise<Frame> {
  const workbench = buildCommonLocators(page).workbench;
  await closeEditorTab(page, 'Untitled');
  await workbench.getNotificationToastByText('Click Undo to restore').getByRole('button', { name: 'Undo' }).click();
  const panel = await getWebviewFrame(page, (frame) => buildCommonLocators(frame).requestUrl.editor(), sidebar);
  await expect(buildCommonLocators(panel).requestUrl.editor()).toBeVisible();
  return panel;
}

test.describe('Undo after closing a transient request', () => {
  test('Restored panel does not keep loading when closed after a response or while a request is in flight', async ({ pageWithCollections: page }) => {
    const collectionName = 'undo-close-collection';
    const sidebar = await openBrunoSidebar(page);
    let panel = await openTransientRequest(page, sidebar, collectionName);
    let locators = buildCommonLocators(panel);

    await test.step('Send a 1s delay request and wait until it finishes', async () => {
      await setRequestUrl(page, panel, `${TEST_SERVER_LOCAL_URL}/delay/1000`);
      await sendRequest(panel, 200);
      await expect(locators.response.loadingOverlay()).toBeHidden();
    });

    await test.step('Send a 3s delay request and wait for the loading overlay', async () => {
      await setRequestUrl(page, panel, `${TEST_SERVER_LOCAL_URL}/delay/3000`);
      await locators.sendRequest().click();
      await expect(locators.response.loadingOverlay()).toBeVisible();
    });

    await test.step('Close the panel while loading, click Undo and verify the restored panel is idle and can send again', async () => {
      panel = await closeAndUndo(page, sidebar);
      locators = buildCommonLocators(panel);
      await expect(locators.response.loadingOverlay()).toBeHidden();
      await setRequestUrl(page, panel, `${TEST_SERVER_LOCAL_URL}/ping`);
      await sendRequest(panel, 200);
    });
  });
});
