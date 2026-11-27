import * as path from 'path';
import { Frame, Locator, Page, expect } from '@playwright/test';
import { buildCommonLocators } from '../locators';
import { activeEditor, getWebviewFrame } from '../webviews';

/**
 * The sidebar driver: how specs and the shared actions talk to the Bruno
 * sidebar, VS Code's tree view.
 */

export type Sidebar = NativeSidebar;
export type FileFormat = 'yml' | 'bru';
export type RequestKind = 'HTTP' | 'GraphQL' | 'WebSocket' | 'gRPC';

/** Entries of a collection row's context menu. */
export type CollectionAction =
  | 'new-request' | 'new-folder' | 'run' | 'settings' | 'clone' | 'export' | 'paste' | 'rename' | 'remove';

/** Entries of a request or folder row's context menu. */
export type ItemAction =
  | 'new-request' | 'new-folder' | 'run' | 'settings' | 'clone' | 'copy' | 'paste' | 'rename' | 'delete'
  | 'move-up' | 'move-down';

export interface NewRequestOptions {
  name: string;
  url: string;
  type?: RequestKind;
  method?: string;
  /** Folder to create the request in; left out, it goes in the collection root. */
  folder?: string;
  /** A curl command to fill the request from, through the picker's "From cURL" entry; `type` is then ignored. */
  curl?: string;
}

/**
 * Row and control locators. The keys are the ones specs already used through
 * `buildCommonLocators(sidebar).sidebar`, so existing lookups keep working.
 */
export interface SidebarLocators {
  collectionName(name: string): Locator;
  collectionItem(name: string): Locator;
  /** Every request and folder row currently shown, in display order. */
  collectionItems(): Locator;
  folder(name: string): Locator;
  preferencesButton(): Locator;
}

/**
 * The review step of Import Collection: a multi-select quick pick listing the
 * chosen files by collection name, every one checked to start with.
 */
export interface ImportReview {
  /** The rows the filter currently shows. */
  rows(): Locator;
  row(name: string): Locator;
  checkbox(name: string): Locator;
  /** Type into the filter; an empty string clears it. Checked rows stay checked while hidden. */
  filter(text: string): Promise<void>;
  /** Pick more files through the "Add files" button, one dialog each. */
  addFiles(filePaths: string[]): Promise<void>;
  /**
   * Accept the review and answer the prompts that follow: the location, then
   * the format. A zip keeps its own format, so a zip-only import asks for none.
   */
  submit(location: string, format?: FileFormat): Promise<void>;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Context-menu titles, from package.json, by action. */
const MENU_TITLES: Record<CollectionAction | ItemAction, string> = {
  'new-request': 'New Request',
  'new-folder': 'New Folder',
  run: 'Run',
  settings: 'Settings',
  clone: 'Clone',
  export: 'Export',
  copy: 'Copy',
  paste: 'Paste',
  rename: 'Rename',
  delete: 'Delete',
  remove: 'Remove',
  'move-up': 'Move Up',
  'move-down': 'Move Down'
};

/** Labels of the quick pick that asks for the collection file format. */
const FORMAT_LABELS: Record<FileFormat, string> = { yml: 'OpenCollection (YAML)', bru: 'BRU' };

/**
 * The Bruno sidebar is a VS Code tree view. Rows are tree items found by the
 * accessible label the extension gives them ("Collection X", "Folder X",
 * "HTTP GET request X"), menus are the workbench context menus, and dialogs
 * are quick inputs. The fixture turns on `files.simpleDialog.enable`,
 * `window.dialogStyle` and `window.menuStyle` custom rendering so all of them
 * live in the workbench DOM.
 */
export type TransientRequestKind = 'HTTP' | 'GraphQL' | 'gRPC' | 'WebSocket' | 'From cURL';

/** Where to save an unsaved request: a collection when several are open, and a folder path under its root. */
export interface SaveRequestOptions {
  collectionName?: string;
  folderPath?: string[];
}

type Row = { label: string; level: number };

/** Index of a request or folder row among `rows`, by its name. */
function getRowIndex(rows: Row[], name: string): number {
  return rows.findIndex(({ label }) => new RegExp(`^(Folder|App|.* request) ${escapeRegExp(name)}$`).test(label));
}

/** The index right after a row and the rows under it. */
function getBlockEndIndex(rows: Row[], start: number): number {
  let end = start + 1;

  while (end < rows.length && rows[end].level > rows[start].level) {
    end++;
  }

  return end;
}

/**
 * Where a row lands after a Move Up or Move Down: the moves swap it with its previous or
 * next sibling, each taken with the rows under it. With no sibling that way the row stays.
 */
function getLandingIndex(rows: Row[], index: number, direction: 'up' | 'down'): number {
  const { level } = rows[index];

  if (direction === 'up') {
    let sibling = index - 1;
    while (sibling >= 0 && rows[sibling].level > level) {
      sibling--;
    }

    return sibling < 0 || rows[sibling].level < level ? index : sibling;
  }

  const sibling = getBlockEndIndex(rows, index);

  return (
    sibling >= rows.length || rows[sibling].level < level
      ? index
      : index + (getBlockEndIndex(rows, sibling) - sibling)
  );
}

/**
 * Give a context menu entry the focus, by keyboard.
 */
export async function focusContextMenuItem(page: Page, menu: Locator, item: Locator): Promise<void> {
  const row = item.locator('..');

  const isFocused = async (row: Locator) => {
    return await row.evaluate(
      element => element.classList.contains('focused'),
      undefined,
      { timeout: 1_000 }
    )
  }

  for (let step = 0; step < 20 && !(await isFocused(row)); step++) {
    await page.keyboard.press('ArrowDown');
  }

  await row.and(menu.locator('.focused')).waitFor({ timeout: 1_000 });
}

export class NativeSidebar {
  readonly locators: SidebarLocators;

  constructor(readonly page: Page) {
    this.locators = {
      collectionName: (name) => this.collectionRow(name),
      collectionItem: (name) => this.itemRow(name),
      collectionItems: () => this.row(/^(Folder|App|.* request) /),
      folder: (name) => this.itemRow(name),
      preferencesButton: () => this.page.locator('.part.statusbar').getByRole('button', { name: 'Bruno Preferences' })
    };
  }

  /** Wait for the view to show after the activity bar icon was clicked. */
  static async open(page: Page): Promise<NativeSidebar> {
    const sidebar = new NativeSidebar(page);

    await sidebar.titleActionButton('Create Collection').waitFor({ timeout: 15_000 });
    await page.locator('.part.sidebar .pane-body').first().waitFor({ timeout: 15_000 });

    return sidebar;
  }

  private get tree(): Locator {
    return this.page.locator('.part.sidebar');
  }

  private row(ariaLabel: RegExp): Locator {
    return this.tree.getByRole('treeitem', { name: ariaLabel });
  }

  private collectionRow(name: string): Locator {
    return this.row(new RegExp(`^Collection ${escapeRegExp(name)}(, not found)?$`));
  }

  /** A request row ("… request <name>") or a folder row ("Folder <name>"). */
  private itemRow(name: string): Locator {
    return this.row(new RegExp(`^(Folder|App|.* request) ${escapeRegExp(name)}$`));
  }

  // ---- workbench pieces -------------------------------------------------

  private titleActionButton(title: string): Locator {
    return this.page.locator('.part.sidebar .composite.title').getByRole('button', { name: title, exact: true });
  }

  /** Click a view-title action, or run its command when the title bar has folded it away. */
  private async titleAction(title: string): Promise<void> {
    const button = this.titleActionButton(title);
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      return;
    }

    await this.page.keyboard.press('F1');

    const box = this.quickInputBox();
    await box.waitFor({ state: 'visible', timeout: 15_000 });
    await box.fill(`Bruno: ${title}`);
    await this.pickQuickItem(title);
  }

  private quickInputBox(): Locator {
    return this.page.locator('.quick-input-widget .quick-input-box input');
  }

  private get contextMenu(): Locator {
    return this.page.locator('.context-view .monaco-menu');
  }

  /**
   * Type into the input box asking `prompt` and accept it. VS Code reuses one
   * widget for every quick input, so the previous prompt's box is still on
   * screen for a moment; waiting for the prompt text keeps the answer out of it.
   */
  private async answerInputBox(prompt: string, text: string): Promise<void> {
    // The prompt is the widget's message line; the input itself carries no text to match.
    await this.page.locator('.quick-input-widget .quick-input-message').filter({ hasText: prompt }).waitFor({ timeout: 15_000 });
    await this.quickInputBox().fill(text);
    await this.page.keyboard.press('Enter');
  }

  /** Click the quick pick entry whose text contains `label`. */
  private async pickQuickItem(label: string): Promise<void> {
    const item = this.page.locator('.quick-input-list .monaco-list-row').filter({ hasText: label, visible: true }).first();
    await item.waitFor({ state: 'visible', timeout: 15_000 });
    await item.click({ timeout: 15_000 });
  }

  /**
   * Answer VS Code's simple file dialog with a path. A directory gets a trailing
   * separator, which accepts it. The box is left as it is afterwards: the
   * command may move straight on to another quick input in the same widget.
   */
  private async answerFileDialog(target: string | undefined, kind: 'file' | 'directory'): Promise<void> {
    const box = this.quickInputBox();
    await box.waitFor({ state: 'visible', timeout: 15_000 });
    // The widget is reused from the previous prompt, and the dialog fills in its
    // starting folder (which ends in a separator) a moment after opening. Text typed
    // before that is taken as relative to that folder, so wait for it.
    await expect(box).toHaveValue(/[\\/]$/);

    if (target !== undefined) {
      const value = kind === 'directory' ? target + path.sep : target;
      await box.fill(value);
      await expect(box).toHaveValue(value);

      if (kind === 'file') {
        // The dialog moves its listing to the file's folder on its own time, and Enter pressed before
        // that move is done only completes it, leaving the dialog open.
        await this.page.locator('.quick-input-list .monaco-list-row')
          .filter({ hasText: path.basename(target) })
          .first()
          .waitFor({ timeout: 10_000 });
      }
    }

    await this.page.keyboard.press('Enter');
  }

  /**
   * Open a row's context menu and run an entry. Pass `onConfirm` to run a callback post a successful click
   */
  private async clickContextMenuItem(row: Locator, title: string, onConfirm?: () => Promise<void>): Promise<void> {
    const menu = this.contextMenu;

    await expect(async () => {
      await row.click({ button: 'right' });
      await menu.waitFor({ timeout: 3_000 });
      const item = menu.getByRole('menuitem', { name: new RegExp(`^${escapeRegExp(title)}`) }).first();

      if (!(await item.isVisible())) {
        const entries = await menu.getByRole('menuitem').allInnerTexts();
        await this.page.keyboard.press('Escape');
        throw new Error(`No "${title}" in the context menu; it has: ${entries.filter(Boolean).join(', ')}`);
      }

      await focusContextMenuItem(this.page, menu, item);
      await this.page.keyboard.press('Enter');
      await menu.waitFor({ state: 'hidden', timeout: 2_000 });
      await onConfirm?.();
    }).toPass({ timeout: 20_000 });
  }

  /** Every tree row with its depth, in display order. Collection rows sit at level 1, their items below. */
  private async rows(): Promise<Row[]> {
    return this.tree.getByRole('treeitem').evaluateAll((rows) => rows.map((row) => ({
      label: row.getAttribute('aria-label') ?? '',
      level: Number(row.getAttribute('aria-level'))
    })));
  }

  /** Position of a request or folder row among the tree rows, in display order. */
  private async rowIndex(name: string): Promise<number> {
    return getRowIndex(await this.rows(), name);
  }

  private async expectQuickInput(): Promise<void> {
    await this.quickInputBox().waitFor({ state: 'visible', timeout: 3_000 });
  }

  // ---- tree state -------------------------------------------------------

  private async setExpanded(row: Locator, expanded: boolean): Promise<void> {
    await row.waitFor({ state: 'visible', timeout: 10_000 });
    // The tree can be mid-change (a new collection is revealed expanded a moment after its row
    // appears), so the state is re-read before every click rather than clicking once and waiting.
    await expect(async () => {
      if ((await row.getAttribute('aria-expanded')) !== String(expanded)) {
        // The twistie, not the label: a collection label's click opens its settings.
        await row.locator('.monaco-tl-twistie').click();
      }

      await expect(row).toHaveAttribute('aria-expanded', String(expanded), { timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
  }

  async expandCollection(name: string): Promise<void> {
    await this.setExpanded(this.collectionRow(name), true);
  }

  async collapseCollection(name: string): Promise<void> {
    await this.setExpanded(this.collectionRow(name), false);
  }

  async expandFolder(folderName: string): Promise<void> {
    await this.setExpanded(this.itemRow(folderName), true);
  }

  async collapseFolder(folderName: string): Promise<void> {
    await this.setExpanded(this.itemRow(folderName), false);
  }

  // ---- menus ------------------------------------------------------------

  /** Run an entry of a collection row's context menu. */
  async collectionAction(name: string, action: CollectionAction): Promise<void> {
    const row = this.collectionRow(name);
    const confirmed = action === 'new-request' || action === 'new-folder' || action === 'rename' || action === 'clone' ? () => this.expectQuickInput()
      : action === 'remove' ? () => expect(row).toBeHidden({ timeout: 5_000 })
        : undefined;

    await this.clickContextMenuItem(row, MENU_TITLES[action], confirmed);
  }

  /** Run an entry of a request or folder row's context menu. */
  async itemAction(name: string, action: ItemAction): Promise<void> {
    const row = this.itemRow(name);
    const confirmed = action === 'new-request' || action === 'new-folder' || action === 'rename' || action === 'clone' ? () => this.expectQuickInput()
      : action === 'delete' ? () => expect(this.page.locator('.monaco-dialog-box')).toBeVisible({ timeout: 3_000 })
        : undefined;

    await this.clickContextMenuItem(row, MENU_TITLES[action], confirmed);
  }

  // ---- collections ------------------------------------------------------

  /** Create `<location>/<name>` and wait for its row. Without a location, the folder dialog's default (the workspace) is accepted. */
  async createCollection(name: string, location: string | undefined, format: FileFormat): Promise<void> {
    await this.titleAction('Create Collection');
    await this.answerInputBox('Collection name', name);
    await this.answerFileDialog(location, 'directory');
    await this.pickQuickItem(FORMAT_LABELS[format]);

    await this.collectionRow(name).waitFor({ state: 'visible', timeout: 15_000 });
  }

  /** Import one file into `location` and wait for its row. */
  async importCollection(filePath: string, location: string, expectedName: string, format: FileFormat): Promise<void> {
    const review = await this.openImportReview([filePath]);
    await review.submit(location, format);

    await this.collectionRow(expectedName).waitFor({ state: 'visible', timeout: 20_000 });
  }

  /** Collapse every collection through the title's overflow menu */
  async collapseAll(): Promise<void> {
    const menu = this.contextMenu;
    const overflow = this.page.locator('.part.sidebar .composite.title .actions-container a.action-label').last();

    await expect(async () => {
      await overflow.click();
      await menu.waitFor({ timeout: 3_000 });
      await focusContextMenuItem(this.page, menu, menu.getByRole('menuitem', { name: 'Collapse All Collections' }));
      await this.page.keyboard.press('Enter');
      await menu.waitFor({ state: 'hidden', timeout: 2_000 });
    }).toPass({ timeout: 15_000 });

    // Collapse All applies a moment after its menu closes.
    await this.tree.locator('[role="treeitem"][aria-expanded="true"]').first().waitFor({ state: 'hidden', timeout: 10_000 });
  }

  /**
   * Import `filePath` into `location`, converted to `format`
   */
  async importFile(filePath: string, location: string, format?: FileFormat): Promise<string> {
    await this.collapseAll();

    const review = await this.openImportReview([filePath]);
    await review.submit(location, format);

    const revealed = this.tree.locator('[role="treeitem"][aria-level="1"][aria-selected="true"][aria-expanded="true"]');
    await revealed.waitFor({ timeout: 20_000 });

    return (await revealed.getAttribute('aria-label'))!.replace(/^Collection /, '');
  }

  /** Start an import with these files and stop at the review step. */
  async openImportReview(filePaths: string[]): Promise<ImportReview> {
    const widget = this.page.locator('.quick-input-widget');
    const title = widget.locator('.quick-input-title');

    const rows = () => widget.locator('.quick-input-list .monaco-list-row');
    const row = (name: string) => rows().filter({ hasText: name });

    // The simple file dialog picks one file at a time, so the rest go in through the review's button.
    const addFile = async (filePath: string): Promise<void> => {
      await widget.getByRole('button', { name: 'Add files' }).click();
      await this.answerFileDialog(filePath, 'file');
      await expect(title).toHaveText('Collections to import');
    };

    const [first, ...rest] = filePaths;

    await this.titleAction('Import Collection');
    await this.answerFileDialog(first, 'file');
    // The review shows for a single file too, because the fixture enables the simple dialog.
    await expect(title).toHaveText('Collections to import');

    for (const filePath of rest) {
      await addFile(filePath);
    }

    return {
      rows,
      row,
      checkbox: (name) => row(name).getByRole('checkbox'),
      filter: async (text) => {
        await this.quickInputBox().fill(text);
      },
      addFiles: async (paths) => {
        for (const filePath of paths) {
          await addFile(filePath);
        }
      },
      submit: async (location, format) => {
        await this.page.keyboard.press('Enter');
        // An OpenAPI spec is asked how to group its requests before the location; other sources go
        // straight to the location's dialog, which fills its box with a folder. The box is the same
        // for both, so whichever of the two it shows first says which prompt came.
        const prompt = await this.page.waitForFunction(() => {
          const input = document.querySelector<HTMLInputElement>('.quick-input-widget .quick-input-box input');

          if (input?.placeholder === 'How should the requests be grouped into folders?') {
            return 'grouping';
          }

          // A value ending in a path separator, `/` or `\`, is the folder the location dialog fills in.
          return input && /[\\/]$/.test(input.value) ? 'location' : null;
        }, undefined, { timeout: 15_000 });

        if (await prompt.jsonValue() === 'grouping') {
          await this.pickQuickItem('Tags');
        }

        await this.answerFileDialog(location, 'directory');

        if (format) {
          await this.pickQuickItem(FORMAT_LABELS[format]);
        }
      }
    };
  }

  async openCollectionFromDisk(collectionPath: string): Promise<void> {
    await this.titleAction('Open Collection');
    await this.answerFileDialog(collectionPath, 'directory');

    await this.quickInputBox().waitFor({ state: 'hidden', timeout: 15_000 });
  }

  async newTransientRequest(type: TransientRequestKind, curl?: string): Promise<Frame> {
    const before = this.page.frames();

    await this.titleAction('New Request');
    await this.pickQuickItem(type);

    if (curl) {
      await this.answerInputBox('cURL command', curl);
    }

    // Panes already open carry the same marker; the new request's is a frame that was not there before.
    const pane = await getWebviewFrame(
      this.page,
      (frame) => before.includes(frame)
        ? frame.locator('#none')
        : buildCommonLocators(frame).requestPane()
    );
    await buildCommonLocators(pane).requestPane().waitFor({ state: 'visible', timeout: 10_000 });

    return pane;
  }

  /**
   * Answer the picks that save an unsaved request: the collection when several are open,
   * the folder when the collection has any (walking down `folderPath` from the root), then the name.
   */
  async answerSaveRequest(name: string, { collectionName, folderPath = [] }: SaveRequestOptions = {}): Promise<void> {
    if (collectionName) {
      await this.pickQuickItem(collectionName);
    }

    // The folder step is skipped when there is no folder to choose, so wait for whichever shows.
    const rows = this.page.locator('.quick-input-list .monaco-list-row');
    const folderEntry = rows.filter({ hasText: 'Select this folder' }).first();
    const namePrompt = this.page.locator('.quick-input-widget .quick-input-message').filter({ hasText: 'Enter a name for the request' });

    await folderEntry.or(namePrompt).first().waitFor({ state: 'visible' });

    if (await folderEntry.isVisible()) {
      for (const folder of folderPath) {
        const label = this.page.locator('.label-name', { hasText: new RegExp(`^\\s*${escapeRegExp(folder)}\\s*$`) });
        await rows.filter({ has: label }).first().click();
        // The entry's description names the folder once the list has moved into it.
        await expect(folderEntry).toContainText(folder);
      }
      await folderEntry.click();
    }

    await this.answerInputBox('Enter a name for the request', name);
  }

  /** Clone through the collection menu; resolves to the clone's name. */
  async cloneCollection(sourceName: string, location: string, cloneSuffix: string): Promise<string> {
    const cloneName = `${sourceName}${cloneSuffix}`;

    await this.collectionAction(sourceName, 'clone');
    // The name box comes prefilled with "<source> copy".
    await this.answerInputBox('Name for the cloned collection', cloneName);
    await this.answerFileDialog(location, 'directory');
    await this.collectionRow(cloneName).waitFor({ state: 'visible', timeout: 15_000 });

    return cloneName;
  }

  async removeCollection(name: string): Promise<void> {
    await this.collectionAction(name, 'remove');
  }

  /** Rename through the collection menu; the row with the new name is there when this resolves. */
  async renameCollection(name: string, newName: string): Promise<void> {
    await this.collectionAction(name, 'rename');
    // The name box comes prefilled with the current name.
    await this.answerInputBox('New name', newName);
    await this.collectionRow(newName).waitFor({ state: 'visible', timeout: 15_000 });
  }

  async openCollectionSettings(name: string): Promise<Frame> {
    const row = this.collectionRow(name);

    await row.waitFor({ timeout: 10_000 });
    // A click on the label runs the row's command, which opens the settings.
    await row.locator('.monaco-icon-label').click();

    const settings = await getWebviewFrame(this.page, (frame) => buildCommonLocators(frame).collectionSettings.container());
    await buildCommonLocators(settings).collectionSettings.container().waitFor({ state: 'visible', timeout: 10_000 });

    return settings;
  }

  async openCollectionRunner(name: string): Promise<Frame> {
    await this.collectionAction(name, 'run');
    const runner = await getWebviewFrame(this.page, (frame) => buildCommonLocators(frame).runner.runCollectionButton());
    await buildCommonLocators(runner).runner.runCollectionButton().waitFor({ state: 'visible', timeout: 20_000 });

    return runner;
  }

  async openPreferences(): Promise<void> {
    await this.locators.preferencesButton().click();
  }

  // ---- items ------------------------------------------------------------

  async createFolder(parentName: string, folderName: string, isCollection: boolean): Promise<void> {
    if (isCollection) {
      await this.expandCollection(parentName);
      await this.collectionAction(parentName, 'new-folder');
    } else {
      await this.itemAction(parentName, 'new-folder');
    }

    await this.answerInputBox('Folder name', folderName);

    if (!isCollection) {
      await this.expandFolder(parentName);
    }

    await this.itemRow(folderName).waitFor({ state: 'visible', timeout: 15_000 });
  }

  /**
   * New Request asks for the type and the name, writes the file and opens it.
   * The URL and method are then set in the editor and saved, so the result
   * matches a request created with its details up front.
   */
  async newRequest(collectionName: string, { name, type = 'HTTP', folder, curl }: Omit<NewRequestOptions, 'url' | 'method'>): Promise<void> {
    if (folder) {
      await this.itemAction(folder, 'new-request');
    } else {
      await this.collectionAction(collectionName, 'new-request');
    }

    if (curl) {
      await this.pickQuickItem('From cURL');
      // The box may come prefilled from the clipboard; the fill replaces it.
      await this.answerInputBox('cURL command', curl);
    } else {
      await this.pickQuickItem(type);
    }
    await this.answerInputBox('Request name', name);

    await this.expandCollection(collectionName);

    if (folder) {
      await this.expandFolder(folder);
    }

    await this.itemRow(name).waitFor({ state: 'visible', timeout: 15_000 });
    await this.urlEditor().waitFor({ state: 'visible', timeout: 15_000 });
  }

  /** The URL bar of the open request pane: the first editor in it, whatever the request's kind. */
  private urlEditor(): Locator {
    return activeEditor(this.page).locator('.input-container .CodeMirror').first();
  }

  /** `newRequest`, then set the method and URL in the editor and save. The editor is left open. */
  async createRequest(collectionName: string, { name, url, type, method, folder }: NewRequestOptions): Promise<void> {
    await this.newRequest(collectionName, { name, type, folder });

    const editor = activeEditor(this.page);
    const urlEditor = this.urlEditor();

    if (method && method.toUpperCase() !== 'GET') {
      await editor.getByTestId('request-method').click();
      await editor.getByTestId(`request-method-${method.toLowerCase()}`).click();
    }

    await urlEditor.click();
    await this.page.keyboard.insertText(url);
    await this.page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');

    await editor.getByText('Request saved successfully').last().waitFor({ state: 'visible', timeout: 5_000 });

    if (type === 'gRPC') {
      // A typed URL makes the gRPC pane try server reflection a second later, and that attempt
      // switches the pane to reflection mode when it lands. Let it land (it reports either way)
      // before a spec changes the pane's mode itself.
      await editor.getByText(/gRPC methods/).last().waitFor({ state: 'visible', timeout: 10_000 }).catch((): void => undefined);
    }
  }

  /** Expand the collection and click the request's row, which opens its editor. */
  async clickRequest(collectionName: string, requestName: string): Promise<void> {
    await this.expandCollection(collectionName);
    const row = this.itemRow(requestName);
    await row.waitFor({ state: 'visible', timeout: 10_000 });
    await row.locator('.monaco-icon-label').click();
  }

  /** Click a visible request or folder row's label. */
  async clickItem(name: string): Promise<void> {
    const row = this.itemRow(name);
    await row.waitFor({ state: 'visible', timeout: 10_000 });
    await row.locator('.monaco-icon-label').click();
  }

  async deleteItem(name: string): Promise<void> {
    const row = this.itemRow(name);
    await this.itemAction(name, 'delete');

    // Modal confirmation from `vscode.window.showWarningMessage(..., { modal: true }, 'Delete')`
    const dialog = this.page.locator('.monaco-dialog-box');
    await expect(dialog).toContainText(`Delete "${name}"?`);
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 15_000 });

    await expect(row).not.toBeVisible({ timeout: 15_000 });
  }

  /** Clone a request or folder through its row menu; the clone's row is there when this resolves. */
  async cloneItem(name: string, cloneName: string): Promise<void> {
    await this.itemAction(name, 'clone');
    // The name box comes prefilled with "<name> copy". Its prompt ends in "request" or "folder".
    await this.answerInputBox('Name for the cloned', cloneName);
    await this.itemRow(cloneName).waitFor({ state: 'visible', timeout: 15_000 });
  }

  /** Rename a request or folder through its row menu. */
  async renameItem(name: string, newName: string): Promise<void> {
    await this.itemAction(name, 'rename');
    await this.answerInputBox('New name', newName);
    await this.itemRow(newName).waitFor({ state: 'visible', timeout: 15_000 });
  }

  /** Move Up / Move Down from the row's menu; resolves once the row sits where the move puts it. */
  async moveItem(name: string, direction: 'up' | 'down'): Promise<void> {
    // The row is read for its place, which a plain read does not wait for as a click would.
    await this.itemRow(name).waitFor({ state: 'visible', timeout: 10_000 });
    const rows = await this.rows();
    const index = getRowIndex(rows, name);
    if (index === -1) {
      throw new Error(`Cannot find "${name}" among the sidebar rows`);
    }
    const landing = getLandingIndex(rows, index, direction);

    await this.clickContextMenuItem(this.itemRow(name), MENU_TITLES[direction === 'up' ? 'move-up' : 'move-down'], async () => {
      await expect.poll(() => this.rowIndex(name), { timeout: 3_000 }).toBe(landing);
    });
  }

  /** Copy a request or folder from its row menu. Nothing shows for a copy but the Paste entry it adds to the menus, so that confirms it. */
  async copyItem(name: string): Promise<void> {
    const row = this.itemRow(name);

    await this.clickContextMenuItem(row, MENU_TITLES.copy, async () => {
      await row.click({ button: 'right' });
      await this.contextMenu.waitFor({ timeout: 3_000 });
      const pasted = await this.contextMenu.getByRole('menuitem', { name: /^Paste/ }).isVisible();
      await this.page.keyboard.press('Escape');
      await this.contextMenu.waitFor({ state: 'hidden', timeout: 2_000 });

      if (!pasted) {
        throw new Error(`Copying "${name}" left no Paste entry in the menu`);
      }
    });
  }

  async pasteIntoCollection(collectionName: string): Promise<void> {
    await this.collectionAction(collectionName, 'paste');
  }

  /** Paste from a request or folder row's menu: into the folder, or beside the request. */
  async pasteOntoItem(name: string): Promise<void> {
    await this.itemAction(name, 'paste');
  }

  /**
   * Drop `itemName` onto `folderName` and wait for the move to land: the tree
   * shows the folder expanded with the item one level under it, and the row
   * in the item's old place goes once its collection has rescanned.
   */
  async dragItemIntoFolder(itemName: string, folderName: string): Promise<void> {
    const itemRow = this.itemRow(itemName);
    const folderRow = this.itemRow(folderName);
    await itemRow.waitFor({ state: 'visible', timeout: 15_000 });
    await folderRow.waitFor({ state: 'visible', timeout: 15_000 });
    const folderLevel = Number(await folderRow.getAttribute('aria-level'));

    await itemRow.dragTo(folderRow, { steps: 15 });

    await expect(itemRow.and(this.tree.locator(`[aria-level="${folderLevel + 1}"]`))).toHaveCount(1, { timeout: 15_000 });
    await expect(itemRow).toHaveCount(1, { timeout: 15_000 });
  }

  /**
   * Put `itemName` right above or right below `targetName` through Move Up / Move Down,
   * one sibling at a time toward the target.
   */
  async moveItemAboveOrBelow(itemName: string, targetName: string, position: 'above' | 'below'): Promise<void> {
    await this.itemRow(itemName).waitFor({ state: 'visible', timeout: 10_000 });
    await this.itemRow(targetName).waitFor({ state: 'visible', timeout: 10_000 });

    const places = async () => {
      const rows = await this.rows();
      const item = getRowIndex(rows, itemName);
      const target = getRowIndex(rows, targetName);
      if (item === -1 || target === -1) {
        throw new Error(`Cannot find "${itemName}" and "${targetName}" among the sidebar rows`);
      }

      return { rows, item, target };
    };

    // Done once the item sits right next to the target: above, the target follows the item's rows; below, the item follows the target's.
    const isAdjacent = ({ rows, item, target }: Awaited<ReturnType<typeof places>>) =>
      position === 'above' ? getBlockEndIndex(rows, item) === target : getBlockEndIndex(rows, target) === item;

    let placed = await places();
    while (!isAdjacent(placed)) {
      const { rows, item, target } = placed;
      const direction = item < target ? 'down' : 'up';

      if (getLandingIndex(rows, item, direction) === item) {
        throw new Error(`"${itemName}" cannot be put ${position} "${targetName}": they are not under the same parent`);
      }

      await this.moveItem(itemName, direction);
      placed = await places();
    }
  }

  /**
   * Drag `itemName` onto `targetName` and resolve once it sits where the drop puts it.
   * VS Code reports only the row dropped on, so the sidebar decides the place: a request
   * dropped on a request goes in front of it, and anything dropped on a folder goes inside
   * it. A folder dropped on a request goes into that request's folder, so drop it on the
   * folder instead. For any other placement use Move Up / Move Down.
   */
  async dragItemOnto(itemName: string, targetName: string): Promise<void> {
    await this.itemRow(itemName).waitFor({ state: 'visible', timeout: 10_000 });
    await this.itemRow(targetName).waitFor({ state: 'visible', timeout: 10_000 });

    const rows = await this.rows();
    const item = getRowIndex(rows, itemName);
    const target = getRowIndex(rows, targetName);
    if (item === -1 || target === -1) {
      throw new Error(`Cannot find "${itemName}" and "${targetName}" among the sidebar rows`);
    }

    const isFolder = (index: number) => rows[index].label.startsWith('Folder ');
    if (isFolder(target)) {
      await this.dragItemIntoFolder(itemName, targetName);
      return;
    }
    if (isFolder(item)) {
      throw new Error(`A folder dropped on a request goes into that request's folder; drag "${itemName}" onto the folder instead`);
    }

    // The request takes the target's place; from above the target, its own row leaves first.
    const landing = item < target ? target - 1 : target;

    await this.itemRow(itemName).dragTo(this.itemRow(targetName), { steps: 15 });
    await expect.poll(() => this.rowIndex(itemName), { timeout: 3_000 }).toBe(landing);
  }
}

/** Open the Bruno sidebar from the activity bar and return its driver. */
export async function openBrunoSidebar(page: Page): Promise<Sidebar> {
  const brunoIcon = page.locator('.activitybar a.action-label[aria-label="Bruno"]');
  await brunoIcon.waitFor({ state: 'visible', timeout: 15_000 });

  // Clicking the active icon would collapse the sidebar, so only click when Bruno isn't shown yet.
  const sidebarTitle = buildCommonLocators(page).workbench.sidebarTitle();
  // /Bruno/i: the sidebar title contains "Bruno" in any casing
  const alreadyOpen = await sidebarTitle.isVisible() && /Bruno/i.test((await sidebarTitle.textContent()) ?? '');

  if (!alreadyOpen) {
    await brunoIcon.click();
  }

  await expect(sidebarTitle).toHaveText(/Bruno/i, { timeout: 15_000 });

  return NativeSidebar.open(page);
}
