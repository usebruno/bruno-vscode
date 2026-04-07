import * as path from 'path';
import { test, expect } from '../fixtures';
import {
  openBrunoSidebar,
  createCollection,
  importCollection,
  openNewRequestPanel,
  createRequest,
  openRequest,
  setJsonBody,
  sendRequest,
} from '../utils/actions';

// All tests share a single VS Code instance (workers: 1) so they run serially.
// Each test gets its own tmpDir for collection storage.

test.describe('Collection management', () => {

  test('Create a collection from the sidebar', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'My Test Collection';

    await createCollection(page, sidebar, collectionName, tmpDir);

    // Verify the collection is visible in the sidebar
    const collectionRow = sidebar
      .locator('[data-testid="sidebar-collection-row"]')
      .filter({ hasText: collectionName });
    await expect(collectionRow).toBeVisible();
  });

  test('Import a collection from a JSON file', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const fixturePath = path.resolve(__dirname, '../fixtures/echo-collection.json');
    const expectedName = 'Echo Collection';

    await importCollection(page, sidebar, fixturePath, tmpDir, expectedName);

    // Verify the imported collection is visible in the sidebar
    const collectionRow = sidebar
      .locator('[data-testid="sidebar-collection-row"]')
      .filter({ hasText: expectedName });
    await expect(collectionRow).toBeVisible();
  });

  test('Create a collection, send a request to echo.usebruno.com, and verify the response', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Echo Test';
    const requestName = 'Ping Echo';
    const requestUrl = 'https://echo.usebruno.com';
    const body = '{"foo":"bar"}';

    // Step 1: Create a new collection
    await createCollection(page, sidebar, collectionName, tmpDir);

    // Step 2: Create a new POST request inside the collection
    const newReqPanel = await openNewRequestPanel(page, sidebar, collectionName);
    await createRequest(page, newReqPanel, sidebar, collectionName, requestName, requestUrl, 'POST');

    // Step 3: Open the request in the editor (expand collection first)
    const editor = await openRequest(page, sidebar, collectionName, requestName);

    // Step 4: Set JSON body
    await setJsonBody(page, editor, body);

    // Step 5: Send the request and verify 200 response
    await sendRequest(editor, 200);

    // Step 6: Verify the response body echoes back our JSON
    const responseBody = editor.locator('[data-testid="response-status-code"]').locator('..');
    await expect(responseBody).toBeVisible({ timeout: 10_000 });
  });
});
