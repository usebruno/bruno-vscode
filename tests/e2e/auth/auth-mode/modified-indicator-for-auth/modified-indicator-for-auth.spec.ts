import { test, expect } from '../../../utils/fixtures';
import {
  activeEditor,
  openBrunoSidebar,
  expandCollection,
  expandFolder,
  saveRequest,
  selectAuthMode,
  selectRequestPaneTab
} from '../../../utils/page/actions';
import { buildCommonLocators } from '../../../utils/page/locators';

// Renders VS Code's folder picker as an in-window input, so the fixture can type the collection path into it
test.use({ vscodeSettings: { 'files.simpleDialog.enable': true } });

test.describe('Modified indicator for auth tab', () => {
  const requestProtocolCases = [
    { protocol: 'HTTP', requestName: 'http-request' },
    { protocol: 'gRPC', requestName: 'grpc-request' },
    { protocol: 'WebSocket', requestName: 'ws-request' },
    { protocol: 'GraphQL', requestName: 'graphql-request' }
  ];

  test('Auth tab indicator dot reflects effective auth for a folder and for HTTP, gRPC, WebSocket and GraphQL requests', async ({ pageWithCollections: page }) => {
    const collectionName = 'modified-indicator-collection';
    const sidebar = await openBrunoSidebar(page);
    const locators = buildCommonLocators(activeEditor(page));
    const sidebarLocators = buildCommonLocators(sidebar);
    const folderAuthTabDot = () => locators.paneTabs.folderSettingsTab('auth').getByTestId('status-dot-auth');
    const authTabDot = () => locators.tabs.byText('Auth').getByTestId('status-dot-auth');

    const setFolderAuth = async (mode: string) => {
      await sidebarLocators.sidebar.folder('folder-1').click();
      await locators.paneTabs.folderSettingsTab('auth').click();
      await selectAuthMode(page, mode);
      await locators.saveButton().click();
    };

    await test.step('Set auth type for the collection as No Auth', async () => {
      await sidebarLocators.sidebar.collectionName(collectionName).click();
      await locators.paneTabs.collectionSettingsTab('auth').click();
      await selectAuthMode(page, 'No Auth');
      await locators.saveButton().click();
    });

    await test.step('Set auth type for folder-1 as Basic Auth and verify the Auth tab shows the status dot', async () => {
      await expandCollection(sidebar, collectionName);
      await expandFolder(sidebar, 'folder-1');
      await setFolderAuth('Basic Auth');
      await expect(folderAuthTabDot()).toBeVisible();
    });

    await test.step('Change folder-1 auth type to Inherit and verify the dot is hidden (collection is No Auth)', async () => {
      await setFolderAuth('Inherit');
      await expect(locators.auth.inheritedMode().locator('..')).toContainText('Auth inherited from Collection:');
      await expect(locators.auth.inheritedMode()).toHaveText('No Auth');
      await expect(folderAuthTabDot()).toBeHidden();
    });

    await test.step('Change folder-1 auth type to No Auth and verify the dot is hidden', async () => {
      await setFolderAuth('No Auth');
      await expect(folderAuthTabDot()).toBeHidden();
    });

    for (const { protocol, requestName } of requestProtocolCases) {
      await test.step(`Set auth type for the ${protocol} request as Inherit and verify the Auth tab does not show the dot (folder-1 is No Auth)`, async () => {
        await sidebarLocators.sidebar.collectionItem(requestName).click();
        await selectRequestPaneTab(page, 'Auth');
        await selectAuthMode(page, 'Inherit');
        await saveRequest(page);
        await expect(authTabDot()).toBeHidden();
      });
    }

    await test.step('Change folder-1 auth type to Basic Auth', async () => {
      await setFolderAuth('Basic Auth');
    });

    for (const { protocol, requestName } of requestProtocolCases) {
      await test.step(`Verify the ${protocol} request Auth tab now shows the dot (inherits Basic Auth from folder-1)`, async () => {
        await sidebarLocators.sidebar.collectionItem(requestName).click();
        await selectRequestPaneTab(page, 'Auth');
        await expect(authTabDot()).toBeVisible();
      });
    }
  });
});
