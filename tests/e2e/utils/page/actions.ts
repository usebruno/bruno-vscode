import * as fs from 'fs';
import * as path from 'path';
import { Page, Frame, FrameLocator, Locator, expect, TestType, PlaywrightTestOptions, PlaywrightTestArgs, PlaywrightWorkerArgs, PlaywrightWorkerOptions } from '@playwright/test';
import { buildCommonLocators } from './locators';
import { GRPC_SERVER_URL } from '../urls';
import { Context } from '../../context';
import { VSCodeFixture, VSCodeOptions } from '../fixtures';

// The editor pane currently in focus (request, folder settings or collection settings).
export const activeEditor = (page: Page): FrameLocator =>
  page.frameLocator('iframe.webview.ready:visible:right-of(.part.sidebar)').last().frameLocator('#active-frame');

/**
 * Locate the collection directory created under a test's tmpDir.
 */
export function findCollectionDir(
  root: string,
  configFile: 'bruno.json' | 'opencollection.yml' = 'bruno.json'
): string {
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

/** Recursively return paths of every file under `dir` whose name matches `fileName`. */
export function findFilesWithName(dir: string, fileName: string): string[] {
  const matches: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) matches.push(...findFilesWithName(full, fileName));
    else if (entry.name === fileName) matches.push(full);
  }
  return matches;
}

// Find the webview Frame that contains the given marker selector.
export async function getWebviewFrame(
  page: Page,
  markerSelector: (frame: Frame) => Locator,
  existingFrame?: Frame,
  timeout = 20_000
): Promise<Frame> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame() || frame === existingFrame) continue;
      try {
        if (await markerSelector(frame).count() > 0) return frame;
      } catch {
        // frame may have been detached, skip
      }
    }
    await page.waitForTimeout(500);
  }

  throw new Error(`Could not find a webview frame within ${timeout}ms`);
}

/**
 * Get a FrameLocator for a webview by its panel title.
 *
 * VS Code nests each webview as `iframe.webview[name=<uuid>]` > `iframe#active-frame[title=...]`.
 * Only the inner iframe carries the title and the outer one has nothing but a random
 * uuid, so a plain locator chain can't target a panel. We look up the outer iframe's
 * name once, then return a regular (lazy, auto-waiting) locator chain pinned to it.
 */
export async function getWebviewByTitle(page: Page, title: string, timeout = 20_000): Promise<FrameLocator> {
  let outerName: string | undefined;
  await expect.poll(async () => {
    for (const frame of page.frames()) {
      const outer = frame.parentFrame();
      // Only inner `#active-frame`s carry the title; skip top-level and outer frames.
      if (!outer || outer === page.mainFrame()) {
        continue;
      };

      const el = await frame.frameElement().catch(() => null);
      if (el && await el.getAttribute('title').catch(() => null) === title) {
        outerName = outer.name();
        return true;
      }
    }
    return false;
  }, { timeout, message: `Webview "${title}" not found` }).toBe(true);

  return page.locator(`iframe.webview[name="${outerName}"]`).contentFrame()
    .locator(`iframe#active-frame[title="${title}"]`).contentFrame();
}

/**
 * Wait for a new webview Frame to appear that is different from `existingFrame`.
 * Used when opening a new panel (e.g. Import Collection, New Request) that
 * creates a second webview.
 */
export async function waitForNewWebviewFrame(
  page: Page,
  existingFrame: Frame,
): Promise<Frame> {
  return getWebviewFrame(page, (frame) => frame.locator('#root'), existingFrame);
}

/**
 * Open the Bruno sidebar by clicking the activity-bar icon and waiting for it to load.
 * Returns the sidebar's webview Frame for further interaction.
 */
export async function openBrunoSidebar(page: Page): Promise<Frame> {
  const brunoIcon = page.locator('.activitybar a.action-label[aria-label="Bruno"]');
  await expect(brunoIcon).toBeVisible({ timeout: 15_000 });

  // Clicking the active icon would collapse the sidebar, so only click when Bruno isn't shown yet.
  const sidebarTitle = buildCommonLocators(page).workbench.sidebarTitle();
  // /Bruno/i: the sidebar title contains "Bruno" in any casing
  const alreadyOpen = await sidebarTitle.isVisible() && /Bruno/i.test((await sidebarTitle.textContent()) ?? '');
  if (!alreadyOpen) {
    await brunoIcon.click();
  }
  await expect(sidebarTitle).toHaveText(/Bruno/i, { timeout: 15_000 });

  // Wait for the sidebar webview frame with Bruno content to be ready
  const frame = await getWebviewFrame(page, (frame) => frame.locator('#root'));
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
async function mockIpcInvoke(frame: Frame, channelName: string, dirPath: string): Promise<void> {
  await frame.evaluate(({ channelName, dirPath }) => {
    const ipc = (window as any).ipcRenderer;
    // Reuse the real invoke if a mock is still pending, so mocking again replaces it rather than stacking.
    const originalInvoke = ipc.__originalInvoke ?? ipc.invoke.bind(ipc);
    ipc.__originalInvoke = originalInvoke;
    ipc.invoke = async (channel: string, ...args: any[]) => {
      if (channel === channelName) {
        ipc.invoke = originalInvoke;
        delete ipc.__originalInvoke;
        return dirPath;
      }
      return originalInvoke(channel, ...args);
    };
  }, { channelName, dirPath });
}

export async function mockBrowseDirectory(frame: Frame, dirPath: string): Promise<void> {
  await mockIpcInvoke(frame, 'renderer:browse-directory', dirPath);
}

type FileFormat = 'yml' | 'bru';

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
  format: FileFormat = 'yml'
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
  // Mock the IPC call to return our path, then click Browse. On a loaded CI runner the first
  // attempt sometimes leaves the field empty, so mock and click again until formik has the value.
  await expect(async () => {
    await mockBrowseDirectory(editor, location);
    await editor.locator('.browse-button').click();
    await expect(editor.locator('#collectionLocation')).toHaveValue(location, { timeout: 3_000 });
  }).toPass({ timeout: 15_000 });

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
    buildCommonLocators(sidebar).sidebar.collectionName(name)
  ).toBeVisible({ timeout: 15_000 });
}

export async function openImportPanelWithFiles(
  page: Page,
  sidebar: Frame,
  filePaths: string[]
): Promise<Frame> {
  const sidebarLoc = buildCommonLocators(sidebar);
  await sidebarLoc.sidebar.addMenu().click();
  await sidebarLoc.sidebar.addMenuImport().click();

  const editor = await waitForNewWebviewFrame(page, sidebar);
  const importPanel = buildCommonLocators(editor).importCollection;
  await expect(importPanel.container()).toBeVisible();

  await importPanel.fileInput().setInputFiles(filePaths);
  return editor;
}

/**
 * Clone a collection from the sidebar ellipse menu.
 * The clone panel names the copy "<source> copy" and asks for a parent folder.
 */
export async function cloneCollection(
  page: Page,
  sidebar: Frame,
  sourceName: string,
  location: string,
  cloneSuffix: string = ' copy'
): Promise<string> {
  const cloneName = `${sourceName}${cloneSuffix}`;
  const sidebarLocators = buildCommonLocators(sidebar);
  const collectionRow = sidebarLocators.sidebar.collectionName(sourceName);
  await collectionRow.hover();
  await sidebarLocators.sidebar.actionsMenu(sourceName).click();
  await sidebarLocators.sidebar.actionMenuButton(sourceName, 'clone').click();

  const editor = await waitForNewWebviewFrame(page, sidebar);
  const cloneForm = buildCommonLocators(editor).cloneCollection;
  await expect(cloneForm.container()).toBeVisible();
  await expect(cloneForm.nameInput()).toHaveValue(cloneName);

  await mockIpcInvoke(editor, 'clone-collection:browse-location', location);
  await cloneForm.browseButton().click();
  await expect(cloneForm.locationInput()).toHaveValue(location);

  await cloneForm.submit().click();

  await expect(sidebarLocators.sidebar.collectionName(cloneName)).toBeVisible();

  return cloneName;
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
 * @param format - On-disk format chosen on the location step: 'yml' (default) or 'bru'
 */
export async function importCollection(
  page: Page,
  sidebar: Frame,
  filePath: string,
  location: string,
  expectedName: string,
  format: 'yml' | 'bru' = 'yml'
): Promise<void> {
  const editor = await openImportPanelWithFiles(page, sidebar, [filePath]);
  const importPanel = buildCommonLocators(editor).importCollection;

  // Step 2: The location step should now be visible (form with location input)
  await expect(importPanel.location()).toBeVisible({ timeout: 10_000 });

  // The location input is readonly and opens a native file dialog via IPC.
  // Mock the IPC call to return our path, then click Browse.
  await mockBrowseDirectory(editor, location);
  await importPanel.browse().click();
  await expect(importPanel.location()).toHaveValue(location, { timeout: 5_000 });

  if (format !== 'yml') {
    await editor.locator('#format').selectOption(format);
  }

  // Click Import
  await importPanel.submit().click();

  // Wait for the collection to appear in the sidebar
  await expect(
    buildCommonLocators(sidebar).sidebar.collectionName(expectedName)
  ).toBeVisible({ timeout: 20_000 });
}

export async function openCollectionFromDisk(page: Page, sidebar: Frame, collectionPath: string): Promise<void> {
  const sidebarLoc = buildCommonLocators(sidebar);
  await sidebarLoc.sidebar.addMenu().click();
  await sidebarLoc.sidebar.openCollectionButton().click();

  const dialogInput = buildCommonLocators(page).workbench.quickInputBox();
  await expect(dialogInput).toBeVisible();
  await dialogInput.fill(collectionPath + path.sep);
  await page.keyboard.press('Enter');
  await expect(dialogInput).toBeHidden();
}

export async function importMultipleCollections(
  page: Page,
  sidebar: Frame,
  filePaths: string[],
  location: string,
  expectedNames: string[]
): Promise<Frame> {
  const editor = await openImportPanelWithFiles(page, sidebar, filePaths);
  const importPanel = buildCommonLocators(editor).importCollection;

  await expect(importPanel.rows()).toHaveCount(filePaths.length);
  await expect(importPanel.selectedCount()).toHaveText(`${filePaths.length} of ${filePaths.length} selected`);

  await mockBrowseDirectory(editor, location);
  await importPanel.browse().click();
  await expect(importPanel.location()).toHaveValue(location);

  await importPanel.submit().click();

  await expect(importPanel.progressSummary()).toHaveText(`${filePaths.length} of ${filePaths.length} collections imported`);
  await expect(importPanel.close()).toBeEnabled();

  const sidebarLoc = buildCommonLocators(sidebar);
  for (const name of expectedNames) {
    await expect(sidebarLoc.sidebar.collectionName(name)).toBeVisible();
  }

  return editor;
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
  parentName: string,
  inFolder: boolean = false
): Promise<Frame> {
  const locators = buildCommonLocators(sidebar);

  if (inFolder) {
    await expandFolder(sidebar, parentName);
    const folderRow = locators.sidebar.folder(parentName);
    await folderRow.hover();
    await locators.sidebar.itemMenu(parentName).click();
    await locators.sidebar.itemMenuAction(parentName, 'new-request').click();
  } else {
    const collectionRow = locators.sidebar.collectionName(parentName);
    await collectionRow.hover();
    await locators.sidebar.actionsMenu(parentName).click();
    await locators.sidebar.actionsItem(parentName, 'new-request').click();
  }

  // From a folder other webviews are usually open, so look for the New Request panel specifically.
  const editor = inFolder
    ? await getWebviewFrame(page, (frame) => buildCommonLocators(frame).newRequest.container(), sidebar)
    : await waitForNewWebviewFrame(page, sidebar);
  await expect(buildCommonLocators(editor).newRequest.container()).toBeVisible({ timeout: 15_000 });

  return editor;
}

/**
 * Create a transient request from the collection row's "+" menu
 * and return its panel Frame.
 */
export async function openTransientRequest(
  page: Page,
  sidebar: Frame,
  collectionName: string,
  type: 'HTTP' | 'GraphQL' | 'gRPC' | 'WebSocket' = 'HTTP'
): Promise<Frame> {
  const menuType = ({ HTTP: 'http', GraphQL: 'graphql', gRPC: 'grpc', WebSocket: 'ws' } as const)[type];
  const marker = (frame: Frame) => {
    const ui = buildCommonLocators(frame);
    if (type === 'WebSocket') return ui.ws.connectButton();
    if (type === 'gRPC') return ui.grpc.queryUrlContainer();
    return ui.requestUrl.editor();
  };

  await createTransientRequest(sidebar, collectionName, menuType);

  const editor = await getWebviewFrame(page, marker, sidebar);
  await expect(marker(editor)).toBeVisible({ timeout: 10_000 });

  return editor;
}

/**
 * Pick an environment from the collection toolbar's environment selector.
 */
export async function selectEnvironment(frame: Frame | FrameLocator, name: string | null): Promise<void> {
  const env = buildCommonLocators(frame).environments;
  await env.selectorTrigger().click();

  const option = name ? env.dropdownItem(name) : env.noEnvironmentOption();
  await expect(option).toBeVisible();
  await option.click();

  if (name) {
    await expect(env.activeName()).toHaveText(name);
  } else {
    await expect(env.inactiveLabel()).toBeVisible();
  }
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
    buildCommonLocators(sidebar).sidebar.collectionItem(requestName)
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

  const rows = buildCommonLocators(editor).editableTable.rows('request-headers');
  await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  const emptyRowIdx = (await rows.count()) - 1; // the trailing empty row
  const table = buildCommonLocators(editor.getByTestId('request-headers')).editableTable;

  await setCodeMirrorValue(page, table.columnNameEditor(emptyRowIdx), name);
  await setCodeMirrorValue(page, table.columnValueEditor(emptyRowIdx), value);
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

  const rows = buildCommonLocators(editor).editableTable.rows('query-params');
  await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  const emptyRowIdx = (await rows.count()) - 1;
  const table = buildCommonLocators(editor.getByTestId('query-params')).editableTable;

  await table.columnNameInput(emptyRowIdx).fill(name);
  await setCodeMirrorValue(page, table.columnValueEditor(emptyRowIdx), value);

  if (!enabled) {
    await table.columnCheckbox(emptyRowIdx).uncheck();
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

  await setCodeMirrorValue(page, locators.auth.bearerTokenEditor('request'), token);
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
 * Add a request-level variable on the Vars tab's Pre Request table.
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

  const rows = buildCommonLocators(editor).varsTable.rows('request', 'req');
  await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  const emptyRowIdx = (await rows.count()) - 1;
  const table = buildCommonLocators(editor.getByTestId('request-vars-req')).editableTable;

  await table.columnNameInput(emptyRowIdx).fill(name);
  await setCodeMirrorValue(page, table.columnValueEditor(emptyRowIdx), value);
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

export async function createGrpcRequestWithProto(
  page: Page,
  sidebar: Frame,
  collectionName: string,
  options: { name: string; protoFixture: string; targetDir: string; url?: string }
): Promise<Frame> {
  const { name, protoFixture, targetDir, url = GRPC_SERVER_URL } = options;

  const protoInCollection = path.join(targetDir, protoFixture);
  fs.copyFileSync(path.resolve(__dirname, '../fixtures', protoFixture), protoInCollection);

  await createRequestByType(page, sidebar, collectionName, { name, url, type: 'gRPC' });
  const editor = await openGrpcRequest(page, sidebar, collectionName, name);

  await loadGrpcProtoFile(editor, protoInCollection);
  return editor;
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

export async function openGrpcMessageTab(editor: Frame): Promise<void> {
  const locators = buildCommonLocators(editor);
  const messageTab = locators.tabs.byText('Message');
  await expect(messageTab).toBeVisible();
  await messageTab.click();
}

export async function setGrpcMessage(page: Page, editor: Frame, json: string): Promise<void> {
  await openGrpcMessageTab(editor);
  await setCodeMirrorValue(page, buildCommonLocators(editor).grpc.messageEditor(), json);
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
  const collectionRow = buildCommonLocators(sidebar).sidebar.collectionName(collectionName);

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

export async function expandFolder(sidebar: Frame, folderName: string): Promise<void> {
  const folderRow = buildCommonLocators(sidebar).sidebar.collectionItem(folderName);
  const chevron = buildCommonLocators(sidebar).sidebar.folderChevron(folderName);
  const isExpanded = await chevron.evaluate((el) => el.classList.contains('rotate-90'));
  if (!isExpanded) {
    await chevron.click();
  }
}

export async function dragItemIntoFolder(
  sidebar: Frame,
  itemName: string,
  folderName: string
): Promise<void> {
  const locators = buildCommonLocators(sidebar);
  const itemRow = locators.sidebar.collectionItem(itemName);
  const folderRow = locators.sidebar.collectionItem(folderName);
  await expect(itemRow).toBeVisible();
  await expect(folderRow).toBeVisible();

  // steps gives the sidebar a real drag; a single jump does not start one.
  await locators.sidebar.collectionItemLabel(itemName).dragTo(folderRow, { steps: 15 });
}

export async function dragItemAboveOrBelow(
  sidebar: Frame,
  itemName: string,
  targetName: string,
  position: 'above' | 'below'
): Promise<void> {
  const locators = buildCommonLocators(sidebar);
  const itemRow = locators.sidebar.collectionItem(itemName);
  const targetRow = locators.sidebar.collectionItem(targetName);
  const targetPosition = { x: 50, y: position === 'above' ? 3 : 22 };

  await locators.sidebar.collectionItemLabel(itemName).dragTo(targetRow, { targetPosition, steps: 15 });
}

/**
 * Collapse a collection in the sidebar by clicking its chevron toggle.
 * A collapsed collection removes its children from the DOM.
 */
export async function collapseCollection(
  sidebar: Frame,
  collectionName: string
): Promise<void> {
  const collectionRow = buildCommonLocators(sidebar).sidebar.collectionName(collectionName);

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
  const requestRow = buildCommonLocators(sidebar).sidebar.collectionItem(requestName);
  await expect(requestRow).toBeVisible({ timeout: 10_000 });

  // Click the request to open it in the editor
  await requestRow.click();

  return waitForFrameWithMarker(page, sidebar, markerSelector);
}

// Wait for the request editor frame — identified by the marker selector.
async function waitForFrameWithMarker(
  page: Page,
  excludeFrame: Frame,
  markerSelector: string,
  timeout = 20_000
): Promise<Frame> {
  const editor = await getWebviewFrame(page, (frame) => frame.locator(markerSelector), excludeFrame, timeout);
  await expect(editor.locator(markerSelector)).toBeVisible({ timeout: 10_000 });

  return editor;
}

export async function openCollectionSettings(
  page: Page,
  sidebar: Frame,
  collectionName: string
): Promise<Frame> {
  const row = buildCommonLocators(sidebar).sidebar.collectionName(collectionName);
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();

  const settings = await getWebviewFrame(
    page,
    (frame) => buildCommonLocators(frame).collectionSettings.container(), sidebar);
  await expect(buildCommonLocators(settings).collectionSettings.container()).toBeVisible({ timeout: 10_000 });

  return settings;
}

export async function openEnvironmentsTab(page: Page, from: Frame): Promise<Frame> {
  const environments = buildCommonLocators(from).environments;
  await environments.selectorTrigger().click();
  await environments.configureButton().click();
  return getWebviewFrame(page, (frame) => buildCommonLocators(frame).environments.settingsList(), from);
}

export async function addCollectionHeader(
  page: Page,
  settings: Frame,
  name: string,
  value: string
): Promise<void> {
  await openRequestPaneTab(settings, 'Headers');

  const rows = buildCommonLocators(settings).editableTable.rows('collection-headers');
  await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  const emptyRowIdx = (await rows.count()) - 1;
  const table = buildCommonLocators(settings.getByTestId('collection-headers')).editableTable;

  await setCodeMirrorValue(page, table.columnNameEditor(emptyRowIdx), name);
  await setCodeMirrorValue(page, table.columnValueEditor(emptyRowIdx), value);
}

export async function saveCollectionSettings(settings: Frame, tab: string): Promise<void> {
  const saveButton = buildCommonLocators(settings).collectionSettings.saveButton(tab);
  await expect(saveButton).toBeVisible();
  await saveButton.click();
}

export async function setPresetBaseUrl(settings: Frame, url: string): Promise<void> {
  await openRequestPaneTab(settings, 'Presets');
  const input = buildCommonLocators(settings).requestUrl.editor();
  await expect(input).toBeVisible();
  await input.fill(url);
}

export async function recordIpcCalls(frame: Frame): Promise<void> {
  await frame.evaluate(() => {
    const w = window as any;
    w.__ipcCalls = [];
    if (w.__ipcCallsPatched) return;
    w.__ipcCallsPatched = true;
    const ipc = w.ipcRenderer;
    const originalInvoke = ipc.invoke.bind(ipc);
    ipc.invoke = (channel: string, ...args: any[]) => {
      w.__ipcCalls.push(channel);
      return originalInvoke(channel, ...args);
    };
  });
}

export async function countIpcCalls(frame: Frame, channel: string): Promise<number> {
  return frame.evaluate(
    (ch) => ((window as any).__ipcCalls || []).filter((c: string) => c === ch).length,
    channel
  );
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
  editor: Frame | FrameLocator,
  expectedStatus?: 200 | 201 | 400 | 401 | 404,
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
  const collectionRow = buildCommonLocators(sidebar).sidebar.collectionName(collectionName);
  await collectionRow.hover();

  // Mock the confirmation dialog before triggering removal
  await mockConfirmRemove(sidebar);

  // Open the 3-dot context menu
  await buildCommonLocators(sidebar).sidebar.actionsMenu(collectionName).click();

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
 * @param parentName - Name of the parent collection, or of the parent folder when `isCollection` is false
 * @param folderName - Name for the new folder
 * @param isCollection - Whether the parent is a collection (true) or a folder (false)
 */
export async function createFolder(
  sidebar: Frame,
  parentName: string,
  folderName: string,
  isCollection: boolean = true
): Promise<void> {
  await mockNewFolderPrompt(sidebar, folderName);

  const locators = buildCommonLocators(sidebar);

  if (isCollection) {
    await expandCollection(sidebar, parentName);
    const collectionRow = locators.sidebar.collectionName(parentName);
    await collectionRow.hover();
    await locators.sidebar.actionsMenu(parentName).click();
    await locators.sidebar.actionsItem(parentName, 'new-folder').click();
  } else {
    const folderRow = locators.sidebar.folder(parentName);
    await folderRow.hover();
    await locators.sidebar.itemMenu(parentName).click();
    await locators.sidebar.itemMenuAction(parentName, 'new-folder').click();
  }

  if (!isCollection) {
    await expandFolder(sidebar, parentName);
  }

  await expect(
    buildCommonLocators(sidebar).sidebar.collectionItem(folderName)
  ).toBeVisible({ timeout: 15_000 });
}

/** Pick an auth mode by its dropdown label, e.g. 'Bearer Token', in the auth pane that is open. */
export async function selectAuthMode(page: Page, modeLabel: string): Promise<void> {
  const editor = activeEditor(page);
  await editor.locator('.auth-mode-label').click();
  await editor.locator('.dropdown-item').filter({ hasText: modeLabel }).click();
}

async function selectPaneTab(page: Page, paneSelector: string, tabName: string): Promise<void> {
  const editor = activeEditor(page);
  const pane = editor.locator(paneSelector);
  await expect(pane).toBeVisible();
  await expect(pane.locator('.tabs')).toBeVisible();

  const visibleTab = pane.locator('.tabs').getByRole('tab', { name: tabName });
  const overflowButton = pane.locator('.tabs .more-tabs');

  await expect(async () => {
    if (await visibleTab.isVisible()) {
      await visibleTab.click({ timeout: 2000 });
      await expect(visibleTab).toContainClass('active', { timeout: 2000 });
      return;
    }

    if (await overflowButton.isVisible()) {
      await overflowButton.click({ timeout: 2000 });

      const dropdownItem = editor.locator('[role="menuitem"]').filter({ hasText: tabName });
      await dropdownItem.waitFor({ state: 'visible', timeout: 2000 });
      await dropdownItem.click({ force: true, timeout: 2000 });
      await expect(visibleTab).toContainClass('active', { timeout: 2000 });
      return;
    }

    throw new Error(`Tab "${tabName}" not found in visible tabs or overflow dropdown`);
  }).toPass({ timeout: 15000 });
}

export async function selectResponsePaneTab(page: Page, tabName: string): Promise<void> {
  await selectPaneTab(page, '.response-pane', tabName);
}

export async function selectRequestPaneTab(page: Page, tabName: string): Promise<void> {
  await selectPaneTab(page, '.request-pane', tabName);
}

export async function saveFileByKeyboard(page: Page): Promise<void> {
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
}

export async function saveRequest(page: Page): Promise<void> {
  await saveFileByKeyboard(page);
  await expect(activeEditor(page).getByText('Request saved successfully').last()).toBeVisible({ timeout: 3000 });
  await page.waitForTimeout(200);
}

/**
 * Replace the request URL in a request panel.
 */
export async function setRequestUrl(page: Page, frame: Frame, url: string): Promise<void> {
  await setCodeMirrorValue(page, buildCommonLocators(frame).requestUrl.editor().locator('.CodeMirror'), url);
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
  const itemRow = buildCommonLocators(sidebar).sidebar.collectionItem(itemName);
  await itemRow.hover();

  // Mock the confirmation dialog
  await mockConfirmDelete(sidebar);

  // Open the context menu (3-dot icon on the item)
  await buildCommonLocators(sidebar).sidebar.itemMenu(itemName).click();

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
  await locators.newRequestMenu.option(collectionName, type).click();
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
 * Close an editor tab only when it is still open.
 * Used after the first request when a test creates a second one, so the next
 * New Request panel is not confused with the editor that just opened.
 */
export async function closeEditorTabIfOpen(page: Page, title: string): Promise<void> {
  const workbench = buildCommonLocators(page).workbench;
  const tab = workbench.editorTab(title);
  if ((await tab.count()) === 0) {
    return;
  }
  await tab.first().hover();
  await workbench.editorTabClose(title).first().click();
  await expect(tab).toHaveCount(0);
}

/**
 * Copy a request/folder to the in-app clipboard via its sidebar context menu.
 *
 * @param sidebar - The sidebar webview Frame
 * @param itemName - Name of the request/folder to copy
 */
export async function copyItem(sidebar: Frame, itemName: string): Promise<void> {
  const itemRow = buildCommonLocators(sidebar).sidebar.collectionItem(itemName);
  await itemRow.hover();
  await buildCommonLocators(sidebar).sidebar.itemMenu(itemName).click();
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
  const collectionRow = buildCommonLocators(sidebar).sidebar.collectionName(collectionName);
  await collectionRow.hover();
  await buildCommonLocators(sidebar).sidebar.actionsMenu(collectionName).click();
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
  await editor.getByTestId(`request-pane-tabs-menu-${tabName.toLowerCase()}`).click();
  await expect(directTab).toBeVisible({ timeout: 15_000 });
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

/**
 * Open the collection runner from the collection ellipse menu ("Run").
 * Returns the runner panel once the Run Collection button is visible.
 */
export async function openCollectionRunner(
  page: Page,
  sidebar: Frame,
  collectionName: string
): Promise<Frame> {
  const menu = buildCommonLocators(sidebar);
  const row = menu.sidebar.collectionName(collectionName);
  await row.waitFor({ state: 'visible', timeout: 10_000 });
  // The ellipse menu is hidden until the collection row is hovered.
  await row.hover();
  await menu.sidebar.actionsMenu(collectionName).click();
  await menu.sidebar.actionsItem(collectionName, 'run').click();

  const runner = await getWebviewFrame(
    page,
    (frame) => buildCommonLocators(frame).runner.runCollectionButton(),
    sidebar
  );
  await expect(buildCommonLocators(runner).runner.runCollectionButton()).toBeVisible({ timeout: 20_000 });

  return runner;
}

/**
 * Type a tag into a tag field. Closes the suggestion list first, because Enter
 * would only pick the hint.
 */
async function typeRunnerTag(page: Page, frame: Frame, input: Locator, tag: string): Promise<void> {
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.click();
  await page.keyboard.type(tag, { delay: 20 });

  const suggestions = buildCommonLocators(frame).runner.tagSuggestionList();
  if (await suggestions.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await suggestions.waitFor({ state: 'hidden', timeout: 5_000 });
  }
  await page.keyboard.press('Enter');
  await buildCommonLocators(frame).runner.tagChipButton(tag).waitFor({ state: 'visible', timeout: 10_000 });
}

/** Turn on "Filter requests with tags" and add `tag` to Included tags. */
export async function includeRunnerTag(page: Page, runner: Frame, tag: string): Promise<void> {
  const locators = buildCommonLocators(runner).runner;
  await locators.filterByTagsRadio().click();
  await typeRunnerTag(page, runner, locators.includeTagInput(), tag);
}

/** Turn on "Filter requests with tags" and add `tag` to Excluded tags. */
export async function excludeRunnerTag(page: Page, runner: Frame, tag: string): Promise<void> {
  const locators = buildCommonLocators(runner).runner;
  await locators.filterByTagsRadio().click();
  await typeRunnerTag(page, runner, locators.excludeTagInput(), tag);
}

/** Click Run Collection and wait until the run finishes. */
export async function runCollection(runner: Frame): Promise<void> {
  const locators = buildCommonLocators(runner).runner;
  await locators.runCollectionButton().click();
  await locators.runAgainButton().waitFor({ state: 'visible', timeout: 30_000 });
}

/**
 * Open a request, add `tag` from its Settings tab, and save it
 * so the runner can load the tag from disk.
 */
export async function addRequestTag(
  page: Page,
  sidebar: Frame,
  collectionName: string,
  requestName: string,
  tag: string
): Promise<void> {
  const editor = await openRequest(page, sidebar, collectionName, requestName);
  const tabs = buildCommonLocators(editor).tabs;
  // The editor can still be swapping from the previously open request. Wait until
  // Settings or its overflow control is actually there before clicking.
  await expect(tabs.byText('Settings').or(tabs.more()).first()).toBeVisible({ timeout: 15_000 });
  await openRequestPaneTab(editor, 'Settings');

  const locators = buildCommonLocators(editor).runner;
  await typeRunnerTag(page, editor, locators.requestTagInput(), tag);
  await runCommand(page, 'Bruno: Save Request');
  await locators.savedToastText().waitFor({ state: 'visible', timeout: 10_000 });
}

type KeyValue<T = string | number | boolean> = {
  [k: string]: T,
}

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
type RequestType = 'HTTP' | 'GraphQL' | 'gRPC' | `WebSocket`;

export async function createCollectionV2(page: Page, _sidebar: Frame, name: string, hasExistingCollections = false, fileFormat: FileFormat = 'yml') {
  const sidebar = _sidebar ?? await openBrunoSidebar(page);
  const sidebarElements = buildCommonLocators(sidebar).sidebar

  const ctx = new Context(name);

  if (hasExistingCollections) {
    // Open the "+" dropdown and click "Create collection"
    await sidebarElements.addMenu().click();
    await sidebarElements.addMenuCreate().click()
  } else {
    await sidebar.getByRole('button', { name: 'Create Collection' }).click();
  }

  const webview = await getWebviewByTitle(page, 'Create Collection')
  await expect(webview.getByRole('heading', { name: "Create Collection" })).toBeVisible()

  const collectionNameInput = webview.getByRole('textbox', { name: 'Collection Name' });
  await collectionNameInput.click();
  await collectionNameInput.fill(name ?? 'Test_collection');

  const locationInput = webview.getByRole('textbox', { name: 'Location' });
  await locationInput.click()

  const selectFolderButton = page.getByRole('button', { name: 'Select Folder' });
  await selectFolderButton.click();
  await selectFolderButton.waitFor({ state: 'hidden' });

  await expect.poll(async () => {
    return (await locationInput.inputValue()).length > 0;
  }).toBe(true)
  const location = await locationInput.inputValue()

  ctx.collectionLocation = location;

  if (fileFormat === 'bru') {
    const fileFormatSelect = webview.getByRole('listbox', { name: 'File Format' });
    if (!(await fileFormatSelect.isVisible())) {
      await webview.getByRole('button', { name: 'Options' }).click();
    }

    await fileFormatSelect.selectOption('bru');
  }

  const createCollectionButton = webview.getByRole('button', { name: 'Create Collection' });
  await expect(createCollectionButton).toBeEnabled();
  await createCollectionButton.click();

  await expect(sidebar.getByText(name)).toBeVisible();

  return ctx;
}

const requestTypeIdMap = {
  'HTTP': 'http',
  'GraphQL': 'graphql',
  'gRPC': 'grpc',
  'WebSocket': 'ws'
} as const

export async function createRequestV2(page: Page, _sidebar: Frame, ctx: Context, collectionName: string, type: RequestType, method: RequestMethod = 'GET') {
  const sidebar = _sidebar ?? await openBrunoSidebar(page);
  const newRequestMenu = buildCommonLocators(sidebar).newRequestMenu;
  await sidebar.getByText(collectionName).hover()
  await newRequestMenu.addButton(collectionName).click();
  await newRequestMenu.option(collectionName, requestTypeIdMap[type]).click();

  const webview = await getWebviewByTitle(page, 'Untitled 1');
  expect(webview).toBeTruthy();

  const requestTypeDropdown = webview.getByTestId('request-method');
  if ((await requestTypeDropdown.getAttribute('aria-expanded')) === 'false') {
    await requestTypeDropdown.click()
  }

  await webview.getByTestId(`request-method-${method.toLowerCase()}`).click()

  return webview;
}

// Only configuring for json for now
export async function fillRequestDetails(webview: FrameLocator, ctx: Context, url: string, payload?: string, params?: KeyValue[], headers?: KeyValue[]) {
  // Ideally target it via a test-id. Classes are usually flaky
  const urlInput = webview.locator('.CodeMirror-lines').first();
  await urlInput.click()
  await urlInput.pressSequentially(url);
}

export async function saveRequestV2(page: Page, webview: FrameLocator, ctx: Context, name: string, newRequest = true) {
  await webview.getByTitle('Save Request').click();
  if (newRequest) {
    const workbench = buildCommonLocators(page).workbench;
    const quickInputWidget = page.locator('.quick-input-widget');

    // Step 1/2: folder picker — accept the collection root ("Select this folder" is the first item).
    await expect(quickInputWidget).toContainText('(1/2)');
    await page.keyboard.press('Enter');

    // Step 2/2: name input, prefilled with the current name — replace it.
    await expect(quickInputWidget).toContainText('Enter a name for the request');
    await workbench.quickInputBox().fill(name);
    await page.keyboard.press('Enter');
    await expect(quickInputWidget).toBeHidden();

    // Saving disposes the transient "Untitled" panel and opens the saved file in the request editor.
    // `owner()` is the iframe element itself, so a count of 0 means that webview is gone.
    await expect(webview.owner()).toHaveCount(0);

    const savedWebview = await getWebviewByTitle(page, name);
    await expect(savedWebview.owner()).toBeVisible();
    return savedWebview;
  }

  return webview;
}

type Test = TestType<PlaywrightTestArgs & PlaywrightTestOptions & VSCodeFixture & VSCodeOptions, PlaywrightWorkerArgs & PlaywrightWorkerOptions>

export async function takeScreenshot(page: Page, test: Test) {
  const info = test.info();
  // Folder-safe test title: `[^\w-]+` matches each run of characters that aren't a letter,
  // digit, `_` or `-` (spaces, `:`, `,`, `/` …) and collapses it into a single `_`.
  // e.g. "T1: create, run request" -> "T1_create_run_request"
  const testDir = test.info().titlePath.slice(1).join(' ').replace(/[^\w-]+/g, '_');
  // File-safe ISO timestamp: `[:.]` matches every `:` and `.` (not allowed in Windows file names)
  // and replaces each with `-`. e.g. "2026-10-20T10:28:18.734Z" -> "2026-10-20T10-28-18-734Z"
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = info.retry ? `-retry${info.retry}` : info.repeatEachIndex ? `-repeat${info.repeatEachIndex}` : '';
  const screenshotPath = path.join(path.dirname(info.config.configFile!), 'e2e-screenshots', testDir, `${timestamp}${suffix}.png`);
  await page.screenshot({ path: screenshotPath });
  await test.info().attach('final-state', { path: screenshotPath, contentType: 'image/png' })
}

/**
 * Delete a saved request from the sidebar through the real UI: row "⋯" menu → Delete → modal confirm.
 * Needs `window.dialogStyle: 'custom'` so the modal renders in the workbench DOM instead of as a native OS dialog.
 */
export async function deleteRequestV2(page: Page, sidebar: Frame, ctx: Context, name: string, fileFormat: FileFormat = 'yml') {
  await expandCollection(sidebar, ctx.collectionName);

  const requestRow = buildCommonLocators(sidebar).sidebar.collectionItem(name);
  await requestRow.hover();
  await buildCommonLocators(requestRow).sidebar.itemMenu(name).click();
  await sidebar.getByRole('menuitem', { name: 'Delete' }).click();

  // Modal confirmation from `vscode.window.showWarningMessage(..., { modal: true }, 'Delete')`
  const dialog = page.locator('.monaco-dialog-box');
  await expect(dialog).toContainText(`Delete request "${name}"?`);
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(dialog).toBeHidden();

  // verify that request is deleted, in the sidebar and on disk
  await expect(requestRow).toHaveCount(0);
  const requestFile = path.join(ctx.collectionLocation, ctx.collectionName, `${name}.${fileFormat}`);
  await expect.poll(() => fs.existsSync(requestFile), { message: `${requestFile} should be deleted` }).toBe(false);
}

/**
 * Export a collection in Bruno JSON format through the real UI: collection "⋯" menu → Export → Bruno Collection → save dialog.
 * Needs `files.simpleDialog.enable` so the save dialog renders as a quick input. The file is saved next to the collection folder.
 */
export async function exportCollectionV2(page: Page, sidebar: Frame, ctx: Context) {
  const sidebarElements = buildCommonLocators(sidebar).sidebar;
  // The "⋯" actions button only becomes visible while the collection row is hovered.
  await sidebarElements.collectionName(ctx.collectionName).hover();
  await sidebarElements.collectionMenuOptions(ctx.collectionName).click();
  await sidebar.getByRole('menuitem', { name: 'Export' }).click();

  const webview = await getWebviewByTitle(page, 'Export Collection');
  await expect(webview.getByRole('heading', { name: 'Export Collection' })).toBeVisible();

  // anti-pattern: the export options are clickable divs, not buttons, so there is no role to target
  await webview.getByText('Bruno Collection', { exact: true }).click();

  // Save dialog (simple dialog): replace the prefilled path with one inside the collection's location
  const exportPath = path.join(ctx.collectionLocation, `${ctx.collectionName}.json`);
  const saveInput = buildCommonLocators(page).workbench.quickInputBox();
  await expect(saveInput).toBeVisible();
  await saveInput.fill(exportPath);
  await page.keyboard.press('Enter');
  await expect(saveInput).toBeHidden();

  // On success the panel shows a toast and closes itself straight away, so the toast can't be asserted.
  // Wait for the panel to go instead — on failure it stays open with "Failed to export collection".
  await expect(webview.owner()).toHaveCount(0);

  // verify the exported file on disk
  await expect.poll(() => fs.existsSync(exportPath), { message: `${exportPath} should be exported` }).toBe(true);
  return JSON.parse(fs.readFileSync(exportPath, 'utf8'));
}
