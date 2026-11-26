import * as path from 'node:path';
import AdmZip from 'adm-zip';
import type { Frame, Locator, Page } from '@playwright/test';

import { createSetup, type Setup, type Workspace } from '../e2e-helper';

import { expect, test } from '../utils/fixtures';
import type { Sidebar } from '../utils/page/actions';
import {
  activeEditor,
  cloneCollection,
  cloneRequest,
  closeAllEditors,
  collapseCollection,
  collapseFolder,
  copyItem,
  createFolder,
  deleteItem,
  dragItemOnto,
  expandCollection,
  expandFolder,
  exportCollection,
  exportPostmanCollection,
  moveItem,
  moveItemAboveOrBelow,
  newTransientRequest,
  openBrunoSidebar,
  openCollectionFromDisk,
  openRequestTab,
  pasteIntoCollection,
  pasteOntoItem,
  removeCollection,
  renameCollection,
  renameItem,
  runCommand,
  saveTransientRequest,
  takeScreenshot,
} from '../utils/page/actions';
import { buildCommonLocators } from '../utils/page/locators';
import { focusContextMenuItem, type TransientRequestKind } from '../utils/page/sidebar';
import { GRPC_SERVER_URL, TEST_SERVER_LOCAL_URL, WS_SERVER_URL } from '../utils/urls';

type CollectionConfig = Exclude<Workspace['collections'][number], string>;
type RequestConfig = NonNullable<CollectionConfig['requests']>[number];

// Rows are found by name, so the two collections keep their contents apart with a prefix.
const workspace: Workspace = {
  collections: [
    {
      name: 'bru-collection',
      format: 'bru',
      folders: [
        { name: 'bru-f1', requests: [{ name: 'bru-f1-r1', url: `${TEST_SERVER_LOCAL_URL}/ping`, type: 'HTTP', method: 'GET' }] },
        { name: 'bru-f2', requests: [{ name: 'bru-f2-r1', url: `${TEST_SERVER_LOCAL_URL}/api/echo/json`, type: 'GraphQL', method: 'POST' }] },
      ],
      requests: [
        { name: 'bru-r1', url: GRPC_SERVER_URL, type: 'gRPC', method: 'GET' },
        { name: 'bru-r2', url: WS_SERVER_URL, type: 'WebSocket', method: 'GET' },
      ],
    },
    {
      name: 'yml-collection',
      format: 'yml',
      folders: [
        { name: 'yml-f1', requests: [{ name: 'yml-f1-r1', url: `${TEST_SERVER_LOCAL_URL}/ping`, type: 'HTTP', method: 'GET' }] },
        { name: 'yml-f2', requests: [{ name: 'yml-f2-r1', url: `${TEST_SERVER_LOCAL_URL}/api/echo/json`, type: 'GraphQL', method: 'POST' }] },
      ],
      requests: [
        { name: 'yml-r1', url: GRPC_SERVER_URL, type: 'gRPC', method: 'GET' },
        { name: 'yml-r2', url: WS_SERVER_URL, type: 'WebSocket', method: 'GET' },
      ],
    },
  ],
};

const SEPARATOR = '---';
const REVEAL = process.platform === 'darwin'
  ? 'Reveal in Finder'
  : process.platform === 'win32'
    ? 'Reveal in File Explorer'
    : 'Reveal in File Manager';

const TITLE_ACTIONS = [ // action-name icon-name
  'Search Requests codicon-search',
  'Create Collection codicon-file-directory-create',
  'Open Collection codicon-folder-opened',
  'Import Collection codicon-file-symlink-directory',
  'New Request codicon-add',
  'Views and More Actions... codicon-toolbar-more',
];
const TITLE_MENU = ['Refresh Collections', 'Collapse All Collections'];
const ROW_ACTIONS = ['Run', 'New Request'];
const COLLECTION_MENU = ['New Request', 'New Folder', SEPARATOR, 'Run', 'Settings', SEPARATOR, 'Clone', 'Export', 'Rename', SEPARATOR, REVEAL, SEPARATOR, 'Remove'];
const FOLDER_MENU = ['New Request', 'New Folder', SEPARATOR, 'Run', 'Settings', SEPARATOR, 'Clone', 'Copy', 'Rename', SEPARATOR, 'Move Up', 'Move Down', SEPARATOR, REVEAL, SEPARATOR, 'Delete'];
const REQUEST_MENU = ['Clone', 'Copy', 'Rename', SEPARATOR, 'Move Up', 'Move Down', SEPARATOR, REVEAL, SEPARATOR, 'Delete'];

/** One collection the setup created: its format, from the context, and what the workspace put in it. */
function getCollection(ctx: Setup['ctx'], name: string) {
  const { format } = ctx.getCollection(name);
  const config = workspace.collections.find((entry): entry is CollectionConfig => typeof entry !== 'string' && entry.name === name);

  if (!config) {
    throw new Error(`"${name}" is not in the workspace`);
  }

  return { name, format, folders: config.folders ?? [], requests: config.requests ?? [] };
}

type Collection = ReturnType<typeof getCollection>;

/** A request row's label, as the sidebar announces it. */
function getRequestLabel({ name, type, method }: RequestConfig): string {
  const kind = {
    HTTP: `HTTP ${method} request`,
    GraphQL: 'GraphQL request',
    gRPC: 'gRPC request',
    WebSocket: 'WebSocket request'
  }[type];

  return `${kind} ${name}`;
}

type Row = { label: string; level: number };

/**
 * What an import of one of the fixture files shows. Every fixture holds the same two folders with a
 * request each, plus two requests at the root, named under its own prefix; all HTTP, as every source
 * converts to. The folder requests are POSTs since a SOAP operation is nothing else.
 */
function importedCollection(prefix: string): Collection {
  const request = (name: string, method: 'GET' | 'POST', url: string): RequestConfig => (
    { name, url, type: 'HTTP', method }
  );

  return {
    name: `${prefix}-collection`,
    format: 'yml',
    folders: [
      {
        name: `${prefix}-f1`,
        requests: [
          request(`${prefix}-f1-r1`, 'POST', `${TEST_SERVER_LOCAL_URL}/api/echo/json`)
        ]
      },
      {
        name: `${prefix}-f2`,
        requests: [
          request(`${prefix}-f2-r1`, 'POST', `${TEST_SERVER_LOCAL_URL}/api/echo/json`)
        ]
      },
    ],
    requests: [
      request(`${prefix}-r1`, 'GET', `${TEST_SERVER_LOCAL_URL}/ping`),
      request(`${prefix}-r2`, 'POST', `${TEST_SERVER_LOCAL_URL}/api/echo/json`),
    ],
  };
}

/** The collection's rows as the tree shows them once everything in it is expanded: folders first, then requests. */
function expectedTree({ folders, requests }: Collection): Row[] {
  return [
    ...folders.flatMap((folder) => [
      { label: `Folder ${folder.name}`, level: 2 },
      ...(folder.requests ?? []).map((request) => (
        { label: getRequestLabel(request), level: 3 }
      )),
    ]),
    ...requests.map((request) => (
      { label: getRequestLabel(request), level: 2 }
    )),
  ];
}

// ---- workbench pieces ---------------------------------------------------------

/** What the editor in front shows. Editors stay open as they would for a user, so only the visible one counts. */
const editor = (page: Page) => buildCommonLocators(activeEditor(page));
const folderSettings = (page: Page) => activeEditor(page).getByTestId('folder-settings');

/** A click on a row's name, which runs the row's command. */
const clickLabel = (row: Locator) => row.locator('.monaco-icon-label').click();

/** The quick input widget: one shared box for prompts, pickers and the simple file dialog. */
function quickInput(page: Page) {
  const widget = page.locator('.quick-input-widget');

  return {
    widget,
    title: widget.locator('.quick-input-title'),
    message: widget.locator('.quick-input-message'),
    box: widget.locator('.quick-input-box input'),
    rows: widget.locator('.quick-input-list .monaco-list-row'),
  };
}

type Prompt = { message: string } | { title: string } | { placeholder: string };

/** Run `open`, check the prompt it brings up, which says what command ran, and cancel it. */
async function expectPrompt(page: Page, open: () => Promise<void>, prompt: Prompt): Promise<void> {
  const input = quickInput(page);
  await open();

  if ('message' in prompt) {
    // The message line ends in VS Code's own "(Press 'Enter' to confirm or 'Escape' to cancel)".
    await expect(input.message).toHaveText(new RegExp(`^${prompt.message}\\b`));
  } else if ('title' in prompt) {
    await expect(input.title).toHaveText(prompt.title);
  } else {
    await expect(input.box).toHaveAttribute('placeholder', prompt.placeholder);
  }

  await page.keyboard.press('Escape');
  await expect(input.widget).toBeHidden();
}

/** The buttons in the view's title bar. */
function titleActions(page: Page): Locator {
  return page.locator('.part.sidebar .composite.title .actions-container a.action-label');
}

/** Each button as "<label> <codicon class>". */
const describeActions = (actions: Locator) => actions.evaluateAll((items) => items.map((item) =>
  `${item.getAttribute('aria-label')} ${[...item.classList].find((c) => c.startsWith('codicon-')) ?? ''}`
));

const actionLabels = (actions: Locator) => actions.evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')));

/** Open a menu with `open` and read its entries top to bottom, separators as SEPARATOR; the menu is closed again. */
async function menuEntries(page: Page, open: () => Promise<void>): Promise<string[]> {
  const menu = page.locator('.context-view .monaco-menu');

  // A tree repaint can close a menu that just opened, so the menu is reopened until it stays.
  await expect(async () => {
    await open();
    await expect(menu).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 15_000 });

  // The label alone: a row also shows its keybinding, as in "Rename" next to "F2".
  const entries = await menu.locator('li.action-item').evaluateAll(
    (items, separator) => items.map((item) => (item.querySelector('.separator') ? separator : item.querySelector('.action-label')?.textContent?.trim() ?? '')),
    SEPARATOR
  );

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  return entries;
}

const contextMenuEntries = (page: Page, row: Locator) => menuEntries(page, () => row.click({ button: 'right' }));

/** Run an entry of the title bar's "..." menu. */
async function runTitleMenuItem(page: Page, title: string): Promise<void> {
  const menu = page.locator('.context-view .monaco-menu');

  await expect(async () => {
    await titleActions(page).last().click();

    await expect(menu).toBeVisible({ timeout: 3_000 });

    await focusContextMenuItem(page, menu, menu.getByRole('menuitem', { name: title }));
    await page.keyboard.press('Enter');

    await expect(menu).toBeHidden({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

/** The inline buttons a row shows while the pointer is over it. */
async function hoverActions(row: Locator): Promise<(string | null)[]> {
  await row.hover();

  return actionLabels(row.locator('.actions a.action-label'));
}

/** Every request and folder row shown, top to bottom, with its depth; a collection's own rows are at 2. */
function visibleRows(sidebar: Sidebar): Promise<Row[]> {
  return sidebar.locators.collectionItems().evaluateAll((rows) => rows.map((row) => ({
    label: row.getAttribute('aria-label') ?? '',
    level: Number(row.getAttribute('aria-level')),
  })));
}

/** The names of the rows whose label matches, in display order. */
async function rowOrder(sidebar: Sidebar, label: RegExp): Promise<string[]> {
  const rows = await visibleRows(sidebar);

  return rows.map((row) => row.label.match(label)?.[1]).filter((name) => name !== undefined);
}

// ---- steps --------------------------------------------------------------------

async function verifyWelcomeView(page: Page) {
  await openBrunoSidebar(page);

  const welcome = page.locator('.part.sidebar .welcome-view-content');
  await expect(welcome).toContainText('No Bruno collections were found in the open folders.');

  const buttons = welcome.getByRole('button');
  await expect(buttons).toHaveText(['Create Collection', 'Open Collection', 'Import Collection']);

  await test.step("Verify CTAs to create, open and import collection", async () => {
    // Each button runs its command; the prompt that opens says which.
    await expectPrompt(page, () => buttons.nth(0).click(), { message: 'Collection name' });
    await expectPrompt(page, () => buttons.nth(1).click(), { title: 'Open Bruno Collection(s)' });
    await expectPrompt(page, () => buttons.nth(2).click(), { title: 'Choose collections or API specs to import' });
  })


  await test.step("Verify title bar actions", async () => {
    const actions = titleActions(page);
    await expect.poll(() => describeActions(actions)).toEqual(TITLE_ACTIONS);

    await expectPrompt(page, () => actions.nth(0).click(), { placeholder: 'Search requests by name' });
    await expectPrompt(page, () => actions.nth(1).click(), { message: 'Collection name' });
    await expectPrompt(page, () => actions.nth(2).click(), { title: 'Open Bruno Collection(s)' });
    await expectPrompt(page, () => actions.nth(3).click(), { title: 'Choose collections or API specs to import' });

    // New Request asks for the kind of the unsaved request it opens.
    const picker = quickInput(page);
    await actions.nth(4).click()
      ;
    await expect(picker.box).toHaveAttribute('placeholder', 'Request type');
    await expect(picker.rows).toContainText(['HTTP', 'GraphQL', 'gRPC', 'WebSocket', 'From cURL']);

    await page.keyboard.press('Escape');
    await expect(picker.widget).toBeHidden();

    // Grouped actions hidden behind an ellipsis (...)
    expect(await menuEntries(page, () => actions.last().click())).toEqual(TITLE_MENU);
  })
}

async function verifyCollections(page: Page, location: string): Promise<Setup> {
  const setup = await createSetup(workspace, page, location);
  const { sidebar, ctx } = setup;

  await test.step("Verify collapsing of all collections", async () => {
    // Collapse All from the title menu leaves the tree as a fresh open shows it: every collection collapsed.
    await runTitleMenuItem(page, 'Collapse All Collections');

    for (const name of ctx.collections) {
      await expect(sidebar.locators.collectionName(name)).toHaveAttribute('aria-expanded', 'false');
    }

    await expect(sidebar.locators.collectionItems()).toHaveCount(0);
  })

  await test.step("Verify the tree structure", async () => {
    for (const name of ctx.collections) {
      const collection = getCollection(ctx, name);
      await expandCollection(sidebar, name);

      for (const folder of collection.folders) {
        await expandFolder(sidebar, folder.name);
      }

      await expect.poll(() => visibleRows(sidebar)).toEqual(expectedTree(collection));
      await collapseCollection(sidebar, name);
    }
  })


  const { name, folders, requests } = getCollection(ctx, ctx.collections[0]);

  await test.step("Verify collection level item actions", async () => {
    const collectionRow = sidebar.locators.collectionName(name);
    // A click on the name opens the settings and expands the collection.
    await clickLabel(collectionRow);

    await expect(editor(page).collectionSettings.container()).toBeVisible();
    await expect(collectionRow).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => hoverActions(collectionRow)).toEqual(ROW_ACTIONS);
    expect(await contextMenuEntries(page, collectionRow)).toEqual(COLLECTION_MENU);

  })

  await test.step("Verify folder level item actions", async () => {
    // A click on a folder opens its settings and expands it.
    const folderRow = sidebar.locators.folder(folders[0].name);
    await collapseFolder(sidebar, folders[0].name);
    await clickLabel(folderRow);

    await expect(folderSettings(page)).toBeVisible();
    await expect(folderRow).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => hoverActions(folderRow)).toEqual(ROW_ACTIONS);
    expect(await contextMenuEntries(page, folderRow)).toEqual(FOLDER_MENU);
  })

  await test.step("Verify request level item actions", async () => {
    // A click on a request opens its editor.
    const requestRow = sidebar.locators.collectionItem(requests[0].name);
    await clickLabel(requestRow);

    await expect(editor(page).requestPane()).toBeVisible();
    expect(await contextMenuEntries(page, requestRow)).toEqual(REQUEST_MENU);
  })

  await collapseCollection(sidebar, name);

  return setup;
}

async function verifyCollectionFunctionalities(page: Page, setup: Setup) {
  const { sidebar, ctx } = setup;

  for (const name of ctx.collections) {
    const collection = getCollection(ctx, name);
    await test.step(`${collection.format.toUpperCase()} collection`, async () => {
      const row = sidebar.locators.collectionName(name);
      await expandCollection(sidebar, name);

      await test.step("Verify creation of a new request", async () => {
        // New Request: a request in the collection root, open in the editor.
        await sidebar.newRequest(name, { name: `${name}-new`, type: 'HTTP' });
        await expect(sidebar.locators.collectionItem(`${name}-new`)).toHaveAttribute('aria-level', '2');
      })

      await test.step("Verify creation of a new folder", async () => {
        // New Folder: a folder in the collection root.
        await createFolder(sidebar, name, `${name}-new-folder`);
        await expect(sidebar.locators.folder(`${name}-new-folder`)).toHaveAttribute('aria-level', '2');
      })

      await test.step("Verify collection runner", async () => {
        // Run opens the runner for the collection.
        await sidebar.collectionAction(name, 'run');
        await expect(editor(page).runner.runCollectionButton()).toBeVisible();
      })


      await collapseCollection(sidebar, name);

      await test.step("Verify opening of collection settings from context menu", async () => {
        // Settings from the menu opens the settings and leaves the row as it was, unlike a click on the name.
        await sidebar.collectionAction(name, 'settings');
        await expect(editor(page).collectionSettings.container()).toBeVisible();
        await expect(row).toHaveAttribute('aria-expanded', 'false');
      })

      await test.step("Verify cloning", async () => {
        // Clone copies the whole collection beside the original, shown as an opened collection with the same contents.
        const cloneName = await cloneCollection(sidebar, name, ctx.getCollection(name).location);
        await expandCollection(sidebar, cloneName);

        for (const folder of collection.folders) {
          await expandFolder(sidebar, folder.name);
        }

        await expect.poll(() => visibleRows(sidebar)).toEqual(
          expect.arrayContaining(expectedTree(collection))
        );

        // Cleanup the cloned collection
        await removeCollection(sidebar, cloneName);
      })

      await test.step("Verify renaming", async () => {
        // Rename changes the name in the sidebar, and back.
        await renameCollection(sidebar, name, `${name}-renamed`);
        await expect(sidebar.locators.collectionName(`${name}-renamed`)).toBeVisible();
        await expect(row).toBeHidden();

        await renameCollection(sidebar, `${name}-renamed`, name);
        await expect(row).toBeVisible();
        await expect(sidebar.locators.collectionName(`${name}-renamed`)).toBeHidden();
      })

      await collapseCollection(sidebar, name);
    })
  }
}

async function verifyFolderFunctionalities(page: Page, setup: Setup) {
  const { sidebar, ctx } = setup;

  for (const name of ctx.collections) {
    const { folders, format } = getCollection(ctx, name);

    await test.step(`${format.toUpperCase()} collection`, async () => {
      const [f1, f2] = folders.map((folder) => folder.name);
      const f2Request = folders[1].requests![0].name;
      await expandCollection(sidebar, name);

      await test.step("Verify creation of a new request in a folder", async () => {
        // New Request in a folder: one level below it.
        await sidebar.newRequest(name, { name: `${f1}-new`, folder: f1 });
        await expect(sidebar.locators.collectionItem(`${f1}-new`)).toHaveAttribute('aria-level', '3');
      })

      await test.step("Verify creation of a new folder in a folder", async () => {
        // New Folder in a folder: one level below it.
        await createFolder(sidebar, f1, `${f1}-sub`, false);
        await expect(sidebar.locators.folder(`${f1}-sub`)).toHaveAttribute('aria-level', '3');
      })

      await test.step("Verify folder runner", async () => {
        // Run opens the runner for the folder.
        await sidebar.itemAction(f1, 'run');
        await expect(editor(page).runner.runCollectionButton()).toBeVisible();
      })

      await test.step("Verify opening of folder settings from context menu", async () => {
        // Settings opens the folder's settings.
        await sidebar.itemAction(f1, 'settings');
        await expect(folderSettings(page)).toBeVisible();
      })

      await test.step("Verify cloning and deletion", async () => {
        // Clone copies the folder and its contents beside the original. Delete takes a folder and its contents away.
        // The original stays collapsed meanwhile, so the copied request's row is the only one of its name.
        await collapseFolder(sidebar, f2);
        await sidebar.cloneItem(f2, `${f2} copy`);
        await expect(sidebar.locators.folder(`${f2} copy`)).toHaveAttribute('aria-level', '2');
        await expandFolder(sidebar, `${f2} copy`);
        await expect(sidebar.locators.collectionItem(f2Request)).toHaveAttribute('aria-level', '3');
        await deleteItem(sidebar, `${f2} copy`);
        await expect(sidebar.locators.collectionItem(f2Request)).toBeHidden();
      })

      await test.step("Verify copy and paste into the collection root", async () => {
        // Copy, then Paste into the collection root: the copy lands beside the original under a free name, contents included.
        await copyItem(sidebar, f2);
        await pasteIntoCollection(sidebar, name);
        await expect(sidebar.locators.folder(`${f2} copy`)).toHaveAttribute('aria-level', '2');
        await expandFolder(sidebar, `${f2} copy`);
        await expect(sidebar.locators.collectionItem(f2Request)).toHaveAttribute('aria-level', '3');

        // Cleanup the pasted folder
        await deleteItem(sidebar, `${f2} copy`);
      })

      await test.step("Verify renaming", async () => {
        // Rename changes the row, and back.
        await renameItem(sidebar, f2, `${f2}-renamed`);
        await expect(sidebar.locators.folder(`${f2}-renamed`)).toBeVisible();
        await expect(sidebar.locators.folder(f2)).toBeHidden();

        await renameItem(sidebar, `${f2}-renamed`, f2);
        await expect(sidebar.locators.folder(f2)).toBeVisible();
        await expect(sidebar.locators.folder(`${f2}-renamed`)).toBeHidden();
      })

      await test.step("Verify move up and move down", async () => {
        // Move Up and Move Down swap a folder with its neighbour.
        const folderOrder = () => rowOrder(sidebar, new RegExp(`^Folder (${f1}|${f2})$`));
        await moveItem(sidebar, f2, 'up');
        await expect.poll(folderOrder).toEqual([f2, f1]);

        await moveItem(sidebar, f2, 'down');
        await expect.poll(folderOrder).toEqual([f1, f2]);
      })

      // Delete, on the folders made above, so the collection is back to the workspace.
      await deleteItem(sidebar, `${f1}-sub`);
      await deleteItem(sidebar, `${name}-new-folder`);

      await collapseCollection(sidebar, name);
    })
  }
}

async function verifyRequestFunctionalities(page: Page, setup: Setup) {
  const { sidebar, ctx } = setup;

  for (const name of ctx.collections) {
    const { format, folders, requests } = getCollection(ctx, name);

    await test.step(`${format.toUpperCase()} collection`, async () => {
      const [f1] = folders.map((folder) => folder.name);
      const [r1, r2] = requests.map((request) => request.name);
      await expandCollection(sidebar, name);

      await test.step("Verify renaming", async () => {
        // Rename changes the row, and back.
        await renameItem(sidebar, r2, `${r2}-renamed`);
        await expect(sidebar.locators.collectionItem(`${r2}-renamed`)).toBeVisible();
        await expect(sidebar.locators.collectionItem(r2)).toBeHidden();

        await renameItem(sidebar, `${r2}-renamed`, r2);
        await expect(sidebar.locators.collectionItem(r2)).toBeVisible();
        await expect(sidebar.locators.collectionItem(`${r2}-renamed`)).toBeHidden();
      })

      await test.step("Verify move up and move down", async () => {
        // Move Up and Move Down swap a request with its neighbour.
        const requestOrder = () => rowOrder(sidebar, new RegExp(`^.+ request (${r1}|${r2})$`));
        await moveItem(sidebar, r2, 'up');
        await expect.poll(requestOrder).toEqual([r2, r1]);

        await moveItem(sidebar, r2, 'down');
        await expect.poll(requestOrder).toEqual([r1, r2]);
      })

      await test.step("Verify cloning and deletion", async () => {
        // Clone copies the request beside the original. Delete takes a request away.
        await cloneRequest(sidebar, name, r1);
        await deleteItem(sidebar, `${r1} copy`);
      })

      await test.step("Verify copy and paste onto a request", async () => {
        // Copy, then Paste onto a request: the copy lands beside it under a free name.
        await copyItem(sidebar, r2);
        await pasteOntoItem(sidebar, r1);
        await expect(sidebar.locators.collectionItem(`${r2} copy`)).toHaveAttribute('aria-level', '2');

        // Cleanup the pasted request
        await deleteItem(sidebar, `${r2} copy`);
      })

      await test.step("Verify paste into another collection", async () => {
        // Paste into the other collection: the request lands in its root. The tree follows the active
        // editor, so the pasted request is not opened: its original's editor could come back to the
        // front and expand the original's collection, leaving two rows of the name.
        const other = ctx.collections.find((candidate) => candidate !== name)!;
        await collapseCollection(sidebar, name);
        await expandCollection(sidebar, other);
        await pasteIntoCollection(sidebar, other);
        await expect(sidebar.locators.collectionItem(r2)).toHaveAttribute('aria-level', '2');

        // Cleanup the pasted request
        await deleteItem(sidebar, r2);
        await collapseCollection(sidebar, other);
        await expandCollection(sidebar, name);
      })

      // Delete, on the requests made earlier, so the collection is back to the workspace.
      await deleteItem(sidebar, `${name}-new`);
      await expandFolder(sidebar, f1);
      await deleteItem(sidebar, `${f1}-new`);

      await collapseCollection(sidebar, name);
    })
  }
}

async function verifyTransientRequests(page: Page, setup: Setup) {
  const { sidebar, ctx } = setup;
  const { workbench } = buildCommonLocators(page);
  const url = `${TEST_SERVER_LOCAL_URL}/api/echo/json?page=2`;

  await test.step("Verify creation of each kind of transient request", async () => {
    // New Request from the title opens an unsaved request of the kind picked, numbered on from the
    // ones still open. Each kind shows in its own pane; 'From cURL' fills an HTTP request from the command.
    const kinds: [TransientRequestKind, (pane: Frame) => Locator, string?][] = [
      ['HTTP', (pane) => pane.getByTestId('request-method').filter({ hasText: 'GET' })],
      ['GraphQL', (pane) => pane.getByTestId('graphql-request-pane')],
      ['gRPC', (pane) => buildCommonLocators(pane).grpc.queryUrlContainer()],
      ['WebSocket', (pane) => pane.getByTestId('ws-request-pane')],
      ['From cURL', (pane) => pane.getByTestId('request-method').filter({ hasText: 'POST' }), `curl -X POST '${url}' -d '{"name":"bruno"}'`],
    ];

    for (const [index, [kind, marker, curl]] of kinds.entries()) {
      const pane = await newTransientRequest(sidebar, kind, curl);

      await expect(workbench.editorTab(`Untitled ${index + 1}`)).toBeVisible();
      await expect(marker(pane)).toBeVisible();

      if (curl) {
        await expect(pane.locator('.input-container .CodeMirror').first()).toContainText(url);

        // The query is listed in the Params table, so editing that table keeps it in the URL.
        await openRequestTab(pane, 'params');
        const queryParams = buildCommonLocators(pane.getByTestId('query-params')).editableTable;
        await expect(queryParams.columnNameInput(0)).toHaveValue('page');
        await expect(queryParams.columnValueEditor(0)).toContainText('2');
      }
    }
  })

  const { name, folders } = getCollection(ctx, ctx.collections[0]);
  const f1 = folders[0].name;

  await test.step("Verify saving into the collection root", async () => {
    // Saved into a collection, the request takes the name given and a row in the collection's root;
    // the unsaved tab is replaced by the saved file's.
    await saveTransientRequest(page, sidebar, 'Untitled 1', 'saved-transient', { collectionName: name });

    await expect(workbench.editorTab('saved-transient')).toBeVisible();
    await expect(workbench.editorTab('Untitled 1')).toBeHidden();

    await expandCollection(sidebar, name);

    await expect(sidebar.locators.collectionItem('saved-transient')).toHaveAttribute('aria-level', '2');

    // Cleanup the saved request
    await deleteItem(sidebar, 'saved-transient');
  })

  await test.step("Verify saving into a nested folder", async () => {
    // With folders to choose from, the picker walks down to the one chosen, here two levels deep.
    await createFolder(sidebar, f1, `${f1}-sub`, false);
    await saveTransientRequest(page, sidebar, 'Untitled 2', 'saved-in-sub', { collectionName: name, folderPath: [f1, `${f1}-sub`] });

    await expect(workbench.editorTab('saved-in-sub')).toBeVisible();

    await expandFolder(sidebar, `${f1}-sub`);

    await expect(sidebar.locators.collectionItem('saved-in-sub')).toHaveAttribute('aria-level', '4');

    // Cleanup the folder made for the save, request included
    await deleteItem(sidebar, `${f1}-sub`);
  })

  await collapseCollection(sidebar, name);

  const closedNotice = '"Untitled 5" closed';

  await test.step("Verify restoring a closed request from its notice", async () => {
    // A closed unsaved request can be brought back from its notice for 10 seconds: Cancel restores it as it was.
    await workbench.editorTabClose('Untitled 5').click();
    await workbench.getNotificationToastByText(closedNotice).getByRole('button', { name: 'Cancel' }).click();

    await expect(workbench.editorTab('Untitled 5')).toBeVisible();
    await expect(activeEditor(page).locator('.input-container .CodeMirror').first()).toContainText(url);
  })

  await test.step("Verify the notice closes on its own", async () => {
    // Left alone, the notice is gone after the 10 seconds, from the notification center too.
    await workbench.editorTabClose('Untitled 5').click();

    await runCommand(page, 'Notifications: Show Notifications');
    const centerEntry = page.locator('.notifications-center .notification-list-item').filter({ hasText: closedNotice });

    await expect(centerEntry).toHaveCount(1);
    await expect(centerEntry).toHaveCount(0, { timeout: 15_000 });
  })

  // clear any pending notifications
  await runCommand(page, 'Notifications: Hide Notifications');
  await expect(page.locator('.notifications-center')).toBeHidden();
}

async function verifyReorder(setup: Setup) {
  const { sidebar, ctx } = setup;

  for (const name of ctx.collections) {
    const { format, folders, requests } = getCollection(ctx, name);

    await test.step(`${format.toUpperCase()} collection`, async () => {
      const [f1, f2] = folders.map((folder) => folder.name);
      const [r1, r2] = requests.map((request) => request.name);

      await expandCollection(sidebar, name);

      await test.step("Verify reordering requests by drag and drop", async () => {
        // A request dropped on a request goes in front of it; Move Down takes it back behind.
        const requestOrder = () => rowOrder(sidebar, new RegExp(`^.+ request (${r1}|${r2})$`));
        await dragItemOnto(sidebar, r2, r1);
        await expect.poll(requestOrder).toEqual([r2, r1]);

        await moveItemAboveOrBelow(sidebar, r2, r1, 'below');
        await expect.poll(requestOrder).toEqual([r1, r2]);
      })

      await test.step("Verify reordering folders by move commands", async () => {
        // Folders reorder through Move Up / Move Down only: a drop on a folder goes inside it.
        const folderOrder = () => rowOrder(sidebar, new RegExp(`^Folder (${f1}|${f2})$`));
        await moveItemAboveOrBelow(sidebar, f2, f1, 'above');
        await expect.poll(folderOrder).toEqual([f2, f1]);

        await moveItemAboveOrBelow(sidebar, f2, f1, 'below');
        await expect.poll(folderOrder).toEqual([f1, f2]);
      })

      await collapseCollection(sidebar, name);
    })
  }
}

async function verifyExport(page: Page, setup: Setup) {
  const { sidebar, ctx } = setup;

  for (const name of ctx.collections) {
    const { format, folders, requests } = getCollection(ctx, name);

    await test.step(`${format.toUpperCase()} collection`, async () => {
      await test.step("Verify export as a ZIP", async () => {
        // The ZIP holds the collection's files. The helper opens the ZIP on the test host; a remote
        // target would check it by importing it back instead.
        const exported = await exportCollection(page, sidebar, ctx, name);
        expect(Object.keys(exported)).toEqual(expect.arrayContaining([
          ...requests.map((request) => `${request.name}.${format}`),
          ...folders.flatMap((folder) => (folder.requests ?? []).map((request) => `${folder.name}/${request.name}.${format}`)),
        ]));
      })

      await test.step("Verify export as a Postman collection", async () => {
        // The Postman file carries the collection's name, its folders and its HTTP and GraphQL requests.
        // Postman has no gRPC or WebSocket items, and the exact name match is what proves none got in.
        const postman = await exportPostmanCollection(page, name);

        const names = (items: { name: string }[]) => items.map((item) => item.name).sort();
        const inPostman = (items: RequestConfig[] = []) => items.filter(({ type }) => type === 'HTTP' || type === 'GraphQL');

        expect(postman.info.name).toBe(name);
        expect(names(postman.item)).toEqual(names([...folders, ...inPostman(requests)]));

        for (const folder of folders) {
          const exported = postman.item.find((item: { name: string }) => item.name === folder.name);
          expect(names(exported.item)).toEqual(names(inPostman(folder.requests)));
        }
      })
    })
  }
}

async function verifyRemove(page: Page, setup: Setup) {
  const { sidebar, ctx } = setup;

  await test.step("Verify removal of every collection", async () => {
    // Remove takes the collection out of the sidebar; the welcome view is back once none is left.
    for (const name of ctx.collections) {
      await removeCollection(sidebar, name);
    }

    await expect(page.locator('.part.sidebar .welcome-view-content')).toContainText('No Bruno collections were found in the open folders.');
  })

  await test.step("Verify opening a removed collection from disk", async () => {
    // What was removed is still on disk: opened again, the collection is all there.
    const name = ctx.collections[0];
    const collection = getCollection(ctx, name);

    await openCollectionFromDisk(sidebar, `${ctx.getCollection(name).location}/${name}`);
    await expandCollection(sidebar, name);

    for (const folder of collection.folders) {
      await expandFolder(sidebar, folder.name);
    }

    await expect.poll(() => visibleRows(sidebar)).toEqual(expectedTree(collection));
    await removeCollection(sidebar, name);
  })
}

async function verifyImports(page: Page, location: string) {
  const zipPath = path.join(location, 'zip-collection.zip');
  const zip = new AdmZip();
  zip.addLocalFolder(path.resolve(__dirname, 'fixtures/zip-collection'), 'zip-collection');
  zip.writeZip(zipPath);

  // Every kind of file Import Collection takes.
  const fixture = (file: string) => path.resolve(__dirname, 'fixtures', file);

  const imports = [
    { source: 'Postman', file: fixture('postman-collection.json'), expected: importedCollection('pm') },
    { source: 'Insomnia', file: fixture('insomnia-collection.yml'), expected: importedCollection('in') },
    { source: 'OpenAPI', file: fixture('openapi-collection.yml'), expected: importedCollection('oa') },
    // SOAP operations live in services, so a WSDL has no requests at the root.
    { source: 'WSDL', file: fixture('wsdl-collection.wsdl'), expected: { ...importedCollection('wsdl'), requests: [] } },
    { source: 'OpenCollection', file: fixture('opencollection-collection.yml'), expected: importedCollection('oc') },
    { source: 'Bruno', file: fixture('bruno-collection.json'), expected: importedCollection('br') },
    { source: 'Bruno zip', file: zipPath, expected: importedCollection('zip') },
  ];

  const { sidebar, ctx } = await createSetup({ collections: imports.map(({ file }) => file) }, page, location);

  // Each collection is named from its file, in the order the files went in.
  expect(ctx.collections).toEqual(imports.map(({ expected }) => expected.name));

  // An import shows its collection expanded; the tree is read one collection at a time.
  await runTitleMenuItem(page, 'Collapse All Collections');
  await expect(sidebar.locators.collectionItems()).toHaveCount(0);

  for (const { source, expected } of imports) {
    await test.step(`Verify import from ${source}`, async () => {
      await expandCollection(sidebar, expected.name);

      for (const folder of expected.folders) {
        await expandFolder(sidebar, folder.name);
      }

      await expect.poll(() => visibleRows(sidebar)).toEqual(expectedTree(expected));
      await collapseCollection(sidebar, expected.name);
    })
  }

  // Cleanup the imported collections
  for (const { expected } of imports) {
    await removeCollection(sidebar, expected.name);
  }
}

// ---- test ---------------------------------------------------------------------

test('Sidebar actions: welcome view, collections, folders, requests, transient requests, reorder, export and import', async ({ workbench, tmpDir }) => {
  test.slow();

  await test.step('Welcome view', () => verifyWelcomeView(workbench));

  const setup = await test.step('Collections rendered', () => verifyCollections(workbench, tmpDir));

  await test.step('Collection functionalities', () => verifyCollectionFunctionalities(workbench, setup));
  await test.step('Folder functionalities', () => verifyFolderFunctionalities(workbench, setup));
  await test.step('Request functionalities', () => verifyRequestFunctionalities(workbench, setup));
  await test.step('Transient requests', () => verifyTransientRequests(workbench, setup));
  await test.step('Reorder', () => verifyReorder(setup));

  await test.step('Export', () => verifyExport(workbench, setup));
  await test.step('Import', () => verifyImports(workbench, tmpDir));
  await test.step('Remove', () => verifyRemove(workbench, setup));

  await closeAllEditors(workbench);
});
