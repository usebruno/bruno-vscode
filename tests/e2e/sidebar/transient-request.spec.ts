import * as path from 'node:path';

import { test, expect } from '../utils/fixtures';
import { openBrunoSidebar, importCollection, createFolder, newTransientRequest, saveTransientRequest, findFilesWithName, openRequestTab, runCommand } from '../utils/page/actions';
import { buildCommonLocators } from '../utils/page/locators';
import { activeEditor } from '../utils/page/webviews';
import { TEST_SERVER_LOCAL_URL } from '../utils/urls';

test.describe('New request from the sidebar title', () => {
  test('opens unsaved requests with no collection open, and saves one into a collection', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const { workbench } = buildCommonLocators(page);

    // Nothing is open, and nothing is asked for beyond the request type.
    const first = await newTransientRequest(sidebar, 'HTTP');

    await expect(workbench.editorTab('Untitled 1')).toBeVisible();
    await expect(buildCommonLocators(first).requestUrl.editor()).toBeVisible();

    // The next one counts on from the requests still open.
    await newTransientRequest(sidebar, 'GraphQL');
    await expect(workbench.editorTab('Untitled 2')).toBeVisible();

    // From cURL fills the request in from the command, its query string included.
    const url = `${TEST_SERVER_LOCAL_URL}/api/echo/json?page=2`;
    const fromCurl = await newTransientRequest(sidebar, 'From cURL', `curl -X POST '${url}' -H 'Content-Type: application/json' -d '{"name":"bruno"}'`);

    await expect(workbench.editorTab('Untitled 3')).toBeVisible();
    await expect(fromCurl.getByTestId('request-method')).toContainText('POST');
    await expect(fromCurl.locator('.input-container .CodeMirror').first()).toContainText(url);

    // The query is listed in the Params table, so editing that table keeps it in the URL.
    await openRequestTab(fromCurl, 'params');
    const queryParams = buildCommonLocators(fromCurl.getByTestId('query-params')).editableTable;
    await expect(queryParams.columnNameInput(0)).toHaveValue('page');
    await expect(queryParams.columnValueEditor(0)).toContainText('2');

    // Saving puts it in a collection: with one open and no folders in it, only the name is asked.
    const collectionName = 'Highlight Collection';
    await importCollection(sidebar, path.resolve(__dirname, 'fixtures/two-requests-collection.json'), tmpDir, collectionName);
    await saveTransientRequest(page, sidebar, 'Untitled 1', 'Saved From Scratch');

    await expect(workbench.editorTab('Saved From Scratch')).toBeVisible({ timeout: 10_000 });
    await expect(workbench.editorTab('Untitled 1')).toBeHidden();

    await sidebar.expandCollection(collectionName);
    await expect(sidebar.locators.collectionItem('Saved From Scratch')).toBeVisible({ timeout: 10_000 });

    // With folders in the collection, the picker walks down to the one chosen.
    await createFolder(sidebar, collectionName, 'Sub');
    await createFolder(sidebar, 'Sub', 'Deep', false);

    await saveTransientRequest(page, sidebar, 'Untitled 2', 'Saved In Deep', { folderPath: ['Sub', 'Deep'] });
    await expect(workbench.editorTab('Saved In Deep')).toBeVisible({ timeout: 10_000 });

    await sidebar.expandFolder('Deep');
    await expect(sidebar.locators.collectionItem('Saved In Deep')).toBeVisible({ timeout: 10_000 });

    const [saved] = findFilesWithName(tmpDir, 'Saved In Deep.yml');
    expect(path.relative(tmpDir, saved).split(path.sep).slice(-3, -1)).toEqual(['Sub', 'Deep']);
  });

  test('a closed unsaved request can be restored for 10 seconds', async ({ page }) => {
    const sidebar = await openBrunoSidebar(page);
    const { workbench } = buildCommonLocators(page);
    const url = `${TEST_SERVER_LOCAL_URL}/api/echo/json?page=2`;
    const closedNotice = '"Untitled 1" closed';

    await newTransientRequest(sidebar, 'From cURL', `curl '${url}'`);
    await expect(workbench.editorTab('Untitled 1')).toBeVisible();

    // Cancel on the notification brings the request back as it was.
    await workbench.editorTabClose('Untitled 1').click();
    await workbench.getNotificationToastByText(closedNotice).getByRole('button', { name: 'Cancel' }).click();

    await expect(workbench.editorTab('Untitled 1')).toBeVisible();
    await expect(activeEditor(page).locator('.input-container .CodeMirror').first()).toContainText(url);

    // Left alone, the notification is gone after 10 seconds, from the notification center too.
    await workbench.editorTabClose('Untitled 1').click();
    await runCommand(page, 'Notifications: Show Notifications');

    const centerEntry = page.locator('.notifications-center .notification-list-item').filter({ hasText: closedNotice });
    await expect(centerEntry).toHaveCount(1);
    await expect(centerEntry).toHaveCount(0, { timeout: 15_000 });
  });
});
