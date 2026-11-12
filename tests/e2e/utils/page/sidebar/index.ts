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
export class NativeSidebar {
  readonly locators: SidebarLocators;

  constructor(readonly page: Page) {
    this.locators = {
      collectionName: (name) => this.collectionRow(name),
      collectionItem: (name) => this.itemRow(name),
      collectionItems: () => this.row(/^(Folder|.* request) /),
      folder: (name) => this.itemRow(name),
      preferencesButton: () => this.titleActionButton('Open Preferences')
    };
  }

  /** Wait for the view to show after the activity bar icon was clicked. */
  static async open(page: Page): Promise<NativeSidebar> {
    const sidebar = new NativeSidebar(page);
    // The title actions arrive with the view; with no collection yet the body is the welcome content.
    await expect(sidebar.titleActionButton('Refresh Collections')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.part.sidebar .pane-body').first()).toBeVisible({ timeout: 15_000 });

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
    return this.row(new RegExp(`^(Folder|.* request) ${escapeRegExp(name)}$`));
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
    await expect(box).toBeVisible();
    await box.fill(`Bruno: ${title}`);
    await this.pickQuickItem(title);
  }

  private quickInputBox(): Locator {
    return this.page.locator('.quick-input-widget .quick-input-box input');
  }

  private get contextMenu(): Locator {
    return this.page.locator('.context-view .monaco-menu');
  }

  /** Type into the open input box and accept it. */
  private async answerInputBox(text: string): Promise<void> {
    const box = this.quickInputBox();
    await expect(box).toBeVisible();
    await box.fill(text);
    await this.page.keyboard.press('Enter');
  }

  /** Click the quick pick entry whose text contains `label`. */
  private async pickQuickItem(label: string): Promise<void> {
    const item = this.page.locator('.quick-input-list .monaco-list-row').filter({ hasText: label }).first();
    await expect(item).toBeVisible();
    await item.click();
  }

  /**
   * Answer VS Code's simple file dialog with a path. A directory gets a trailing
   * separator, which accepts it. The box is left as it is afterwards: the
   * command may move straight on to another quick input in the same widget.
   */
  private async answerFileDialog(target: string | undefined, kind: 'file' | 'directory'): Promise<void> {
    const box = this.quickInputBox();
    await expect(box).toBeVisible();
    // The widget is reused from the previous prompt, and the dialog fills in its
    // starting folder (which ends in a separator) a moment after opening. Text typed
    // before that is taken as relative to that folder, so wait for it.
    await expect(box).toHaveValue(/[\\/]$/);

    if (target !== undefined) {
      const value = kind === 'directory' ? target + path.sep : target;
      await box.fill(value);
      await expect(box).toHaveValue(value);
    }

    await this.page.keyboard.press('Enter');
  }

  /**
   * Wait until the tree has stopped changing. The tree repaints a moment after
   * every file write, and a repaint closes an open context menu, so acting
   * on a row right after a write can lose the click.
   */
  private async settle(): Promise<void> {
    const snapshot = () => this.locators.collectionItems().evaluateAll(
      (rows) => rows.map((row) => row.getAttribute('aria-label')).join('\n')
    );

    await expect.poll(async () => {
      const before = await snapshot();
      await this.page.waitForTimeout(400);

      return before === await snapshot();
    }, { timeout: 10_000 }).toBe(true);
  }

  /**
   * Open a row's context menu and run an entry. `confirmed` checks that the
   * command took effect (an input box opened, a row went); until it passes
   * the menu is opened and clicked again, since a repaint can swallow a click.
   */
  private async clickContextMenuItem(row: Locator, title: string, confirmed?: () => Promise<void>): Promise<void> {
    await this.settle();
    const menu = this.contextMenu;

    await expect(async () => {
      await row.click({ button: 'right' });
      await expect(menu).toBeVisible({ timeout: 3_000 });
      const item = menu.getByRole('menuitem', { name: new RegExp(`^${escapeRegExp(title)}`) }).first();

      if (!(await item.isVisible())) {
        const entries = await menu.getByRole('menuitem').allInnerTexts();
        await this.page.keyboard.press('Escape');
        throw new Error(`No "${title}" in the context menu; it has: ${entries.filter(Boolean).join(', ')}`);
      }

      // A click in the first moments after the menu opens is dropped by the menu, so let it settle.
      await this.page.waitForTimeout(300);
      await item.hover();
      await item.click();
      await expect(menu).toBeHidden({ timeout: 2_000 });
      await confirmed?.();
    }).toPass({ timeout: 20_000 });
  }

  /** Select a row and leave the keyboard focus on the tree, without running the row's command. */
  private async focusRow(row: Locator): Promise<void> {
    await this.settle();
    await row.click({ button: 'right' });

    await expect(this.contextMenu).toBeVisible();

    await this.page.waitForTimeout(300);
    await this.page.keyboard.press('Escape');

    await expect(this.contextMenu).toBeHidden();
  }

  /** Position of a request or folder row among the item rows, in display order. */
  private async rowIndex(name: string): Promise<number> {
    const labels = await this.locators.collectionItems().evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label') ?? ''));

    return labels.findIndex((label) => new RegExp(`^(Folder|.* request) ${escapeRegExp(name)}$`).test(label));
  }

  private async expectQuickInput(): Promise<void> {
    await expect(this.quickInputBox()).toBeVisible({ timeout: 3_000 });
  }

  // ---- tree state -------------------------------------------------------

  private async setExpanded(row: Locator, expanded: boolean): Promise<void> {
    await expect(row).toBeVisible({ timeout: 10_000 });
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
    await this.answerInputBox(name);
    await this.answerFileDialog(location, 'directory');
    await this.pickQuickItem(FORMAT_LABELS[format]);

    await expect(this.collectionRow(name)).toBeVisible({ timeout: 15_000 });
  }

  /** Import one file into `location` and wait for its row. */
  async importCollection(filePath: string, location: string, expectedName: string, format: FileFormat): Promise<void> {
    const review = await this.openImportReview([filePath]);
    await review.submit(location, format);

    await expect(this.collectionRow(expectedName)).toBeVisible({ timeout: 20_000 });
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
        // An OpenAPI spec is asked how to group its requests before the location; other sources go straight on.
        const groupingPick = rows().filter({ hasText: /Group by/ });

        if (await groupingPick.first().isVisible().catch(() => false)) {
          await groupingPick.first().click();
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

    await expect(this.quickInputBox()).toBeHidden();
  }

  /** Clone through the collection menu; resolves to the clone's name. */
  async cloneCollection(sourceName: string, location: string, cloneSuffix: string): Promise<string> {
    const cloneName = `${sourceName}${cloneSuffix}`;

    await this.collectionAction(sourceName, 'clone');
    // The name box comes prefilled with "<source> copy".
    await this.answerInputBox(cloneName);
    await this.answerFileDialog(location, 'directory');
    await expect(this.collectionRow(cloneName)).toBeVisible({ timeout: 15_000 });

    return cloneName;
  }

  async removeCollection(name: string): Promise<void> {
    await this.collectionAction(name, 'remove');
  }

  async openCollectionSettings(name: string): Promise<Frame> {
    const row = this.collectionRow(name);

    await expect(row).toBeVisible({ timeout: 10_000 });
    // A click on the label runs the row's command, which opens the settings.
    await row.locator('.monaco-icon-label').click();

    const settings = await getWebviewFrame(this.page, (frame) => buildCommonLocators(frame).collectionSettings.container());
    await expect(buildCommonLocators(settings).collectionSettings.container()).toBeVisible({ timeout: 10_000 });

    return settings;
  }

  async openCollectionRunner(name: string): Promise<Frame> {
    await this.collectionAction(name, 'run');
    const runner = await getWebviewFrame(this.page, (frame) => buildCommonLocators(frame).runner.runCollectionButton());
    await expect(buildCommonLocators(runner).runner.runCollectionButton()).toBeVisible({ timeout: 20_000 });

    return runner;
  }

  async openPreferences(): Promise<void> {
    await this.titleAction('Open Preferences');
  }

  // ---- items ------------------------------------------------------------

  async createFolder(parentName: string, folderName: string, isCollection: boolean): Promise<void> {
    if (isCollection) {
      await this.expandCollection(parentName);
      await this.collectionAction(parentName, 'new-folder');
    } else {
      await this.itemAction(parentName, 'new-folder');
    }

    await this.answerInputBox(folderName);

    if (!isCollection) {
      await this.expandFolder(parentName);
    }

    await expect(this.itemRow(folderName)).toBeVisible({ timeout: 15_000 });
  }

  /**
   * New Request asks for the type and the name, writes the file and opens it.
   * The URL and method are then set in the editor and saved, so the result
   * matches a request created with its details up front.
   */
  async newRequest(collectionName: string, { name, type = 'HTTP', folder }: Omit<NewRequestOptions, 'url' | 'method'>): Promise<void> {
    if (folder) {
      await this.itemAction(folder, 'new-request');
    } else {
      await this.collectionAction(collectionName, 'new-request');
    }

    await this.pickQuickItem(type);
    await this.answerInputBox(name);

    await this.expandCollection(collectionName);

    if (folder) {
      await this.expandFolder(folder);
    }

    await expect(this.itemRow(name)).toBeVisible({ timeout: 15_000 });
    await expect(this.urlEditor()).toBeVisible({ timeout: 15_000 });
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
    await this.page.keyboard.type(url, { delay: 10 });
    await this.page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');

    await expect(editor.getByText('Request saved successfully').last()).toBeVisible({ timeout: 5_000 });

    if (type === 'gRPC') {
      // A typed URL makes the gRPC pane try server reflection a second later, and that attempt
      // switches the pane to reflection mode when it lands. Let it land (it reports either way)
      // before a spec changes the pane's mode itself.
      await expect(editor.getByText(/gRPC methods/).last()).toBeVisible({ timeout: 10_000 }).catch((): void => undefined);
    }
  }

  /** Expand the collection and click the request's row, which opens its editor. */
  async clickRequest(collectionName: string, requestName: string): Promise<void> {
    await this.expandCollection(collectionName);
    const row = this.itemRow(requestName);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.locator('.monaco-icon-label').click();
  }

  /** Click a visible request or folder row's label. */
  async clickItem(name: string): Promise<void> {
    const row = this.itemRow(name);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.locator('.monaco-icon-label').click();
  }

  async deleteItem(name: string): Promise<void> {
    const row = this.itemRow(name);
    await this.itemAction(name, 'delete');

    // Modal confirmation from `vscode.window.showWarningMessage(..., { modal: true }, 'Delete')`
    const dialog = this.page.locator('.monaco-dialog-box');
    await expect(dialog).toContainText(`Delete "${name}"?`);
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(dialog).toBeHidden();

    await expect(row).not.toBeVisible({ timeout: 15_000 });
  }

  /** Clone through the row menu; the clone's row is there when this resolves. */
  async cloneItem(name: string, cloneName: string): Promise<void> {
    await this.itemAction(name, 'clone');
    // The name box comes prefilled with "<name> copy".
    await this.answerInputBox(cloneName);
    await expect(this.itemRow(cloneName)).toBeVisible({ timeout: 15_000 });
  }

  /** Copy leaves nothing to see, so it goes through the keybinding, which a repaint cannot swallow. */
  async copyItem(name: string): Promise<void> {
    await this.focusRow(this.itemRow(name));
    await this.page.keyboard.press(process.platform === 'darwin' ? 'Meta+c' : 'Control+c');
  }

  async pasteIntoCollection(collectionName: string): Promise<void> {
    await this.collectionAction(collectionName, 'paste');
  }

  /**
   * Drop `itemName` onto `folderName` and wait for the move to land: the tree
   * shows the folder expanded with the item one level under it, and the row
   * in the item's old place goes once its collection has rescanned.
   */
  async dragItemIntoFolder(itemName: string, folderName: string): Promise<void> {
    const itemRow = this.itemRow(itemName);
    const folderRow = this.itemRow(folderName);
    await expect(itemRow).toBeVisible();
    await expect(folderRow).toBeVisible();
    const folderLevel = Number(await folderRow.getAttribute('aria-level'));

    await itemRow.dragTo(folderRow, { steps: 15 });

    await expect(itemRow.and(this.tree.locator(`[aria-level="${folderLevel + 1}"]`))).toHaveCount(1, { timeout: 15_000 });
    await expect(itemRow).toHaveCount(1, { timeout: 15_000 });
  }

  /**
   * Put `itemName` right above or right below `targetName`. A drop onto a
   * request puts the dragged item in front of it; everything else goes
   * through Move Up / Move Down.
   */
  async moveItemAboveOrBelow(itemName: string, targetName: string, position: 'above' | 'below'): Promise<void> {
    await this.settle();
    const from = await this.rowIndex(itemName);
    const to = await this.rowIndex(targetName);

    if (from === -1 || to === -1) {
      throw new Error(`Cannot find "${itemName}" and "${targetName}" among the sidebar rows`);
    }

    const targetIsFolder = (await this.itemRow(targetName).getAttribute('aria-label'))?.startsWith('Folder ');
    if (position === 'above' && !targetIsFolder) {
      // A drop onto a request puts the dragged item in front of it. A drop onto a
      // folder would move the item inside it, so folders are reordered below.
      await this.itemRow(itemName).dragTo(this.itemRow(targetName), { steps: 15 });
      return;
    }

    // Move Up / Move Down one place at a time until the item sits where asked.
    const action: ItemAction = position === 'above' ? 'move-up' : 'move-down';
    const steps = position === 'above' ? from - to : to - from;

    for (let step = 0; step < steps; step++) {
      const before = await this.rowIndex(itemName);
      await this.clickContextMenuItem(this.itemRow(itemName), MENU_TITLES[action], async () => {
        await expect.poll(() => this.rowIndex(itemName), { timeout: 3_000 }).toBe(position === 'above' ? before - 1 : before + 1);
      });
    }
  }
}

/** Open the Bruno sidebar from the activity bar and return its driver. */
export async function openBrunoSidebar(page: Page): Promise<Sidebar> {
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

  return NativeSidebar.open(page);
}
