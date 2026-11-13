import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { expect, type Page, type Frame, type FrameLocator, type Locator, type TestType, type PlaywrightTestOptions, type PlaywrightTestArgs, type PlaywrightWorkerArgs, type PlaywrightWorkerOptions } from '@playwright/test';
import { buildCommonLocators } from './locators';
import { activeEditor, getWebviewFrame, getWebviewByTitle, mockBrowseFiles } from './webviews';
import type { FileFormat, ImportReview, NewRequestOptions, RequestKind, Sidebar } from './sidebar';
import { openBrunoSidebar } from './sidebar';
import { GRPC_SERVER_URL } from '../urls';
import type { Context } from '../../context';
import type { VSCodeFixture, VSCodeOptions } from '../fixtures';
import type { AuthFields, AuthMode, CollectionSettingsConfig, KeyValue, ResponsePaneTab } from '../../e2e-helper';

// Webview panel helpers and the sidebar driver live in their own modules; re-exported so specs keep their imports.
export { activeEditor, getWebviewFrame, getWebviewByTitle, mockIpcInvoke, mockBrowseFiles } from './webviews';
export { openBrunoSidebar, type Sidebar } from './sidebar';

/** Create `<location>/<name>` from the sidebar and wait for its row. */
export async function createCollection(
  sidebar: Sidebar,
  name: string,
  location: string | undefined,
  format: FileFormat = 'yml'
): Promise<void> {
  await sidebar.createCollection(name, location, format);
}

/** Clone a collection from its menu; the clone is named "<source><suffix>". Resolves to that name. */
export async function cloneCollection(
  sidebar: Sidebar,
  sourceName: string,
  location: string,
  cloneSuffix: string = ' copy'
): Promise<string> {
  return sidebar.cloneCollection(sourceName, location, cloneSuffix);
}

/** Import one collection file into `location` and wait for `expectedName` to show. */
export async function importCollection(
  sidebar: Sidebar,
  filePath: string,
  location: string,
  expectedName: string,
  format: FileFormat = 'yml'
): Promise<void> {
  await sidebar.importCollection(filePath, location, expectedName, format);
}

/** Start an import with `filePaths` and stop at the review step, every file checked. */
export async function openImportReview(sidebar: Sidebar, filePaths: string[]): Promise<ImportReview> {
  return sidebar.openImportReview(filePaths);
}

/** Import every file into `location` and wait for each collection's row. */
export async function importCollections(
  sidebar: Sidebar,
  filePaths: string[],
  location: string,
  expectedNames: string[],
  format: FileFormat = 'yml'
): Promise<void> {
  const review = await sidebar.openImportReview(filePaths);
  await expect(review.rows()).toHaveCount(filePaths.length);
  await review.submit(location, format);

  for (const name of expectedNames) {
    await expect(sidebar.locators.collectionName(name)).toBeVisible({ timeout: 20_000 });
  }
}

export async function openCollectionFromDisk(sidebar: Sidebar, collectionPath: string): Promise<void> {
  await sidebar.openCollectionFromDisk(collectionPath);
}

/** Create a saved request in `collectionName` (or in `opts.folder` inside it) and wait for its row. */
export async function createRequestByType(
  sidebar: Sidebar,
  collectionName: string,
  opts: NewRequestOptions
): Promise<void> {
  await sidebar.createRequest(collectionName, opts);
}

/** Create a saved request inside a folder of a collection. */
export async function createRequestInFolder(
  sidebar: Sidebar,
  { collection, folder, name, type, method, url }: { collection: string; folder: string; name: string; type: 'HTTP' | 'GraphQL' | 'gRPC' | 'WebSocket'; method: string; url: string }
): Promise<void> {
  await sidebar.createRequest(collection, { name, url, type, method, folder });
}

export async function expandCollection(sidebar: Sidebar, collectionName: string): Promise<void> {
  await sidebar.expandCollection(collectionName);
}

export async function expandFolder(sidebar: Sidebar, folderName: string): Promise<void> {
  await sidebar.expandFolder(folderName);
}

export async function collapseCollection(sidebar: Sidebar, collectionName: string): Promise<void> {
  await sidebar.collapseCollection(collectionName);
}

export async function dragItemIntoFolder(sidebar: Sidebar, itemName: string, folderName: string): Promise<void> {
  await sidebar.dragItemIntoFolder(itemName, folderName);
}

/** Place `itemName` right above or below `targetName`. */
export async function dragItemAboveOrBelow(
  sidebar: Sidebar,
  itemName: string,
  targetName: string,
  position: 'above' | 'below'
): Promise<void> {
  await sidebar.moveItemAboveOrBelow(itemName, targetName, position);
}

/** Move an item: 'inside' drops it into a folder, 'above' / 'below' place it next to a sibling. */
export async function dragItem(
  page: Page,
  { dragItem, target, position }: { dragItem: string; target: string; position: 'above' | 'below' | 'inside' }
): Promise<void> {
  const sidebar = await openBrunoSidebar(page);

  if (position === 'inside') {
    await sidebar.dragItemIntoFolder(dragItem, target);
  } else {
    await sidebar.moveItemAboveOrBelow(dragItem, target, position);
  }
}

/**
 * Shared implementation for opening a request and resolving its editor Frame.
 * `markerSelector` is a selector unique to the target editor type, used both to
 * locate the correct webview frame and to assert the editor has finished loading.
 */
async function openRequestByMarker(
  page: Page,
  sidebar: Sidebar,
  collectionName: string,
  requestName: string,
  markerSelector: string
): Promise<Frame> {
  await sidebar.clickRequest(collectionName, requestName);
  return waitForFrameWithMarker(page, markerSelector);
}

/** Click a collection's row, which opens its settings; resolves to the settings frame. */
export async function openCollectionSettings(sidebar: Sidebar, collectionName: string): Promise<Frame> {
  return sidebar.openCollectionSettings(collectionName);
}

/** Remove an opened collection from the sidebar and wait for its row to go. */
export async function removeCollection(sidebar: Sidebar, collectionName: string): Promise<void> {
  await sidebar.removeCollection(collectionName);
}

/** Create a folder under a collection (`isCollection`) or under another folder. */
export async function createFolder(
  sidebar: Sidebar,
  parentName: string,
  folderName: string,
  isCollection: boolean = true
): Promise<void> {
  await sidebar.createFolder(parentName, folderName, isCollection);
}

/** Delete a request or folder from its menu, confirming the dialog, and wait for the row to go. */
export async function deleteItem(sidebar: Sidebar, itemName: string): Promise<void> {
  await sidebar.deleteItem(itemName);
}

/** Copy a request or folder to the in-app clipboard. */
export async function copyItem(sidebar: Sidebar, itemName: string): Promise<void> {
  await sidebar.copyItem(itemName);
}

/** Paste the in-app clipboard item into a collection's root from its menu. */
export async function pasteIntoCollection(sidebar: Sidebar, collectionName: string): Promise<void> {
  await sidebar.pasteIntoCollection(collectionName);
}

/** Paste the in-app clipboard item from a request or folder row's menu. */
export async function pasteOntoItem(sidebar: Sidebar, itemName: string): Promise<void> {
  await sidebar.pasteOntoItem(itemName);
}

/** Open the collection runner from the collection menu ("Run"); resolves once Run Collection is visible. */
export async function openCollectionRunner(sidebar: Sidebar, collectionName: string): Promise<Frame> {
  return sidebar.openCollectionRunner(collectionName);
}

// ---------------------------------------------------------------------------
// V2 flows: the Context-based helpers createSetup builds suites with. They are
// the ones to reach for in new specs; the older helpers above are kept for the
// specs that still use them.
// ---------------------------------------------------------------------------

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** Create `<location>/<name>` and wait for its row; the collection is recorded in `ctx` for the other V2 helpers. */
export async function createCollectionV2(
  sidebar: Sidebar,
  ctx: Context,
  name: string,
  location: string,
  fileFormat: FileFormat = 'yml'
): Promise<void> {
  ctx.addCollection(name, location);
  await sidebar.createCollection(name, location, fileFormat);
}

/**
 * Create a request in the collection root with its method set, and resolve to
 * its editor. The sidebar writes a request under its name as soon as it is
 * created, so the name is given here. The URL and any other edits are the
 * caller's, saved with `saveRequestV2`.
 */
export async function createRequestV2(
  page: Page,
  sidebar: Sidebar,
  collectionName: string,
  name: string,
  type: RequestKind,
  method: RequestMethod = 'GET'
): Promise<FrameLocator> {
  await sidebar.newRequest(collectionName, { name, type });
  const editor = activeEditor(page);

  if (method !== 'GET') {
    await editor.getByTestId('request-method').click();
    await editor.getByTestId(`request-method-${method.toLowerCase()}`).click();
  }

  return editor;
}

/** Type the URL into the open request editor and, for a GraphQL request, its query. */
export async function fillRequestDetails(editor: FrameLocator, type: RequestKind, url: string, payload?: string): Promise<void> {
  // Ideally target it via a test-id. Classes are usually flaky
  const urlInput = editor.locator('.CodeMirror-lines').first();
  // Not empty when the collection has a request-URL preset: new requests start with that URL.
  await clearField(urlInput);
  await urlInput.pressSequentially(url);

  if (type === 'GraphQL' && payload) {
    // A new GraphQL request opens on the Query tab with an empty query. Not setCodeMirrorValue: its trailing Tab lands in the query.
    const queryEditor = buildCommonLocators(editor).graphql.queryEditor();
    await queryEditor.click();
    await queryEditor.page().keyboard.insertText(payload);
  }
}

export async function clearField(field: Locator) {
  await field.click();
  await field.press('ControlOrMeta+a');

  await field.press('Backspace');
}

/** Save the edits in the request's editor and wait for the confirmation; resolves to the same editor, still open. */
export async function saveRequestV2(page: Page, webview: FrameLocator): Promise<FrameLocator> {
  // Focus the pane first so the save shortcut reaches it.
  await webview.locator('.input-container .CodeMirror').first().click();
  await saveRequest(page);

  return webview;
}

/** Delete a saved request through its row menu and the confirm dialog; the row is gone when this resolves. */
export async function deleteRequest(sidebar: Sidebar, collectionName: string, name: string): Promise<void> {
  await sidebar.expandCollection(collectionName);
  await sidebar.deleteItem(name);
}

/** Clone a request through its row menu; the clone's row is there when this resolves. */
export async function cloneRequest(sidebar: Sidebar, collectionName: string, name: string, cloneName = `${name} copy`): Promise<void> {
  await sidebar.expandCollection(collectionName);
  await sidebar.cloneItem(name, cloneName);
}

/**
 * Export a collection as a ZIP through the real UI: collection menu → Export → Bruno Collection (ZIP) → save dialog.
 * The save dialog renders as a quick input (`files.simpleDialog.enable`). The file is saved next to the collection folder.
 * Returns each file inside the ZIP, keyed by its path in the ZIP.
 */
export async function exportCollection(page: Page, sidebar: Sidebar, ctx: Context, collectionName: string): Promise<Record<string, string>> {
  await sidebar.collectionAction(collectionName, 'export');

  const webview = await getWebviewByTitle(page, 'Export Collection');
  await webview.getByRole('heading', { name: 'Export Collection' }).waitFor({ timeout: 10_000 });

  // anti-pattern: the export options are clickable divs, not buttons, so there is no role to target
  await webview.getByText('Bruno Collection (ZIP)', { exact: true }).click();

  // Save dialog (simple dialog): replace the prefilled path with one inside the collection's location
  const exportPath = path.join(ctx.getCollection(collectionName).location, `${collectionName}.zip`);
  const saveInput = buildCommonLocators(page).workbench.quickInputBox();
  // The dialog fills in its suggested "<collection>.zip" a moment after opening; a path typed before that is overwritten.
  await expect(saveInput).toHaveValue(/\.zip$/);
  await saveInput.fill(exportPath);
  await page.keyboard.press('Enter');
  await saveInput.waitFor({ state: 'hidden', timeout: 10_000 });

  // The panel closes itself once the file is written, so its success toast can't be waited on.
  // On failure it stays open with "Failed to export collection".
  await webview.owner().waitFor({ state: 'detached', timeout: 10_000 });

  // verify the exported file on disk
  await expect.poll(() => fs.existsSync(exportPath), { message: `${exportPath} should be exported` }).toBe(true);
  const entries = new AdmZip(exportPath).getEntries().filter((entry) => !entry.isDirectory);
  return Object.fromEntries(entries.map((entry) => [entry.entryName, entry.getData().toString('utf8')]));
}

// A collection row, a folder row or any other item row (request), told apart by the row's accessible label
async function getEntityType(sidebar: Sidebar, target: string): Promise<'collection' | 'folder' | 'request'> {
  const rows = sidebar.locators;

  if (await rows.collectionName(target).count()) {
    return 'collection';
  }

  const row = rows.collectionItem(target);
  await row.waitFor();

  return (await row.getAttribute('aria-label'))?.startsWith('Folder ') ? 'folder' : 'request';
}

async function openRequestEditor(page: Page, request: string) {
  const sidebar = await openBrunoSidebar(page);

  await expect(async () => {
    await sidebar.clickItem(request);

    try {
      await expect(buildCommonLocators(activeEditor(page)).requestPane()).toBeVisible({ timeout: 3000 });
    } catch (error) {
      await runCommand(page, 'View: Close All Editors');
      throw error;
    }
  }).toPass({ timeout: 25_000 });
}

// Opens a tab of a collection, folder or request and returns which of them it is
export async function openTab(page: Page, target: string, tab: string): Promise<'collection' | 'folder' | 'request'> {
  const sidebar = await openBrunoSidebar(page);
  const itemType = await getEntityType(sidebar, target);

  if (itemType === 'collection') {
    await sidebar.openCollectionSettings(target);
    await selectPaneTab(page, '[data-testid="collection-settings"]', tab);
  } else if (itemType === 'request') {
    await openRequestEditor(page, target);
    await selectPaneTab(page, '[data-testid="request-pane"]', tab);
  } else {
    await sidebar.itemAction(target, 'settings');
    await selectPaneTab(page, '[data-testid="folder-settings"]', tab);
  }

  return itemType;
}

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
  sidebar: Sidebar,
  collectionName: string,
  options: { name: string; protoFixture: string; targetDir: string; url?: string }
): Promise<Frame> {
  const { name, protoFixture, targetDir, url = GRPC_SERVER_URL } = options;

  const protoInCollection = path.join(targetDir, protoFixture);
  fs.copyFileSync(path.resolve(__dirname, '../fixtures', protoFixture), protoInCollection);

  await createRequestByType(sidebar, collectionName, { name, url, type: 'gRPC' });
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
 * Click on a request in the sidebar to open it in the editor.
 * Returns the editor webview Frame for the opened request.
 *
 * Collections may be collapsed, so we first expand the collection by clicking
 * the chevron, then click the request item. The sidebar sends
 * `sidebar:open-request` IPC which opens a VS Code custom editor.
 */
export async function openRequest(
  page: Page,
  sidebar: Sidebar,
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
  sidebar: Sidebar,
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
  sidebar: Sidebar,
  collectionName: string,
  requestName: string
): Promise<Frame> {
  return openRequestByMarker(page, sidebar, collectionName, requestName, '[data-testid="grpc-query-url-container"]');
}


// Wait for the request editor frame — identified by the marker selector.
async function waitForFrameWithMarker(
  page: Page,
  markerSelector: string,
  timeout = 20_000
): Promise<Frame> {
  const editor = await getWebviewFrame(page, (frame) => frame.locator(markerSelector), undefined, timeout);
  await expect(editor.locator(markerSelector)).toBeVisible({ timeout: 10_000 });

  return editor;
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

  if (expectedStatus) {
    await expect(statusCode).toContainText(String(expectedStatus), { timeout: 5_000 });
  }
}






export async function pickDropdownItem(page: Page, trigger: Locator | string, label: string): Promise<void> {
  const editor = activeEditor(page);
  const item = editor.locator('.dropdown-item').filter({ hasText: label });
  await (typeof trigger === 'string' ? editor.locator(trigger) : trigger).click();
  await item.click();
}

/** Pick an auth mode by its dropdown label, e.g. 'Bearer Token', in the auth pane that is open. */
export async function selectAuthMode(page: Page, modeLabel: string): Promise<void> {
  await pickDropdownItem(page, buildCommonLocators(activeEditor(page)).auth.modeSelector(), modeLabel);
}

async function selectPaneTab(page: Page, paneSelector: string, tabName: string): Promise<void> {
  const editor = activeEditor(page);
  const pane = editor.locator(paneSelector);
  await expect(pane).toBeVisible();
  const tabs = pane.locator('.tabs').first();

  const visibleTab = tabs.getByRole('tab', { name: tabName });
  const overflowButton = tabs.locator('.more-tabs');

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

/** Close every editor, discarding unsaved changes instead of waiting on the save prompt. */
export async function closeAllEditors(page: Page): Promise<void> {
  await runCommand(page, 'View: Close All Editors');
  const savePrompt = page.locator('.monaco-dialog-box').filter({ hasText: 'Do you want to save' });

  if (await savePrompt.waitFor({ state: 'visible', timeout: 2_000 }).then(() => true, () => false)) {
    await savePrompt.getByRole('button', { name: "Don't Save" }).click();
  }

  await expect(page.locator('.tabs-container .tab')).toHaveCount(0);
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
  sidebar: Sidebar,
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

export const authModeLabels: Record<AuthMode, string> = {
  inherit: 'Inherit',
  none: 'No Auth',
  basic: 'Basic Auth',
  bearer: 'Bearer Token',
  digest: 'Digest Auth',
  ntlm: 'NTLM Auth',
  wsse: 'WSSE Auth',
  apikey: 'API Key',
  awsv4: 'AWS Sig v4',
  oauth2: 'OAuth 2.0'
};

export const editorLocators = (page: Page) => buildCommonLocators(activeEditor(page));
export const sidebarLocators = async (page: Page) => buildCommonLocators(await openBrunoSidebar(page));

// Opens a response pane tab of a request; for Timeline, also the view (Request, Response or Network) of its latest entry
export async function openResponseTab(page: Page, request: string, paneTab: ResponsePaneTab): Promise<void> {
  await openRequestEditor(page, request);
  await selectResponsePaneTab(page, paneTab.tab);

  if (paneTab.tab === 'Timeline') {
    const { timeline } = editorLocators(page);
    const timelineItem = timeline.lastItem();
    await timeline.itemHeader(timelineItem).click();
    await timeline.tab(timelineItem, paneTab.section).click();
  }
}

// Opens a request and sends it
export async function sendRequestByName(page: Page, request: string): Promise<void> {
  await openRequestEditor(page, request);
  await activeEditor(page).locator('#send-request').click();
}

async function saveItem(page: Page, itemType: 'collection' | 'folder' | 'request') {
  if (itemType === 'request') {
    await saveRequest(page);
  } else {
    const editor = activeEditor(page);
    const savedToast = editor.getByText(/Settings saved successfully/);
    await savedToast.evaluateAll((toasts) => toasts.forEach((toast) => toast.setAttribute('data-earlier-save', '')));
    await buildCommonLocators(editor).saveButton().click();
    await savedToast.and(editor.locator(':not([data-earlier-save])')).last().waitFor();
  }
}

// Picks the grant type, then fills the OAuth 2.0 fields (found by their test-ids) and the placement dropdowns.
async function setOAuth2Fields(page: Page, fields: AuthFields) {
  const editor = activeEditor(page);
  const oauth2 = buildCommonLocators(editor).oauth2;
  const field = (key: string) => oauth2.field(key).locator('.CodeMirror');

  if (fields.grantType) {
    const grantTypeLabels = {
      passwordCredentials: 'Password Credentials',
      authorizationCode: 'Authorization Code',
      implicit: 'Implicit',
      clientCredentials: 'Client Credentials'
    };
    await pickDropdownItem(page, oauth2.grantTypeSelector(), grantTypeLabels[fields.grantType]);
  }

  const values: Record<string, string | undefined> = {
    accessTokenUrl: fields.accessTokenUrl, refreshTokenUrl: fields.refreshTokenUrl, username: fields.username,
    password: fields.password, clientId: fields.clientId, clientSecret: fields.clientSecret, scope: fields.scope
  };

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) await setCodeMirrorValue(page, field(key), value);
  }

  if (fields.addCredentialsTo) {
    const addCredentialsToSelector = fields.grantType === 'passwordCredentials' ? oauth2.passwordCredentialsPlacementSelector() : oauth2.credentialsPlacementSelector();
    await pickDropdownItem(page, addCredentialsToSelector, fields.addCredentialsTo === 'requestBody' ? 'Request Body' : 'Basic Auth Header');
  }

  if (fields.addTokenTo) {
    await pickDropdownItem(page, oauth2.tokenPlacementSelector(), fields.addTokenTo === 'url' ? 'URL' : 'Header');
    await oauth2.field(fields.addTokenTo === 'url' ? 'tokenQueryKey' : 'tokenHeaderPrefix').waitFor();
  }
}

const authFieldLabels: Partial<Record<keyof AuthFields, string>> = {
  username: 'Username', password: 'Password', domain: 'Domain', token: 'Token', key: 'Key', value: 'Value',
  accessKeyId: 'Access Key ID', secretAccessKey: 'Secret Access Key', service: 'Service', region: 'Region'
};

async function fillAuthFields(page: Page, fields: AuthFields) {
  const { auth } = buildCommonLocators(activeEditor(page));
  for (const [field, value] of Object.entries(fields)) {
    const label = authFieldLabels[field as keyof AuthFields];
    if (label && value) {
      await setCodeMirrorValue(page, auth.editorByLabel(label), String(value));
    }
  }
}

export async function setAuth(page: Page, target: string, mode: AuthMode, fields: AuthFields = {}): Promise<void> {
  const itemType = await openTab(page, target, 'Auth');
  await selectAuthMode(page, authModeLabels[mode]);

  if (mode === 'oauth2') {
    await setOAuth2Fields(page, fields);
  } else {
    await fillAuthFields(page, fields);
  }

  if (mode === 'apikey' && fields.addTo) {
    const placement = buildCommonLocators(activeEditor(page)).auth.apiKeyPlacement();
    const placementLabel = fields.addTo === 'queryParams' ? 'Query Param' : 'Header';
    await pickDropdownItem(page, placement, placementLabel);
  }

  await saveItem(page, itemType);
}

async function openOAuth2Tab(page: Page, request: string) {
  await openTab(page, request, 'Auth');
  return activeEditor(page);
}

export async function getOAuth2AccessToken(page: Page, request: string, { waitForToken = true } = {}): Promise<void> {
  const editor = await openOAuth2Tab(page, request);
  const getToken = editor.getByTestId('oauth2-get-token-btn');
  await getToken.click();
  if (waitForToken) {
    await editor.getByTestId('oauth2-token-title').first().waitFor({ timeout: 15_000 });
  }
}

// Runs right after getOAuth2AccessToken, in the same open Auth tab.
export async function refreshOAuth2Token(page: Page): Promise<void> {
  const editor = activeEditor(page);
  const refresh = editor.getByTestId('oauth2-refresh-token-btn');
  await refresh.click();
  await refresh.and(editor.locator(':enabled')).waitFor({ timeout: 15_000 });
}

export async function clearOAuth2Cache(page: Page, request: string): Promise<void> {
  const editor = await openOAuth2Tab(page, request);
  const clear = editor.getByTestId('oauth2-clear-cache-btn');
  if (await clear.isVisible()) {
    await clear.scrollIntoViewIfNeeded();
    await clear.click();
  }
}

export async function setBody(page: Page, request: string, json: string): Promise<void> {
  const locators = buildCommonLocators(activeEditor(page));
  await openTab(page, request, 'Body');
  await locators.requestBody.modeSelector().click();
  await locators.requestBody.modeOption('json').click();
  await setCodeMirrorValue(page, locators.body.editor(), json);
  await saveRequest(page);
}

type TableRow = { name: string; value: string };
// Which Vars table to target: the Pre Request or the Post Response one.
type VarsPhase = 'preRequest' | 'postResponse';

// Types each row into the table's trailing empty row. Var names are plain inputs, header names are CodeMirror editors.
async function addTableRows(page: Page, table: Locator, rows: TableRow[], nameField: 'input' | 'editor') {
  const { editableTable } = buildCommonLocators(table);
  const tableRows = table.locator('tbody tr');

  for (const { name, value } of rows) {
    const emptyRow = (await tableRows.count()) - 1;

    if (nameField === 'input') {
      await editableTable.columnNameInput(emptyRow).fill(name);
    } else {
      await setCodeMirrorValue(page, editableTable.columnNameEditor(emptyRow), name);
    }

    await setCodeMirrorValue(page, editableTable.columnValueEditor(emptyRow), value);
  }
}

// e.g. setVars('folder-1', [{ name: 'token', value: 'abc' }]), or with 'postResponse' for the Post Response table
export async function setVars(page: Page, target: string, rows: { name: string; value: string; description?: string }[], phase: VarsPhase = 'preRequest'): Promise<void> {
  const itemType = await openTab(page, target, 'Vars');
  const { varsTable } = buildCommonLocators(activeEditor(page));
  await addTableRows(page, varsTable.table(itemType, phase === 'preRequest' ? 'req' : 'res'), rows, 'input');
  await saveItem(page, itemType);
}

// e.g. setHeaders('folder-1', [{ name: 'x-api-key', value: 'abc' }])
export async function setHeaders(page: Page, target: string, rows: TableRow[]): Promise<void> {
  const itemType = await openTab(page, target, 'Headers');
  const { headersTable } = buildCommonLocators(activeEditor(page));
  await addTableRows(page, headersTable(itemType), rows, 'editor');
  await saveItem(page, itemType);
}

// Edits the value of existing rows, matched by name; fails if a name has no row (add those with setVars/setHeaders).
async function updateTableRows(page: Page, table: Locator, rows: TableRow[]) {
  const { editableTable } = buildCommonLocators(table);
  await table.locator('tbody tr').first().waitFor({ timeout: 10_000 });

  // Read every existing name in one round trip.
  const names = await table.locator('[data-testid^="column-name-"]').evaluateAll((cells) => cells.map((cell) =>
    (cell.querySelector('input')?.value ?? (cell.querySelector('.CodeMirror') as any)?.CodeMirror?.getValue() ?? '').trim()));

  for (const { name, value } of rows) {
    const row = names.indexOf(name);

    if (row === -1) {
      throw new Error(`No row named "${name}" to update`);
    }

    await setCodeMirrorValue(page, editableTable.columnValueEditor(row), value);
  }
}

export async function updateVars(page: Page, target: string, rows: TableRow[], phase: VarsPhase = 'preRequest'): Promise<void> {
  const itemType = await openTab(page, target, 'Vars');
  const { varsTable } = buildCommonLocators(activeEditor(page));
  await updateTableRows(page, varsTable.table(itemType, phase === 'preRequest' ? 'req' : 'res'), rows);
  await saveItem(page, itemType);
}

export async function updateHeaders(page: Page, target: string, rows: TableRow[]): Promise<void> {
  const itemType = await openTab(page, target, 'Headers');
  const { headersTable } = buildCommonLocators(activeEditor(page));
  await updateTableRows(page, headersTable(itemType), rows);
  await saveItem(page, itemType);
}

export async function setPresets(page: Page, target: string, presets: NonNullable<CollectionSettingsConfig['presets']>): Promise<void> {
  const itemType = await openTab(page, target, 'Presets');

  if (presets.requestUrl) {
    await buildCommonLocators(activeEditor(page)).requestUrl.editor().fill(presets.requestUrl);
  }

  await saveItem(page, itemType);
}

/** Request paths ("folder/name") among an exported ZIP's entries; skips collection, folder and environment files. */
export function exportedRequestPaths(entries: string[], format: 'yml' | 'bru'): string[] {
  const nonRequestFiles = ['opencollection.yml', 'folder.yml', 'collection.bru', 'folder.bru'];

  return entries
    .filter((entry) => entry.endsWith(`.${format}`) && !entry.startsWith('environments/') && !nonRequestFiles.includes(path.posix.basename(entry)))
    .map((entry) => entry.slice(0, -`.${format}`.length));
}

/** toKeyValue([{ name: 'a', value: '1' }], ['name', 'value']) → { a: '1' } */
export function toKeyValue(entries: Record<string, string>[] = [], [key, value]: [string, string]): KeyValue<string> {
  return Object.fromEntries(entries.map((entry) => [entry[key], entry[value]]));
}

/** toRows({ a: 1 }, ['name', 'value']) → [{ name: 'a', value: '1' }] */
export function toRows<K extends string>(entries: KeyValue = {}, [key, value]: [K, K]): Record<K, string>[] {
  return Object.entries(entries).map(([k, v]) => ({ [key]: k, [value]: v.toString() }) as Record<K, string>);
}
