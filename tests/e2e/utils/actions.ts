import { Page, Frame, expect } from '@playwright/test';

/**
 * Find the webview Frame that contains actual Bruno app content.
 *
 * VS Code renders webview content inside nested iframes. The real content
 * may live in a frame named "pending-frame" or "active-frame" depending on
 * the VS Code version and timing.  We look for the frame whose document
 * contains `<div id="root">` (the React mount point).
 */
export async function getWebviewFrame(page: Page, timeout = 20_000): Promise<Frame> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      try {
        const hasRoot = await frame.locator('#root').count();
        if (hasRoot > 0) {
          return frame;
        }
      } catch {
        // frame may have been detached, skip
      }
    }
    await page.waitForTimeout(500);
  }

  throw new Error(`Could not find a webview frame with #root within ${timeout}ms`);
}

/**
 * Wait for a new webview Frame to appear that is different from `existingFrame`.
 * Used when opening a new panel (e.g. Import Collection, New Request) that
 * creates a second webview.
 */
export async function waitForNewWebviewFrame(
  page: Page,
  existingFrame: Frame,
  timeout = 20_000
): Promise<Frame> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (frame === existingFrame || frame === page.mainFrame()) continue;
      try {
        const hasRoot = await frame.locator('#root').count();
        if (hasRoot > 0) {
          return frame;
        }
      } catch {
        // skip detached frames
      }
    }
    await page.waitForTimeout(500);
  }

  throw new Error(`Could not find a new webview frame within ${timeout}ms`);
}

/**
 * Open the Bruno sidebar by clicking the activity-bar icon and waiting for it to load.
 * Returns the sidebar's webview Frame for further interaction.
 */
export async function openBrunoSidebar(page: Page): Promise<Frame> {
  const brunoIcon = page.locator('.activitybar a.action-label[aria-label="Bruno"]');
  await expect(brunoIcon).toBeVisible({ timeout: 15_000 });
  await brunoIcon.click();

  const sidebarTitle = page.locator('.part.sidebar .composite.title h2');
  await expect(sidebarTitle).toHaveText(/Bruno/i, { timeout: 15_000 });

  // Wait for the sidebar webview frame with Bruno content to be ready
  const frame = await getWebviewFrame(page);
  await expect(frame.locator('.sidebar-header')).toBeVisible({ timeout: 15_000 });

  return frame;
}

/**
 * Mock the next `renderer:browse-directory` IPC call to return `dirPath`.
 *
 * The webview shim assigns `ipcRenderer` to `window`, and the Redux
 * `browseDirectory()` action reads from `window.ipcRenderer.invoke`.
 * We temporarily intercept that single call so the native file-picker
 * dialog is bypassed and the value flows through Formik's `setFieldValue`.
 */
async function mockBrowseDirectory(frame: Frame, dirPath: string): Promise<void> {
  await frame.evaluate((val) => {
    const ipc = (window as any).ipcRenderer;
    const originalInvoke = ipc.invoke.bind(ipc);
    ipc.invoke = async (channel: string, ...args: any[]) => {
      if (channel === 'renderer:browse-directory') {
        // Restore after one use
        ipc.invoke = originalInvoke;
        return val;
      }
      return originalInvoke(channel, ...args);
    };
  }, dirPath);
}

/**
 * Create a new collection from the Bruno sidebar.
 *
 * Clicking "Create collection" in the sidebar dropdown sends an IPC message
 * that opens a new WebviewPanel tab with a full-page form.
 *
 * @param page - Playwright Page (VS Code workbench)
 * @param sidebar - The sidebar webview Frame
 * @param name - Collection name
 * @param location - Filesystem path where the collection will be stored
 */
export async function createCollection(
  page: Page,
  sidebar: Frame,
  name: string,
  location: string
): Promise<void> {
  // Open the "+" dropdown and click "Create collection"
  await sidebar.locator('[data-testid="collections-header-add-menu"]').click();
  await sidebar.locator('[data-testid="collections-header-add-menu-create"]').click();

  // "Create collection" opens a new WebviewPanel tab — wait for its frame.
  const editor = await waitForNewWebviewFrame(page, sidebar);
  await expect(editor.locator('.create-collection-container')).toBeVisible({ timeout: 15_000 });

  // Fill the collection name
  await editor.locator('#collectionName').fill(name);

  // The location input is readonly and opens a native file dialog via IPC.
  // Mock the IPC call to return our path, then click Browse.
  await mockBrowseDirectory(editor, location);
  await editor.locator('.browse-button').click();

  // Wait for formik to pick up the value before submitting
  await expect(editor.locator('#collectionLocation')).toHaveValue(location, { timeout: 5_000 });

  // Submit the form
  await editor.locator('button[type="submit"]').filter({ hasText: 'Create Collection' }).click();

  // Wait for the collection to appear in the sidebar list
  await expect(
    sidebar.locator('[data-testid="sidebar-collection-row"]').filter({ hasText: name })
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Import a collection from a JSON file using the Bruno import flow.
 *
 * The flow sends an IPC to open a new WebviewPanel with two steps:
 *   1. Select the file to import
 *   2. Choose the location and click Import
 *
 * @param page - Playwright Page
 * @param sidebar - The sidebar webview Frame
 * @param filePath - Absolute path to the collection JSON file
 * @param location - Filesystem path where the imported collection will be stored
 * @param expectedName - Expected collection name to verify in the sidebar
 */
export async function importCollection(
  page: Page,
  sidebar: Frame,
  filePath: string,
  location: string,
  expectedName: string
): Promise<void> {
  // Open the "+" dropdown and click "Import collection"
  await sidebar.locator('[data-testid="collections-header-add-menu"]').click();
  await sidebar.locator('[data-testid="collections-header-add-menu-import"]').click();

  // The import opens a new WebviewPanel — wait for its frame to appear.
  const editor = await waitForNewWebviewFrame(page, sidebar);
  await expect(editor.locator('.import-collection-container')).toBeVisible({ timeout: 15_000 });

  // Step 1: Select the file via the hidden file input
  await editor.locator('input[type="file"]').setInputFiles(filePath);

  // Step 2: The location step should now be visible (form with location input)
  await expect(editor.locator('#collectionLocation')).toBeVisible({ timeout: 10_000 });

  // The location input is readonly and opens a native file dialog via IPC.
  // Mock the IPC call to return our path, then click Browse.
  await mockBrowseDirectory(editor, location);
  await editor.locator('.browse-button').click();
  await expect(editor.locator('#collectionLocation')).toHaveValue(location, { timeout: 5_000 });

  // Click Import
  await editor.locator('button[type="submit"]').filter({ hasText: 'Import' }).click();

  // Wait for the collection to appear in the sidebar
  await expect(
    sidebar.locator('[data-testid="sidebar-collection-row"]').filter({ hasText: expectedName })
  ).toBeVisible({ timeout: 20_000 });
}

/**
 * Open the context menu for a collection in the sidebar and click "New Request".
 * This opens a new WebviewPanel for creating the request.
 *
 * @returns The new editor webview Frame for the New Request panel.
 */
export async function openNewRequestPanel(
  page: Page,
  sidebar: Frame,
  collectionName: string
): Promise<Frame> {
  // Hover over the collection row to reveal the action icons
  const collectionRow = sidebar
    .locator('[data-testid="sidebar-collection-row"]')
    .filter({ hasText: collectionName });
  await collectionRow.hover();

  // Click the collection actions menu (3-dot icon)
  await collectionRow.locator('[data-testid="collection-actions"]').click();

  // Click "New Request" from the dropdown
  await sidebar.locator('[data-testid="collection-actions-new-request"]').click();

  // Wait for the New Request panel to open in a new webview frame
  const editor = await waitForNewWebviewFrame(page, sidebar);
  await expect(editor.locator('.new-request-container')).toBeVisible({ timeout: 15_000 });

  return editor;
}

/**
 * Fill the new request form and submit it.
 *
 * @param page - Playwright Page
 * @param editor - The New Request panel's webview Frame
 * @param sidebar - The sidebar webview Frame (to verify the request appears)
 * @param collectionName - Name of the parent collection (to expand it in the sidebar)
 * @param requestName - Name for the new request
 * @param url - Request URL
 * @param method - HTTP method (default: 'GET')
 */
export async function createRequest(
  page: Page,
  editor: Frame,
  sidebar: Frame,
  collectionName: string,
  requestName: string,
  url: string,
  method: string = 'GET'
): Promise<void> {
  // Fill the request name
  await editor.locator('#requestName').fill(requestName);

  // Select the HTTP method if not GET (default)
  if (method.toUpperCase() !== 'GET') {
    // Click the method selector dropdown trigger
    await editor.locator('.method-selector-container .method-selector').click();
    // Click the method from the dropdown menu
    await editor.locator(`text=${method.toUpperCase()}`).click();
  }

  // Fill the URL via the SingleLineEditor (CodeMirror).
  // Click the CodeMirror area to focus, then type the URL.
  const urlEditor = editor.locator('.url-input-container .CodeMirror');
  await urlEditor.click();
  await page.keyboard.type(url, { delay: 10 });

  // Submit the form
  await editor.locator('button[type="submit"]').filter({ hasText: 'Create Request' }).click();

  // The new-request panel closes after creation. Expand the collection in
  // the sidebar (it may be collapsed) so we can verify the item appeared.
  await expandCollection(sidebar, collectionName);

  // Wait for the request to appear in the sidebar
  await expect(
    sidebar.locator('[data-testid="sidebar-collection-item-row"]').filter({ hasText: requestName })
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Expand a collection in the sidebar by clicking its chevron toggle.
 *
 * Clicking the chevron (handleCollectionCollapse) only toggles the tree open/close.
 * Clicking the collection row text (handleClick) would also open a settings tab.
 */
export async function expandCollection(
  sidebar: Frame,
  collectionName: string
): Promise<void> {
  const collectionRow = sidebar
    .locator('[data-testid="sidebar-collection-row"]')
    .filter({ hasText: collectionName });

  // The chevron SVG has class "chevron-icon" and is rotated 90° when expanded.
  // If the chevron does NOT have the rotate-90 class, the collection is collapsed.
  const chevron = collectionRow.locator('svg.chevron-icon');
  const isExpanded = await chevron.evaluate(
    (el) => el.classList.contains('rotate-90')
  );

  if (!isExpanded) {
    await chevron.click();
  }
}

/**
 * Click on a request in the sidebar to open it in the editor.
 * Returns the editor webview Frame for the opened request.
 *
 * Collections may be collapsed, so we first expand the collection by clicking
 * the chevron, then click the request item. The sidebar sends
 * `sidebar:open-request` IPC which opens a VS Code custom editor.
 */
export async function openRequest(
  page: Page,
  sidebar: Frame,
  collectionName: string,
  requestName: string
): Promise<Frame> {
  // Expand the collection (clicks chevron, not the row text)
  await expandCollection(sidebar, collectionName);

  // Wait for the request item to be visible inside the expanded tree
  const requestRow = sidebar
    .locator('[data-testid="sidebar-collection-item-row"]')
    .filter({ hasText: requestName });
  await expect(requestRow).toBeVisible({ timeout: 10_000 });

  // Click the request to open it in the editor
  await requestRow.click();

  // Wait for the request editor frame — look specifically for #request-url
  const timeout = 20_000;
  const deadline = Date.now() + timeout;
  let editor: Frame | undefined;

  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (frame === sidebar || frame === page.mainFrame()) continue;
      try {
        const has = await frame.locator('#request-url').count();
        if (has > 0) { editor = frame; break; }
      } catch { /* detached */ }
    }
    if (editor) break;
    await page.waitForTimeout(500);
  }

  if (!editor) throw new Error(`Request editor frame with #request-url not found within ${timeout}ms`);
  await expect(editor.locator('#request-url')).toBeVisible({ timeout: 10_000 });

  return editor;
}

/**
 * Set the request body in the editor to JSON mode and type content.
 *
 * @param page - Playwright Page (needed for keyboard input into CodeMirror)
 * @param editor - The request editor's webview Frame
 * @param jsonBody - The JSON string to type into the body editor
 */
export async function setJsonBody(
  page: Page,
  editor: Frame,
  jsonBody: string
): Promise<void> {
  // Click the "Body" tab
  await editor.locator('[role="tab"]').filter({ hasText: 'Body' }).click();

  // Click the body mode selector and choose JSON
  await editor.locator('.body-mode-selector').click();
  await editor.getByText('JSON', { exact: true }).click();

  // Click the body CodeMirror editor (the one with CodeMirror-wrap, not the URL bar)
  const codeEditor = editor.locator('.CodeMirror-wrap');
  await expect(codeEditor).toBeVisible({ timeout: 5_000 });
  await codeEditor.click();

  // Select all existing content and replace with our JSON
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.type(jsonBody, { delay: 5 });
}

/**
 * Click the Send button in the currently open request editor and wait for a response.
 *
 * @param editor - The request editor's webview Frame
 * @param expectedStatus - Expected HTTP status code (e.g. 200)
 * @param timeout - Max time to wait for the response
 */
export async function sendRequest(
  editor: Frame,
  expectedStatus?: number,
  timeout = 30_000
): Promise<void> {
  // Click the send button (the parent div has the onClick handler)
  await editor.locator('#send-request').click();

  // Wait for the response status code to appear
  const statusCode = editor.locator('[data-testid="response-status-code"]');
  await expect(statusCode).toBeVisible({ timeout });

  if (expectedStatus !== undefined) {
    await expect(statusCode).toContainText(String(expectedStatus), { timeout: 5_000 });
  }
}

/**
 * Mock the next `sidebar:confirm-remove` IPC call to auto-confirm removal.
 * Bypasses the native VS Code modal dialog which is hard to interact with in e2e.
 */
async function mockConfirmRemove(frame: Frame): Promise<void> {
  await frame.evaluate(() => {
    const ipc = (window as any).ipcRenderer;
    const originalInvoke = ipc.invoke.bind(ipc);
    ipc.invoke = async (channel: string, ...args: any[]) => {
      if (channel === 'sidebar:confirm-remove') {
        ipc.invoke = originalInvoke;
        return true;
      }
      return originalInvoke(channel, ...args);
    };
  });
}

/**
 * Remove a collection from the sidebar by opening the context menu,
 * clicking Remove, and auto-confirming via IPC mock.
 *
 * @param page - Playwright Page (VS Code workbench)
 * @param sidebar - The sidebar webview Frame
 * @param collectionName - Name of the collection to remove
 */
export async function removeCollection(
  page: Page,
  sidebar: Frame,
  collectionName: string
): Promise<void> {
  const collectionRow = sidebar
    .locator('[data-testid="sidebar-collection-row"]')
    .filter({ hasText: collectionName });
  await collectionRow.hover();

  // Mock the confirmation dialog before triggering removal
  await mockConfirmRemove(sidebar);

  // Open the 3-dot context menu
  await collectionRow.locator('[data-testid="collection-actions"]').click();

  // Click "Remove" from the dropdown
  await sidebar.locator('[role="menuitem"]').filter({ hasText: 'Remove' }).click();

  // Wait for the collection to disappear from the sidebar
  await expect(collectionRow).not.toBeVisible({ timeout: 15_000 });
}

/**
 * Mock the next `sidebar:prompt-new-folder` IPC call to return a folder name.
 * Bypasses the native VS Code input box.
 */
async function mockNewFolderPrompt(frame: Frame, folderName: string): Promise<void> {
  await frame.evaluate((name) => {
    const ipc = (window as any).ipcRenderer;
    const originalInvoke = ipc.invoke.bind(ipc);
    ipc.invoke = async (channel: string, ...args: any[]) => {
      if (channel === 'sidebar:prompt-new-folder') {
        ipc.invoke = originalInvoke;
        return name;
      }
      return originalInvoke(channel, ...args);
    };
  }, folderName);
}

/**
 * Mock the next `sidebar:confirm-delete` IPC call to auto-confirm deletion.
 * Bypasses the native VS Code confirmation dialog.
 */
async function mockConfirmDelete(frame: Frame): Promise<void> {
  await frame.evaluate(() => {
    const ipc = (window as any).ipcRenderer;
    const originalInvoke = ipc.invoke.bind(ipc);
    ipc.invoke = async (channel: string, ...args: any[]) => {
      if (channel === 'sidebar:confirm-delete') {
        ipc.invoke = originalInvoke;
        return true;
      }
      return originalInvoke(channel, ...args);
    };
  });
}

/**
 * Create a new folder inside a collection via the sidebar context menu.
 *
 * @param sidebar - The sidebar webview Frame
 * @param collectionName - Name of the parent collection
 * @param folderName - Name for the new folder
 */
export async function createFolder(
  sidebar: Frame,
  collectionName: string,
  folderName: string
): Promise<void> {
  // Expand collection first so it's mounted
  await expandCollection(sidebar, collectionName);

  const collectionRow = sidebar
    .locator('[data-testid="sidebar-collection-row"]')
    .filter({ hasText: collectionName });
  await collectionRow.hover();

  // Mock the folder name input before opening the menu
  await mockNewFolderPrompt(sidebar, folderName);

  // Open the 3-dot context menu
  await collectionRow.locator('[data-testid="collection-actions"]').click();

  // Click "New Folder"
  await sidebar.locator('[role="menuitem"]').filter({ hasText: 'New Folder' }).click();

  // Wait for the folder to appear in the sidebar
  await expect(
    sidebar.locator('[data-testid="sidebar-collection-item-row"]').filter({ hasText: folderName })
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Delete a folder or request from the sidebar by right-clicking and confirming.
 *
 * @param sidebar - The sidebar webview Frame
 * @param itemName - Name of the folder/request to delete
 */
export async function deleteItem(
  sidebar: Frame,
  itemName: string
): Promise<void> {
  const itemRow = sidebar
    .locator('[data-testid="sidebar-collection-item-row"]')
    .filter({ hasText: itemName });
  await itemRow.hover();

  // Mock the confirmation dialog
  await mockConfirmDelete(sidebar);

  // Open the context menu (3-dot icon on the item)
  await itemRow.locator('[data-testid="collection-item-menu"]').click();

  // Click "Delete"
  await sidebar.locator('[role="menuitem"]').filter({ hasText: 'Delete' }).click();

  // Wait for the item to disappear
  await expect(itemRow).not.toBeVisible({ timeout: 15_000 });
}

/**
 * Run a VS Code command via the Command Palette.
 */
export async function runCommand(page: Page, command: string): Promise<void> {
  await page.keyboard.press('F1');
  await page.waitForSelector('.quick-input-widget', { timeout: 8_000 });
  await page.keyboard.type(command, { delay: 30 });
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
}
