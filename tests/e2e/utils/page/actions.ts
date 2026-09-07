import * as fs from 'fs';
import * as path from 'path';
import { Page, Frame, Locator, expect } from '@playwright/test';
import { buildCommonLocators } from './locators';

/**
 * Locate the collection directory created under a test's tmpDir.
 */
export function findCollectionDir(root: string, configFile = 'bruno.json'): string {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop() as string;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    if (entries.some((e) => e.isFile() && e.name === configFile)) return dir;
    for (const e of entries) {
      if (e.isDirectory()) stack.push(path.join(dir, e.name));
    }
  }
  throw new Error(`No collection (${configFile}) found under ${root}`);
}

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
 * @param format - On-disk format: 'yml' (OpenCollection, default) or 'bru'
 */
export async function createCollection(
  page: Page,
  sidebar: Frame,
  name: string,
  location: string,
  format: 'yml' | 'bru' = 'yml'
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

  // The format selector lives behind the "Options" toggle; only expand it when
  // we need a non-default format.
  if (format !== 'yml') {
    await editor.locator('.advanced-toggle').click();
    await editor.locator('#format').selectOption(format);
  }

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
 * Create a request of the given type via the New Request panel (no fixtures).
 * The URL editor doesn't auto-close brackets, so `{{?prompt}}` types cleanly.
 */
export async function createRequestByType(
  page: Page,
  sidebar: Frame,
  collectionName: string,
  opts: { name: string; url: string; type?: 'HTTP' | 'GraphQL' | 'WebSocket' | 'gRPC'; method?: string }
): Promise<void> {
  const { name, url, type = 'HTTP', method } = opts;
  const editor = await openNewRequestPanel(page, sidebar, collectionName);
  const form = buildCommonLocators(editor).newRequest;

  // HTTP is the default type.
  if (type !== 'HTTP') {
    await form.typeOption(type).click();
  }

  // Only HTTP/GraphQL expose a method selector; GraphQL defaults to GET, so set it if asked.
  if (method && (type === 'HTTP' || type === 'GraphQL')) {
    await form.methodSelector().click();
    await form.methodOption(method.toUpperCase()).click();
  }

  await form.nameInput().fill(name);

  const urlEditor = form.urlEditor();
  await urlEditor.click();
  await page.keyboard.type(url, { delay: 10 });

  await form.submit().click();

  await expandCollection(sidebar, collectionName);
  await expect(buildCommonLocators(sidebar).sidebar.collectionItem(name)).toBeVisible({ timeout: 15_000 });
}

/**
 * Set a CodeMirror field's value: clear it, then insert via a single input event
 * (`keyboard.insertText`). Per-character typing would trip `autoCloseBrackets` in
 * the JSON body / GraphQL editors and mangle `{{?prompt}}`; insertText lands verbatim.
 */
export async function setCodeMirrorValue(page: Page, cm: Locator, text: string): Promise<void> {
  await expect(cm).toBeVisible({ timeout: 5_000 });
  await cm.click();
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(text);
  await page.keyboard.press('Tab');
}

/**
 * Open a request-editor tab. Scoped by `role="tab"` since ResponsiveTabs renders a
 * hidden measurement copy with the same class; narrow windows collapse trailing
 * tabs (e.g. "Vars") into a `.more-tabs` overflow menu, so fall back to `label` there.
 */
const TAB_LABELS: Record<string, string> = {
  params: 'Params',
  body: 'Body',
  headers: 'Headers',
  auth: 'Auth',
  vars: 'Vars'
};

export async function openRequestTab(
  editor: Frame,
  key: 'params' | 'body' | 'headers' | 'auth' | 'vars',
  label?: string
): Promise<void> {
  const locators = buildCommonLocators(editor);
  const tab = locators.tabs.byKey(key);
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
    return;
  }

  // Tab is in the overflow menu (e.g. GraphQL's tab bar is narrower, so Headers/Auth
  // spill over) — open it and pick by label. Fall back to the key's default label so
  // callers don't have to pass one.
  const menuLabel = label ?? TAB_LABELS[key];
  const more = locators.tabs.more();
  if (menuLabel && (await more.isVisible().catch(() => false))) {
    await more.click();
    const item = locators.dropdownItem(menuLabel);
    await expect(item).toBeVisible({ timeout: 5_000 });
    await item.click();
    return;
  }

  await expect(tab).toBeVisible({ timeout: 10_000 });
  await tab.click();
}

/**
 * Add a header row (name + value) on the Headers tab. Capture the empty trailing
 * row's index before filling — a fresh row auto-appends once the name is entered.
 */
export async function addRequestHeader(
  page: Page,
  editor: Frame,
  name: string,
  value: string
): Promise<void> {
  await openRequestTab(editor, 'headers');

  const rows = buildCommonLocators(editor).editableTable.rows();
  await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  const emptyRowIdx = (await rows.count()) - 1; // the trailing empty row
  const row = buildCommonLocators(rows.nth(emptyRowIdx)).editableTable;

  await setCodeMirrorValue(page, row.columnNameEditor(), name);
  await setCodeMirrorValue(page, row.columnValueEditor(), value);
}

/**
 * Add a query param row on the Params tab (the first of its two EditableTables).
 */
export async function addQueryParam(
  page: Page,
  editor: Frame,
  name: string,
  value: string,
  { enabled = true }: { enabled?: boolean } = {}
): Promise<void> {
  await openRequestTab(editor, 'params');

  const rows = buildCommonLocators(editor).editableTable.firstTableRows();
  await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  const emptyRowIdx = (await rows.count()) - 1;
  const row = buildCommonLocators(rows.nth(emptyRowIdx)).editableTable;

  await row.columnNameInput().fill(name);
  await setCodeMirrorValue(page, row.columnValueEditor(), value);

  if (!enabled) {
    await row.columnCheckbox().uncheck();
  }
}

/**
 * Switch the request to Bearer auth and set the token, entirely via the Auth tab.
 */
export async function setBearerToken(page: Page, editor: Frame, token: string): Promise<void> {
  await openRequestTab(editor, 'auth');
  const locators = buildCommonLocators(editor);

  // `.auth-mode-selector` works for HTTP/GraphQL and WebSocket (WS lacks the oauth2 testid).
  await locators.auth.modeSelector().click();
  const bearerItem = locators.dropdownItem('Bearer Token');
  await expect(bearerItem).toBeVisible({ timeout: 5_000 });
  await bearerItem.click();

  await setCodeMirrorValue(page, locators.auth.bearerTokenEditor(), token);
}

/**
 * Set a JSON request body robustly (uses `setCodeMirrorValue` so `{{?prompt}}`
 * survives the body editor's bracket auto-closing).
 */
export async function fillJsonBody(page: Page, editor: Frame, jsonBody: string): Promise<void> {
  await openRequestTab(editor, 'body');
  const locators = buildCommonLocators(editor);
  await locators.body.modeSelector().click();
  await locators.body.modeOption('JSON').click();

  await setCodeMirrorValue(page, locators.body.editor(), jsonBody);
}

/**
 * Add a request-level variable on the Vars tab (the first of its two EditableTables).
 * Name cell is a plain <input>, value cell a CodeMirror editor — used to check a
 * `{{?prompt}}` inside a variable's value is still discovered.
 */
export async function addRequestVar(
  page: Page,
  editor: Frame,
  name: string,
  value: string
): Promise<void> {
  await openRequestTab(editor, 'vars', 'Vars');

  const rows = buildCommonLocators(editor).editableTable.firstTableRows();
  await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  const emptyRowIdx = (await rows.count()) - 1;
  const row = buildCommonLocators(rows.nth(emptyRowIdx)).editableTable;

  await row.columnNameInput().fill(name);
  await setCodeMirrorValue(page, row.columnValueEditor(), value);
}

/**
 * Mock the next `renderer:browse-files` IPC call to return `filePaths`.
 * Bypasses the native "open file" dialog (used by the gRPC proto-file picker).
 */
export async function mockBrowseFiles(frame: Frame, filePaths: string[]): Promise<void> {
  await frame.evaluate((paths) => {
    const ipc = (window as any).ipcRenderer;
    const originalInvoke = ipc.invoke.bind(ipc);
    ipc.invoke = async (channel: string, ...args: any[]) => {
      if (channel === 'renderer:browse-files') {
        ipc.invoke = originalInvoke; // restore after one use
        return paths;
      }
      return originalInvoke(channel, ...args);
    };
  }, filePaths);
}

/**
 * Load gRPC methods by picking a `.proto` file (no server reflection): open the
 * proto dropdown, mock the file dialog, click Browse, and wait for the method list.
 */
export async function loadGrpcProtoFile(editor: Frame, protoAbsPath: string): Promise<void> {
  const grpc = buildCommonLocators(editor).grpc;
  await grpc.protoDropdownIcon().click();

  // A URL-bearing request auto-enters Reflection mode, hiding the picker; flip to Proto File.
  const browseBtn = grpc.browseButton();
  if (!(await browseBtn.isVisible().catch(() => false))) {
    // The toggle's <input> is hidden; click its <label> (the click bubbles to the switch).
    await grpc.modeToggleLabel().click();
  }

  await mockBrowseFiles(editor, [protoAbsPath]);
  await expect(browseBtn).toBeVisible({ timeout: 5_000 });
  await browseBtn.click();

  // Methods loaded → the method dropdown trigger appears.
  await expect(grpc.methodDropdownTrigger()).toBeVisible({ timeout: 15_000 });
}

/** Select a gRPC method by (partial) name from the method dropdown. */
export async function selectGrpcMethod(editor: Frame, methodText: string): Promise<void> {
  const grpc = buildCommonLocators(editor).grpc;
  await grpc.methodDropdownTrigger().click();
  const item = grpc.methodItem(methodText);
  await expect(item).toBeVisible({ timeout: 10_000 });
  await item.click();
  await expect(grpc.selectedMethodName()).toContainText(methodText, { timeout: 5_000 });
}

/** Set the first gRPC request message (JSON) on the Message tab. */
export async function setGrpcMessage(page: Page, editor: Frame, json: string): Promise<void> {
  const locators = buildCommonLocators(editor);
  const messageTab = locators.tabs.byText('Message');
  await expect(messageTab).toBeVisible({ timeout: 10_000 });
  await messageTab.click();

  await setCodeMirrorValue(page, locators.grpc.messageEditor(), json);
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
 * Collapse a collection in the sidebar by clicking its chevron toggle.
 * A collapsed collection removes its children from the DOM.
 */
export async function collapseCollection(
  sidebar: Frame,
  collectionName: string
): Promise<void> {
  const collectionRow = sidebar
    .locator('[data-testid="sidebar-collection-row"]')
    .filter({ hasText: collectionName });

  const chevron = collectionRow.locator('svg.chevron-icon');
  const isExpanded = await chevron.evaluate(
    (el) => el.classList.contains('rotate-90')
  );

  if (isExpanded) {
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
  // HTTP/GraphQL request editors expose the URL bar as `#request-url`.
  return openRequestByMarker(page, sidebar, collectionName, requestName, '#request-url');
}

/**
 * Open a WebSocket request in the editor.
 *
 * WebSocket editors use the `WsQueryUrl` pane, which does NOT render `#request-url`;
 * while disconnected it shows the connect control (`ws-connect-button`), so we key
 * the frame-detection on that instead.
 */
export async function openWsRequest(
  page: Page,
  sidebar: Frame,
  collectionName: string,
  requestName: string
): Promise<Frame> {
  return openRequestByMarker(page, sidebar, collectionName, requestName, '[data-testid="ws-connect-button"]');
}

/**
 * Open a gRPC request in the editor. gRPC editors render `GrpcQueryUrl`, keyed on
 * `grpc-query-url-container`.
 */
export async function openGrpcRequest(
  page: Page,
  sidebar: Frame,
  collectionName: string,
  requestName: string
): Promise<Frame> {
  return openRequestByMarker(page, sidebar, collectionName, requestName, '[data-testid="grpc-query-url-container"]');
}

/**
 * Shared implementation for opening a request and resolving its editor Frame.
 * `markerSelector` is a selector unique to the target editor type, used both to
 * locate the correct webview frame and to assert the editor has finished loading.
 */
async function openRequestByMarker(
  page: Page,
  sidebar: Frame,
  collectionName: string,
  requestName: string,
  markerSelector: string
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

  // Wait for the request editor frame — identified by the marker selector.
  const timeout = 20_000;
  const deadline = Date.now() + timeout;
  let editor: Frame | undefined;

  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (frame === sidebar || frame === page.mainFrame()) continue;
      try {
        const has = await frame.locator(markerSelector).count();
        if (has > 0) { editor = frame; break; }
      } catch { /* detached */ }
    }
    if (editor) break;
    await page.waitForTimeout(500);
  }

  if (!editor) throw new Error(`Request editor frame with '${markerSelector}' not found within ${timeout}ms`);
  await expect(editor.locator(markerSelector)).toBeVisible({ timeout: 10_000 });

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
 * Create a transient (unsaved) request from the collection's "+" menu.
 * Opens a WebviewPanel titled "Untitled N".
 */
export async function createTransientRequest(
  sidebar: Frame,
  collectionName: string,
  type: 'http' | 'graphql' | 'grpc' | 'ws' = 'http'
): Promise<void> {
  const locators = buildCommonLocators(sidebar);
  await locators.sidebar.collectionName(collectionName).hover();
  await locators.newRequestMenu.addButton(collectionName).click();
  await locators.newRequestMenu.option(type).click();
}

/**
 * Close a VS Code editor tab by its title (clicks the tab's close button).
 */
export async function closeEditorTab(page: Page, title: string): Promise<void> {
  const locators = buildCommonLocators(page);
  const tab = locators.workbench.editorTab(title);
  await tab.hover();
  await locators.workbench.editorTabClose(title).click();
  await expect(tab).toHaveCount(0, { timeout: 2_000 });
}

/**
 * Copy a request/folder to the in-app clipboard via its sidebar context menu.
 *
 * @param sidebar - The sidebar webview Frame
 * @param itemName - Name of the request/folder to copy
 */
export async function copyItem(sidebar: Frame, itemName: string): Promise<void> {
  const itemRow = sidebar
    .locator('[data-testid="sidebar-collection-item-row"]')
    .filter({ hasText: itemName });
  await itemRow.hover();
  await itemRow.locator('[data-testid="collection-item-menu"]').click();
  await sidebar.locator('[role="menuitem"]').filter({ hasText: /^Copy$/ }).click();
}

/**
 * Paste the in-app clipboard item into a collection's root via its context menu.
 * The "Paste" entry only appears once something has been copied.
 *
 * @param sidebar - The sidebar webview Frame
 * @param collectionName - Name of the destination collection
 */
export async function pasteIntoCollection(sidebar: Frame, collectionName: string): Promise<void> {
  const collectionRow = sidebar
    .locator('[data-testid="sidebar-collection-row"]')
    .filter({ hasText: collectionName });
  await collectionRow.hover();
  await collectionRow.locator('[data-testid="collection-actions"]').click();
  await sidebar.locator('[role="menuitem"]').filter({ hasText: /^Paste$/ }).click();
}

/**
 * Select a tab in the request editor's request pane (e.g. "Params", "Body", "Headers").
 *
 * @param editor - The request editor's webview Frame
 * @param tabName - Visible label of the tab to select
 */
export async function openRequestPaneTab(editor: Frame, tabName: string): Promise<void> {
  // Request-pane tabs collapse into a ">>" overflow menu when the pane is narrow, so click the tab
  // directly when it's visible, otherwise reach it via the overflow menu.
  const directTab = editor.locator('[role="tab"]').filter({ hasText: tabName }).first();
  if (await directTab.isVisible().catch(() => false)) {
    await directTab.click();
    return;
  }
  await editor.locator('.more-tabs').click();
  await editor.locator(`[data-testid="menu-dropdown-${tabName.toLowerCase()}"]`).click();
  await expect(directTab).toBeVisible({ timeout: 15_000 });
}


export async function openCollectionSettings(
  page: Page,
  sidebar: Frame,
  collectionName: string,
  timeout = 5_000
): Promise<Frame> {
  const collectionRow = buildCommonLocators(sidebar).sidebar.collectionName(collectionName);
  await expect(collectionRow).toBeVisible({ timeout });
  await collectionRow.click();

  const deadline = Date.now() + timeout;
  let editor: Frame | undefined;

  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (frame === sidebar || frame === page.mainFrame()) continue;
      try {
        const has = await buildCommonLocators(frame).collectionSettings.container().count();
        if (has > 0) { editor = frame; break; }
      } catch (err) {
        console.debug('Frame detached during collection-settings lookup:', err);
      }
    }
    if (editor) break;
    await page.waitForTimeout(500);
  }

  if (!editor) throw new Error(`Collection settings frame not found within ${timeout}ms`);
  await expect(buildCommonLocators(editor).collectionSettings.container()).toBeVisible({ timeout });

  return editor;
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
