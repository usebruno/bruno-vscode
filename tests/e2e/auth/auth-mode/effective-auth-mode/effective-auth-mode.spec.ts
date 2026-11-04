import { test, expect } from '../../../utils/fixtures';
import {
  activeEditor,
  openBrunoSidebar,
  expandCollection,
  expandFolder,
  openRequest,
  saveRequest,
  selectAuthMode,
  selectRequestPaneTab,
  selectResponsePaneTab,
  sendRequest,
  setCodeMirrorValue
} from '../../../utils/page/actions';
import { buildCommonLocators } from '../../../utils/page/locators';

// Renders VS Code's folder picker as an in-window input, so the fixture can type the collection path into it
test.use({ vscodeSettings: { 'files.simpleDialog.enable': true } });

test.describe('Effective auth mode resolution', () => {
  test('Inherit resolves to the nearest parent, stops at a No Auth folder, and sends no Authorization header', async ({ pageWithCollections: page }) => {
    const collectionName = 'effective-auth-mode-collection';
    const sidebar = await openBrunoSidebar(page);
    const locators = buildCommonLocators(activeEditor(page));
    const sidebarLocators = buildCommonLocators(sidebar);

    const setFolderAuth = async (folderName: string, mode: string) => {
      await sidebarLocators.sidebar.folder(folderName).click();
      await locators.paneTabs.folderSettingsTab('auth').click();
      await selectAuthMode(page, mode);
      await locators.saveButton().click();
    };

    await test.step('Set auth type for the collection as Basic Auth (bruno / della)', async () => {
      await sidebarLocators.sidebar.collectionName(collectionName).click();
      await locators.paneTabs.collectionSettingsTab('auth').click();
      await selectAuthMode(page, 'Basic Auth');
      await setCodeMirrorValue(page, locators.auth.basicUsernameEditor('collection'), 'bruno');
      await setCodeMirrorValue(page, locators.auth.basicPasswordEditor('collection'), 'della');
      await locators.saveButton().click();
    });

    await test.step('Set auth type as Basic Auth for folder-1 and folder-2, and Inherit for folder-3', async () => {
      await expandCollection(sidebar, collectionName);
      await expandFolder(sidebar, 'folder-1');
      await expandFolder(sidebar, 'folder-2');
      await setFolderAuth('folder-1', 'Basic Auth');
      await setFolderAuth('folder-2', 'Basic Auth');
      await setFolderAuth('folder-3', 'Inherit');
    });

    await test.step('Verify folder-3 should inherit auth from folder-2, not folder-1', async () => {
      await expect(locators.auth.inheritedMode().locator('..')).toContainText('Auth inherited from folder-2:');
      await expect(locators.auth.inheritedMode()).toHaveText('Basic Auth');
    });

    await test.step('Set auth type for folder-1 as No Auth and for protected-request as Inherit', async () => {
      await setFolderAuth('folder-1', 'No Auth');
      await openRequest(page, sidebar, collectionName, 'protected-request');
      await selectRequestPaneTab(page, 'Auth');
      await selectAuthMode(page, 'Inherit');
      await saveRequest(page);
    });

    await test.step('Verify protected-request shows No Auth inherited from folder-1, not from collection', async () => {
      await expect(locators.auth.inheritedMode().locator('..')).toContainText('Auth inherited from folder-1:');
      await expect(locators.auth.inheritedMode()).toHaveText('No Auth');
    });

    await test.step('Send protected-request and verify the response status code is 401 Unauthorized', async () => {
      const editor = await openRequest(page, sidebar, collectionName, 'protected-request');
      await sendRequest(editor);
      await expect(locators.response.statusCode()).toContainText('401');
    });

    await test.step('Open the latest timeline entry and verify no Authorization header was sent', async () => {
      await selectResponsePaneTab(page, 'Timeline');
      const timelineItem = locators.timeline.lastItem();
      await locators.timeline.itemHeader(timelineItem).click();
      await expect(locators.timeline.requestPanel(timelineItem)).toBeVisible();
      await expect(locators.timeline.requestPanel(timelineItem)).not.toContainText(/authorization/i);
    });

    await test.step('Change folder-1 auth type to Inherit and verify protected-request now inherits Basic Auth from the collection', async () => {
      await setFolderAuth('folder-1', 'Inherit');
      await openRequest(page, sidebar, collectionName, 'protected-request');
      await selectRequestPaneTab(page, 'Auth');
      await expect(locators.auth.inheritedMode().locator('..')).toContainText('Auth inherited from Collection:');
      await expect(locators.auth.inheritedMode()).toHaveText('Basic Auth');
    });

    await test.step('Send protected-request again and verify the response status code is 200', async () => {
      const editor = await openRequest(page, sidebar, collectionName, 'protected-request');
      await sendRequest(editor);
      await expect(locators.response.statusCode()).toContainText('200');
    });
  });
});
