import * as vscode from 'vscode';
import type { GrpcRequest, HttpItemSettings, HttpRequest, ItemType, WebSocketRequest } from '@bruno-types';
import { stringifyCollection, stringifyFolder, stringifyRequest } from '@usebruno/filestore';

import { convertToBruno, getImportedCollectionName, isUnbundledCollectionRoot, readImportFile, writeCollection, IMPORT_SOURCE_LABELS, type ImportFile } from '../utils/import';
import { readCollectionZip, writeCollectionZip, type CollectionZip } from '../utils/import-zip';
import { writeCollectionConfig } from '../utils/collection-v2';
import { BrunoEditorProvider } from '../editors/bruno-editor-provider';
import { openRunnerPanel } from '../panels/runner-panel';
import type { OpenedCollections } from '../store/opened-collections';
import logsStore from '../store/logs';
import { stringifyJson } from '../utils/common';
import { closeTabsUnder, moveWithEditors } from '../utils/editor';
import { isMovable, shiftItem } from '../utils/reorder';
import { basename, dirname, doesItExist, isInside, readText, writeText, META_FILES } from '../utils/file';
import type { CollectionFormat } from '../../utils/collection';
import { sanitizeName, validateName } from '../utils/filesystem';
import { parseCollection, parseFolder, parseRequest } from '../utils/parse';
import { Entity, NativeSidebarViewProvider, CollectionRoot, findCollectionConfig } from '../views/NativeSidebarViewProvider';

/**
 * Commands behind the native sidebar tree's context menu, title bar and keybindings.
 *
 * Every file operation goes through vscode.workspace.fs so the commands work on
 * any URI scheme the tree can show, and so the provider's own file watchers pick
 * up the change; handlers never refresh the tree by hand.
 */

/** Context key that gates the Paste menu entry. */
const HAS_COPIED_ITEM_KEY = 'bruno.sidebar.hasCopiedItem';

/**
 * Bruno names request files after the request, e.g. "Get Users.bru". The
 * display name itself lives inside the file and may hold anything, so
 * characters a file name cannot carry (like "/" in "user/:id") are swapped out
 * here, as the Bruno app does.
 */
function getRequestFileUri(dir: vscode.Uri, name: string, format: CollectionFormat): vscode.Uri {
  return vscode.Uri.joinPath(dir, `${sanitizeName(name.trim())}.${format}`);
}

/** Next seq for a new item in `dir`: one past the number of requests already there. */
async function getNextSequenceNumber(dir: vscode.Uri, format: CollectionFormat): Promise<number> {
  const entries = await vscode.workspace.fs.readDirectory(dir);
  const requests = entries.filter(([name, type]) =>
    (type & vscode.FileType.File) && name.endsWith(`.${format}`) && !META_FILES[format].includes(name));
  return requests.length + 1;
}

/** "name", "name copy", "name copy 2", ... until the path is free. */
async function getUniqueUri(dir: vscode.Uri, name: string, ext: string): Promise<vscode.Uri> {
  let candidate = vscode.Uri.joinPath(dir, `${name}${ext}`);
  for (let n = 1; await doesItExist(candidate); n++) {
    candidate = vscode.Uri.joinPath(dir, `${name} copy${n > 1 ? ` ${n}` : ''}${ext}`);
  }
  return candidate;
}

/** The name is free text; only the file name derived from it has to be valid. */
function validateItemName(value: string): string | undefined {
  if (!value.trim()) {
    return 'Name cannot be empty';
  }
  if (!validateName(sanitizeName(value.trim()))) {
    return 'No valid file name can be made from this name';
  }
  return undefined;
}

/** Update the display name inside a request or folder file without changing anything else. */
async function updateNameInFile(uri: vscode.Uri, kind: 'request' | 'folder' | 'collection', name: string, format: CollectionFormat): Promise<void> {
  const content = await readText(uri);

  if (kind === 'collection') {
    // `uri` is the collection's config file: bruno.json or opencollection.yml.
    if (format === 'bru') {
      const config = JSON.parse(content) as Record<string, unknown>;
      config.name = name;
      await writeText(uri, await stringifyJson(config));
    } else {
      const { collectionRoot, brunoConfig } = parseCollection(content, { format });
      brunoConfig.name = name;
      await writeText(uri, await stringifyCollection(collectionRoot, brunoConfig, { format }));
    }
    return;
  }

  if (kind === 'request') {
    const parsed = parseRequest(content, { format });
    parsed.name = name;
    await writeText(uri, await stringifyRequest(parsed, { format }));
  } else {
    const parsed = parseFolder(content, { format }) ?? {};
    parsed.meta = { ...(parsed.meta ?? {}), name };
    await writeText(uri, await stringifyFolder(parsed, { format }));
  }
}

/** The request kinds the New Request picker offers. */
type NewRequestType = 'http' | 'graphql' | 'grpc' | 'ws';

interface NewRequestFile<Type extends ItemType, Request> {
  type: Type;
  name: string;
  seq: number;
  request: Request;
}

/** A freshly created request as handed to the filestore, discriminated on `type`. */
export type NewRequestTemplate =
  | (NewRequestFile<'http-request', HttpRequest> & { settings: HttpItemSettings })
  | (NewRequestFile<'graphql-request', HttpRequest> & { settings: HttpItemSettings })
  | NewRequestFile<'grpc-request', GrpcRequest>
  | NewRequestFile<'ws-request', WebSocketRequest>;

/**
 * The empty request Bruno creates for each kind, mirroring the webview's builders.
 * Headers always live under `request`: the filestore drops them anywhere else.
 */
function getNewRequestTemplate(type: NewRequestType, name: string, seq: number): NewRequestTemplate {
  const shared: Pick<HttpRequest, 'headers' | 'auth' | 'vars' | 'assertions'> = {
    headers: [],
    auth: { mode: 'inherit' },
    vars: { req: [], res: [] },
    assertions: []
  };
  const emptyScripts: Pick<GrpcRequest, 'script' | 'tests'> = {
    script: { req: null, res: null },
    tests: null
  };

  switch (type) {
    case 'graphql':
      return {
        type: 'graphql-request',
        name,
        seq,
        request: {
          method: 'POST',
          url: '',
          params: [],
          body: { mode: 'graphql', graphql: { query: '', variables: '' } },
          ...shared
        },
        settings: { encodeUrl: true }
      };

    case 'grpc':
      return {
        type: 'grpc-request',
        name,
        seq,
        request: {
          url: '',
          body: { mode: 'grpc', grpc: [{ name: 'message 1', content: '{}' }] },
          ...shared,
          ...emptyScripts
        }
      };

    case 'ws':
      return {
        type: 'ws-request',
        name,
        seq,
        request: {
          url: '',
          body: { mode: 'ws', ws: [{ name: 'message 1', type: 'json', content: '{}' }] },
          ...shared,
          ...emptyScripts
        }
      };

    case 'http':
      return {
        type: 'http-request',
        name,
        seq,
        request: {
          method: 'GET',
          url: '',
          params: [],
          body: {
            mode: 'none',
            json: null,
            text: null,
            xml: null,
            sparql: null,
            multipartForm: [],
            formUrlEncoded: [],
            file: []
          },
          ...shared
        },
        settings: { encodeUrl: true }
      };
  }
}

type SidebarCommands =
  | 'bruno.sidebar.refresh'
  | 'bruno.sidebar.createCollection'
  | 'bruno.sidebar.importCollection'
  | 'bruno.sidebar.search'
  | 'bruno.sidebar.clearSearch'
  | 'bruno.sidebar.openCollection'
  | 'bruno.sidebar.closeCollection'
  | 'bruno.sidebar.newRequest'
  | 'bruno.sidebar.newFolder'
  | 'bruno.sidebar.run'
  | 'bruno.sidebar.settings'
  | 'bruno.sidebar.clone'
  | 'bruno.sidebar.export'
  | 'bruno.sidebar.copy'
  | 'bruno.sidebar.paste'
  | 'bruno.sidebar.rename'
  | 'bruno.sidebar.moveUp'
  | 'bruno.sidebar.moveDown'
  | 'bruno.sidebar.delete'
  // One id per platform label; package.json shows the one matching isMac / isWindows / isLinux.
  | 'bruno.sidebar.revealInFinder'
  | 'bruno.sidebar.revealInFileExplorer'
  | 'bruno.sidebar.revealInFileManager'

type Copied = { uri: vscode.Uri; collection: CollectionRoot; type: Entity['type'] } | undefined;
type SetCopyFn = (value: Copied) => void;
type GetCopyFn = () => Copied;

export function registerSidebarCommands(
  context: vscode.ExtensionContext,
  provider: NativeSidebarViewProvider,
  treeView: vscode.TreeView<Entity>,
  openedCollections: OpenedCollections
): void {
  /** What Copy put aside; Paste reads it. One item at a time. */
  let copied: Copied;

  /** Menu clicks pass the item; keybindings pass nothing, so fall back to the selection. */
  const getTarget = (item: Entity | undefined, ...types: Entity['type'][]): Entity | undefined => {
    const candidate = item ?? treeView.selection[0];
    return candidate && types.includes(candidate.type) ? candidate : undefined;
  };

  const setCopy = (value: Copied): void => {
    copied = value;
  };

  const getCopy = (): Copied => copied;

  const register = (id: SidebarCommands, handler: (item?: Entity) => Promise<void> | void): void => {
    context.subscriptions.push(vscode.commands.registerCommand(id, async (item?: Entity) => {
      try {
        await handler(item);
      } catch (err) {
        vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
      }
    }));
  };

  register('bruno.sidebar.refresh', () => provider.refresh());

  register('bruno.sidebar.search', () => {
    handleSearch(provider, treeView);
  });

  register('bruno.sidebar.clearSearch', () => {
    applyFilter(provider, treeView, '');
  });

  register('bruno.sidebar.createCollection', async () => {
    await handleCreateCollection(provider, treeView, openedCollections);
  });

  register('bruno.sidebar.importCollection', async () => {
    await handleImportCollection(provider, treeView, openedCollections);
  });

  register('bruno.sidebar.openCollection', async () => {
    await handleOpenCollection(provider, treeView, openedCollections);
  });

  register('bruno.sidebar.closeCollection', async (item) => {
    await handleCloseCollection(item, getTarget, openedCollections);
  });

  register('bruno.sidebar.newRequest', async (item) => {
    await handleNewRequest(item, getTarget);
  });

  register('bruno.sidebar.newFolder', async (item) => {
    await handleNewFolder(item, getTarget);
  });

  register('bruno.sidebar.run', async (item) => {
    await handleRequestsRun(item, getTarget, context);
  });

  register('bruno.sidebar.settings', async (item) => {
    await handleSettings(item, getTarget);
  });

  register('bruno.sidebar.clone', async (item) => {
    await handleClone(item, getTarget, provider, treeView, openedCollections);
  });

  register('bruno.sidebar.export', async (item) => {
    await handleExport(item, getTarget);
  });

  register('bruno.sidebar.copy', async (item) => {
    await handleCopy(item, getTarget, setCopy);
  });

  register('bruno.sidebar.paste', async (item) => {
    await handlePaste(item, getTarget, setCopy, getCopy);
  });

  register('bruno.sidebar.rename', async (item) => {
    await handleRename(item, getTarget);
  });

  register('bruno.sidebar.moveUp', async (item) => {
    await handleMove(item, getTarget, 'up', provider);
  });

  register('bruno.sidebar.moveDown', async (item) => {
    await handleMove(item, getTarget, 'down', provider);
  });

  for (const id of ['bruno.sidebar.revealInFinder', 'bruno.sidebar.revealInFileExplorer', 'bruno.sidebar.revealInFileManager'] as const) {
    register(id, async (item) => {
      await handleRevealFileInOS(item, getTarget);
    });
  }

  register('bruno.sidebar.delete', async (item) => {
    await handleDelete(item, getTarget, setCopy, getCopy);
  });

  // Paste is hidden until something has been copied in this session.
  void vscode.commands.executeCommand('setContext', HAS_COPIED_ITEM_KEY, false);

  // Select the row of the request shown in the active editor, so the tree
  // follows the editor the way the webview sidebar highlighted it.
  const selectActiveRequest = async (): Promise<void> => {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    const uri = input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputText ? input.uri : undefined;

    if (!uri || !treeView.visible) {
      return;
    }

    const entity = await provider.findRequestEntity(uri);
    if (entity) {
      await treeView.reveal(entity, { select: true, focus: false });
    }
  };

  const onTabsChanged = (): void => {
    // A reveal can fail while the tree is mid-refresh; the next tab change tries again.
    void selectActiveRequest().catch((): void => undefined);
  };
  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs(onTabsChanged),
    vscode.window.tabGroups.onDidChangeTabGroups(onTabsChanged)
  );
}

type GetTargetFn = (item: Entity | undefined, ...types: Entity['type'][]) => Entity | undefined;

/**
 * Open Collection: pick folders anywhere VS Code can read and keep them in the
 * tree across sessions. The dialog and every check go through the VS Code API,
 * so this works the same on a remote host or in the browser.
 */
const SEARCH_DEBOUNCE_MS = 150;

/**
 * Filter the tree by request name as the user types. Enter keeps the filter
 * and closes the box; Escape puts back whatever filter was active before.
 * The box stays open when focus moves to the tree, so a match can be opened
 * and the search refined without starting over.
 */
function handleSearch(provider: NativeSidebarViewProvider, treeView: vscode.TreeView<Entity>): void {
  const previous = provider.filter;

  const input = vscode.window.createInputBox();
  input.placeholder = 'Search requests by name';
  input.value = previous;
  input.ignoreFocusOut = true;

  let accepted = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  input.onDidChangeValue((value) => {
    clearTimeout(timer);
    timer = setTimeout(() => applyFilter(provider, treeView, value), SEARCH_DEBOUNCE_MS);
  });

  input.onDidAccept(() => {
    accepted = true;
    input.hide();
  });

  input.onDidHide(() => {
    clearTimeout(timer);
    applyFilter(provider, treeView, accepted ? input.value : previous);
    input.dispose();
  });

  input.show();
}

/** Set the filter and say so above the tree, so that the users can see what filter is applied */
function applyFilter(provider: NativeSidebarViewProvider, treeView: vscode.TreeView<Entity>, text: string): void {
  provider.filter = text;
  treeView.message = provider.filter ? `Showing requests matching "${provider.filter}"` : undefined;
}

/**
 * Create an empty collection and show it. Same inputs as the Create Collection
 * form: a name, where to put it, and the file format. The folder is named
 * after the collection with file-unsafe characters swapped out.
 */
async function handleCreateCollection(
  provider: NativeSidebarViewProvider,
  treeView: vscode.TreeView<Entity>,
  openedCollections: OpenedCollections
): Promise<void> {
  const name = await vscode.window.showInputBox({ prompt: 'Collection name', validateInput: validateItemName });
  if (!name) {
    return;
  }

  const location = await pickCollectionLocation(provider, 'Where should the collection be created?');
  if (!location) {
    return;
  }

  const format = await pickCollectionFormat();
  if (!format) {
    return;
  }

  const collectionName = name.trim();
  const dir = vscode.Uri.joinPath(location, sanitizeName(collectionName));
  if (await doesItExist(dir) && (await vscode.workspace.fs.readDirectory(dir)).length) {
    throw new Error(`A folder named "${basename(dir)}" already exists there and is not empty`);
  }

  await vscode.workspace.fs.createDirectory(dir);
  await writeCollectionConfig(dir, collectionName, format);
  await showNewCollection(provider, treeView, openedCollections, dir);
}

/** An export that parsed, with the kind of document it holds. */
interface ExportCandidate {
  file: vscode.Uri;
  imported: ImportFile;
}

/** A Bruno collection zipped as its files; unpacked as it is, in its own format. */
interface ZipCandidate {
  file: vscode.Uri;
  zip: CollectionZip;
}

type ImportCandidate = ExportCandidate | ZipCandidate;

function isZipCandidate(candidate: ImportCandidate): candidate is ZipCandidate {
  return 'zip' in candidate;
}

function getCandidateName(candidate: ImportCandidate): string {
  return (
    isZipCandidate(candidate)
      ? candidate.zip.name
      : getImportedCollectionName(candidate.imported)
  ) ?? basename(candidate.file);
}

function getCandidateSource(candidate: ImportCandidate): string {
  return isZipCandidate(candidate) ? 'Bruno zip' : IMPORT_SOURCE_LABELS[candidate.imported.source];
}

interface ImportPickItem extends vscode.QuickPickItem {
  candidate: ImportCandidate;
}

/**
 * Import Postman, Insomnia, OpenAPI, WSDL, OpenCollection or Bruno exports, or
 * zipped Bruno collections, as new collections. The chosen files are listed
 * for review, where any can be unchecked and more added, then they share one
 * location, and the exports one format. Conversion runs here on the extension
 * host, and the files are written through workspace.fs, so the sources and the
 * destination can all be on a remote.
 */
async function handleImportCollection(
  provider: NativeSidebarViewProvider,
  treeView: vscode.TreeView<Entity>,
  openedCollections: OpenedCollections
): Promise<void> {
  const files = await pickImportFiles();
  if (!files.length) {
    return;
  }

  let candidates: ImportCandidate[];
  if (files.length === 1) {
    // One file is read on its own, so a file Bruno cannot import is an error rather than a note.
    const candidate = await readImportCandidate(files[0]);

    if (!isZipCandidate(candidate) && isUnbundledCollectionRoot(candidate.imported)) {
      const { file } = candidate;
      // Importing this would create an empty copy; the requests sit next to the file.
      const open = 'Open Collection';
      const choice = await vscode.window.showInformationMessage(
        `"${basename(file)}" is the config of a collection stored as separate files, not an export. Open that collection instead?`,
        open
      );
      if (choice === open) {
        await showNewCollection(provider, treeView, openedCollections, dirname(file));
      }
      return;
    }

    candidates = [candidate];
  } else {
    candidates = await readImportCandidates(files);
    if (!candidates.length) {
      return;
    }
  }

  const selected = await reviewImportCandidates(candidates);
  if (!selected?.length) {
    return;
  }

  /**
   * Only for openapi specs
   */
  const nonZipSelected = selected.filter((candidate): candidate is ExportCandidate => !isZipCandidate(candidate));

  let groupBy: 'tags' | 'path' | undefined;
  if (nonZipSelected.some(({ imported }) => imported.source === 'openapi')) {
    const grouping = await vscode.window.showQuickPick<vscode.QuickPickItem & { value: 'tags' | 'path' }>(
      [
        { label: 'Tags', description: 'Group requests by OpenAPI tags', value: 'tags' },
        { label: 'Paths', description: 'Group requests by URL path structure', value: 'path' }
      ],
      { placeHolder: 'How should the requests be grouped into folders?' }
    );
    if (!grouping) {
      return;
    }
    groupBy = grouping.value;
  }

  const location = await pickCollectionLocation(
    provider,
    selected.length === 1 ? 'Where should the imported collection be created?' : 'Where should the imported collections be created?'
  );
  if (!location) {
    return;
  }

  // A zip keeps the format it was written in; only converted exports need one chosen.
  const format = nonZipSelected.length ? await pickCollectionFormat() : undefined;
  if (nonZipSelected.length && !format) {
    return;
  }

  const dirs: vscode.Uri[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];
  const issues: string[] = [];

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: selected.length === 1
        ? `Importing ${getCandidateSource(selected[0])} collection`
        : `Importing ${selected.length} collections`
    },
    async (progress) => {
      for (const candidate of selected) {
        const { file } = candidate;
        progress.report({ message: basename(file) });
        try {
          if (isZipCandidate(candidate)) {
            dirs.push(await writeCollectionZip(candidate.zip, location));
            continue;
          }

          const converted = await convertToBruno(candidate.imported, { groupBy, collectionFormat: format });
          const written = await writeCollection(converted.collection, location, format);
          const { name } = converted.collection;

          dirs.push(written.dir);
          skipped.push(...written.skipped.map((request) => `${name}: ${request}`));

          // Scripts the converter could not translate, and the like. Each goes to the Bruno log for the details.
          for (const issue of converted.issues) {
            logsStore.addLog(issue.severity === 'error' ? 'error' : 'warn', [`[Import] ${name}: ${issue.path}: ${issue.message}`]);
            issues.push(issue.path);
          }
        } catch (err) {
          failed.push(`${basename(file)}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  );

  if (dirs.length > 0) {
    await showNewCollection(provider, treeView, openedCollections, ...dirs);
  }

  if (selected.length > 1) {
    vscode.window.showInformationMessage(`Imported ${dirs.length} of ${selected.length} collections`);
  }

  if (failed.length) {
    vscode.window.showErrorMessage(`${failed.length} collection(s) could not be imported: ${failed.join('; ')}`);
  }

  if (skipped.length) {
    vscode.window.showWarningMessage(
      `${skipped.length} request(s) could not be converted and were left out: ${skipped.join(', ')}`
    );
  }

  if (issues.length) {
    vscode.window.showWarningMessage(
      `Imported with ${issues.length} issue(s); see the Bruno logs for details`
    );
  }
}

async function pickImportFiles(): Promise<vscode.Uri[]> {
  return await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: true,
    openLabel: 'Import',
    title: 'Choose collections or API specs to import',
    filters: { 'Collections and API specs': ['json', 'yaml', 'yml', 'wsdl', 'zip'] }
  }) ?? [];
}

/** A zip is told by its extension, anything else is parsed as an export. */
async function readImportCandidate(file: vscode.Uri): Promise<ImportCandidate> {
  const name = basename(file);

  if (name.toLowerCase().endsWith('.zip')) {
    return { file, zip: readCollectionZip(await vscode.workspace.fs.readFile(file), name) };
  }

  return { file, imported: readImportFile(await readText(file), name) };
}

/**
 * Read a batch of files, keeping those Bruno can import. The rest are reported
 * together rather than stopping the import.
 */
async function readImportCandidates(files: vscode.Uri[]): Promise<ImportCandidate[]> {
  const candidates: ImportCandidate[] = [];
  const leftOut: string[] = [];

  for (const file of files) {
    try {
      const candidate = await readImportCandidate(file);

      if (!isZipCandidate(candidate) && isUnbundledCollectionRoot(candidate.imported)) {
        leftOut.push(`"${basename(file)}" is the config of a collection stored as separate files; use Open Collection for it`);
        continue;
      }

      candidates.push(candidate);
    } catch (err) {
      leftOut.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (leftOut.length) {
    vscode.window.showWarningMessage(`${leftOut.length} file(s) were left out. ${leftOut.join('. ')}`);
  }

  return candidates;
}

/**
 * List the files for review in a multi-select quick pick, every one checked.
 * Its "Add files" button opens the file dialog again, which is how more than
 * one file gets in where the dialog picks a single file at a time (the simple
 * dialog of remote and browser workbenches). Resolves to the checked files,
 * or undefined when dismissed.
 */
function reviewImportCandidates(initial: ImportCandidate[]): Promise<ImportCandidate[] | undefined> {
  const addFiles: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('add'), tooltip: 'Add files' };
  const candidates = [...initial];

  const picker = vscode.window.createQuickPick<ImportPickItem>();
  picker.title = 'Collections to import';
  picker.placeholder = 'Unchecked collections are left out';
  picker.canSelectMany = true;
  picker.buttons = [addFiles];

  const showItems = (checked: Set<ImportCandidate>): void => {
    picker.items = candidates.map((candidate) => ({
      label: getCandidateName(candidate),
      description: `${getCandidateSource(candidate)} · ${basename(candidate.file)}`,
      candidate
    }));
    picker.selectedItems = picker.items.filter((item) => checked.has(item.candidate));
  };

  showItems(new Set(candidates));

  return new Promise((resolve, reject) => {
    // The file dialog takes the quick input over, which hides the picker; that hide is not a dismissal.
    let addingFiles = false;

    picker.onDidTriggerButton(() => {
      addingFiles = true;
      const checked = new Set(picker.selectedItems.map((item) => item.candidate));

      void (async () => {
        const knownFiles = new Set(candidates.map(({ file }) => file.toString()));
        const files = (await pickImportFiles()).filter((file) => !knownFiles.has(file.toString()));

        for (const candidate of await readImportCandidates(files)) {
          candidates.push(candidate);
          checked.add(candidate);
        }

        showItems(checked);
        addingFiles = false;
        picker.show();
      })().catch((err: unknown) => {
        picker.dispose();
        reject(err);
      });
    });

    picker.onDidAccept(() => {
      resolve(picker.selectedItems.map((item) => item.candidate));
      picker.hide();
    });

    picker.onDidHide(() => {
      if (!addingFiles) {
        resolve(undefined);
        picker.dispose();
      }
    });

    picker.show();
  });
}

/** A folder to create a collection in; refuses one inside a collection already shown, which the tree would hide. */
async function pickCollectionLocation(provider: NativeSidebarViewProvider, title: string): Promise<vscode.Uri | undefined> {
  const [location] = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Create Here',
    title,
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri
  }) ?? [];
  if (!location) {
    return undefined;
  }

  const enclosedCollection = await provider.findRootEntity(location);
  if (enclosedCollection) {
    throw new Error(`Cannot create a collection inside the collection "${enclosedCollection.label}"`);
  }

  return location;
}

async function pickCollectionFormat(): Promise<CollectionFormat | undefined> {
  const format = await vscode.window.showQuickPick<vscode.QuickPickItem & { value: CollectionFormat }>(
    [
      { label: 'OpenCollection (YAML)', description: 'Industry-standard YAML format (.yml files)', value: 'yml' },
      { label: 'BRU', description: "Bruno's native file format (.bru files)", value: 'bru' }
    ],
    { placeHolder: 'File format for the requests in this collection' }
  );
  return format?.value;
}

/** Put a collection that was just written on disk into the tree and select it. */
async function showNewCollection(
  provider: NativeSidebarViewProvider,
  treeView: vscode.TreeView<Entity>,
  openedCollections: OpenedCollections,
  ...dirs: vscode.Uri[]
): Promise<void> {
  for (const dir of dirs) {
    // Inside a workspace folder the scan finds it on its own; elsewhere it has to be remembered.
    if (!vscode.workspace.getWorkspaceFolder(dir)) {
      await openedCollections.add(dir);
    }
  }

  await revealCollection(provider, treeView, dirs[0]);
}

/** Rescan now rather than after the debounce, so the collection at `uri` is there to select. */
async function revealCollection(
  provider: NativeSidebarViewProvider,
  treeView: vscode.TreeView<Entity>,
  uri: vscode.Uri
): Promise<void> {
  provider.refresh();
  const entity = await provider.findRootEntity(uri);
  if (entity) {
    await treeView.reveal(entity, { select: true, focus: true, expand: true });
  }
}

async function handleOpenCollection(
  provider: NativeSidebarViewProvider,
  treeView: vscode.TreeView<Entity>,
  openedCollections: OpenedCollections
): Promise<void> {
  const pickedCollections = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: true,
    openLabel: 'Open Collection(s)',
    title: 'Open Bruno Collection(s)',
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri
  });

  if (!pickedCollections?.length) {
    return;
  }

  const notCollections: string[] = [];
  let lastOpened: vscode.Uri | undefined;

  for (const uri of pickedCollections) {
    if (!(await findCollectionConfig(uri))) {
      notCollections.push(basename(uri));
      continue;
    }

    const shown = await provider.findRootEntity(uri);
    if (shown?.collection.source === 'workspace') {
      vscode.window.showInformationMessage(`"${shown.label}" is already shown from the workspace`);
    } else {
      await openedCollections.add(uri);
    }
    lastOpened = uri;
  }

  if (lastOpened) {
    await revealCollection(provider, treeView, lastOpened);
  }

  if (notCollections.length) {
    vscode.window.showWarningMessage(
      `Not a Bruno collection (no bruno.json or opencollection.yml): ${notCollections.join(', ')}`
    );
  }
}

async function handleCloseCollection(item: Entity | undefined, getTarget: GetTargetFn, openedCollections: OpenedCollections): Promise<void> {
  const entity = getTarget(item, 'collection');
  // Workspace collections come from the folders VS Code has open; closing those is the Explorer's job.
  if (!entity || entity.collection.source !== 'opened') {
    return;
  }

  await openedCollections.remove(entity.uri);
}

async function handleNewRequest(item: Entity | undefined, getTarget: GetTargetFn) {
  const parent = getTarget(item, 'collection', 'folder');
  if (!parent) {
    return;
  }

  const requestTypes: (vscode.QuickPickItem & { value: NewRequestType })[] = [
    { label: 'HTTP', value: 'http' },
    { label: 'GraphQL', value: 'graphql' },
    { label: 'gRPC', value: 'grpc' },
    { label: 'WebSocket', value: 'ws' }
  ];

  const requestType = await vscode.window.showQuickPick(requestTypes, { placeHolder: 'Request type' });
  if (!requestType) {
    return;
  }

  const name = await vscode.window.showInputBox({ prompt: 'Request name', validateInput: validateItemName });
  if (!name) {
    return;
  }

  const { format } = parent.collection;
  const uri = getRequestFileUri(parent.uri, name, format);

  if (await doesItExist(uri)) {
    throw new Error(`A request file named "${basename(uri)}" already exists here`);
  }

  const template = getNewRequestTemplate(requestType.value, name.trim(), await getNextSequenceNumber(parent.uri, format));
  await writeText(uri, await stringifyRequest(template, { format }));

  await vscode.commands.executeCommand('vscode.openWith', uri, BrunoEditorProvider.viewType);
}

async function handleNewFolder(item: Entity | undefined, getTarget: GetTargetFn) {
  const parent = getTarget(item, 'collection', 'folder');
  if (!parent) {
    return;
  }

  const name = await vscode.window.showInputBox({ prompt: 'Folder name', validateInput: validateItemName });
  if (!name) {
    return;
  }

  const folderName = sanitizeName(name.trim());
  const uri = vscode.Uri.joinPath(parent.uri, folderName);

  if (await doesItExist(uri)) {
    throw new Error(`A folder named "${folderName}" already exists here`);
  }

  const { format } = parent.collection;
  await vscode.workspace.fs.createDirectory(uri);
  await writeText(
    vscode.Uri.joinPath(uri, `folder.${format}`),
    await stringifyFolder({ meta: { name: name.trim() } }, { format })
  );
}

async function handleRequestsRun(item: Entity | undefined, getTarget: GetTargetFn, context: vscode.ExtensionContext) {
  const entity = getTarget(item, 'collection', 'folder');
  if (!entity) {
    return;
  }

  if (entity.uri.scheme !== 'file') {
    throw new Error('The runner can only run collections on the local file system');
  }

  // The runner scopes by folder uid; without one it runs the whole collection.
  const folderUid = entity.type === 'folder' ? entity.uid : undefined;
  await openRunnerPanel(context, entity.collection.uri.fsPath, entity.uri.fsPath, folderUid);
}

/** Collection settings open in their panel; folder settings are the folder file in the Bruno editor. */
async function handleSettings(item: Entity | undefined, getTarget: GetTargetFn) {
  const entity = getTarget(item, 'collection', 'folder');
  if (!entity) {
    return;
  }

  if (entity.type === 'collection') {
    await vscode.commands.executeCommand('bruno.openSettings', entity.uri);
    return;
  }

  // A folder created outside Bruno has no folder file yet; the editor needs one to show.
  const { format } = entity.collection;
  const folderFile = vscode.Uri.joinPath(entity.uri, `folder.${format}`);

  if (!(await doesItExist(folderFile))) {
    await writeText(folderFile, await stringifyFolder({ meta: { name: entity.label } }, { format }));
  }

  await vscode.commands.executeCommand('vscode.openWith', folderFile, BrunoEditorProvider.viewType);
}

async function handleClone(
  item: Entity | undefined,
  getTarget: GetTargetFn,
  provider: NativeSidebarViewProvider,
  treeView: vscode.TreeView<Entity>,
  openedCollections: OpenedCollections
) {
  const entity = getTarget(item, 'collection', 'folder', 'request');
  if (!entity || (entity.type === 'collection' && !entity.collection.available)) {
    return;
  }

  const prompts: Record<Entity['type'], string> = {
    collection: 'Name for the cloned collection',
    folder: 'Name for the cloned folder',
    request: 'Name for the cloned request'
  };

  const name = await vscode.window.showInputBox({
    prompt: prompts[entity.type],
    value: `${entity.label} copy`,
    validateInput: validateItemName
  });

  if (!name) {
    return;
  }

  if (entity.type === 'collection') {
    await cloneCollection(entity, name.trim(), provider, treeView, openedCollections);
    return;
  }

  const { format } = entity.collection;
  const parent = dirname(entity.uri);

  if (entity.type === 'request') {
    const uri = getRequestFileUri(parent, name, format);
    if (await doesItExist(uri)) {
      throw new Error(`A request file named "${basename(uri)}" already exists here`);
    }

    const parsed = parseRequest(await readText(entity.uri), { format });
    parsed.name = name.trim();
    parsed.seq = await getNextSequenceNumber(parent, format);

    await writeText(uri, await stringifyRequest(parsed, { format }));
    return;
  }

  const uri = vscode.Uri.joinPath(parent, sanitizeName(name.trim()));
  if (await doesItExist(uri)) {
    throw new Error(`A folder named "${basename(uri)}" already exists here`);
  }

  await vscode.workspace.fs.copy(entity.uri, uri, { overwrite: false });

  const folderFile = vscode.Uri.joinPath(uri, `folder.${format}`);
  if (await doesItExist(folderFile)) {
    await updateNameInFile(folderFile, 'folder', name.trim(), format);
  }
}

/** Copy the collection's folder to a chosen location under `name`, rename it inside, and show it. */
async function cloneCollection(
  entity: Entity,
  name: string,
  provider: NativeSidebarViewProvider,
  treeView: vscode.TreeView<Entity>,
  openedCollections: OpenedCollections
): Promise<void> {
  const location = await pickCollectionLocation(provider, 'Where should the clone be created?');
  if (!location) {
    return;
  }

  const dir = vscode.Uri.joinPath(location, sanitizeName(name));
  if (await doesItExist(dir)) {
    throw new Error(`A folder named "${basename(dir)}" already exists there`);
  }

  await vscode.workspace.fs.copy(entity.uri, dir, { overwrite: false });

  const config = await findCollectionConfig(dir);
  if (config) {
    await updateNameInFile(config, 'collection', name, entity.collection.format);
  }

  await showNewCollection(provider, treeView, openedCollections, dir);
}

async function handleExport(item: Entity | undefined, getTarget: GetTargetFn): Promise<void> {
  const entity = getTarget(item, 'collection');
  if (!entity) {
    return;
  }

  await openCollectionPanel(entity, 'bruno.openExportCollection');
}

/**
 * The Clone and Export panels predate the native sidebar and take a collection
 * uid plus a local path, so they are only offered for collections on disk.
 */
async function openCollectionPanel(entity: Entity, command: 'bruno.openExportCollection'): Promise<void> {
  if (!entity.collection.available) {
    return;
  }
  if (entity.uri.scheme !== 'file') {
    throw new Error('This is only available for collections on the local file system');
  }

  await vscode.commands.executeCommand(command, entity.uid, entity.uri.fsPath);
}

async function handleCopy(item: Entity | undefined, getTarget: GetTargetFn, setCopy: SetCopyFn) {
  const entity = getTarget(item, 'folder', 'request');
  if (!entity) {
    return;
  }

  setCopy({ uri: entity.uri, collection: entity.collection, type: entity.type });
  await vscode.commands.executeCommand('setContext', HAS_COPIED_ITEM_KEY, true);
}

async function handlePaste(item: Entity | undefined, getTarget: GetTargetFn, setCopy: SetCopyFn, getCopy: GetCopyFn) {
  const parent = getTarget(item, 'collection', 'folder');
  const copied = getCopy();

  if (!parent || !copied) {
    return;
  }

  if (!(await doesItExist(copied.uri))) {
    setCopy(undefined);
    await vscode.commands.executeCommand('setContext', HAS_COPIED_ITEM_KEY, false);
    throw new Error('The copied item no longer exists');
  }

  const sourceFormat = copied.collection.format;
  const { format } = parent.collection;
  const sourceName = basename(copied.uri);

  if (copied.type === 'folder') {
    if (sourceFormat !== format) {
      throw new Error('Folders cannot be pasted between bru and yml collections');
    }

    if (copied.uri.toString() === parent.uri.toString() || isInside(parent.uri, copied.uri)) {
      throw new Error('A folder cannot be pasted into itself');
    }

    const dest = await getUniqueUri(parent.uri, sourceName, '');
    await vscode.workspace.fs.copy(copied.uri, dest, { overwrite: false });
    return;
  }

  const stem = sourceName.slice(0, -(`.${sourceFormat}`.length));
  const dest = await getUniqueUri(parent.uri, stem, `.${format}`);

  // Re-serialise so the content always matches the destination's extension.
  const parsed = parseRequest(await readText(copied.uri), { format: sourceFormat });
  parsed.name = basename(dest).slice(0, -(`.${format}`.length));
  parsed.seq = await getNextSequenceNumber(parent.uri, format);

  await writeText(dest, await stringifyRequest(parsed, { format }));
}

async function handleRename(item: Entity | undefined, getTarget: GetTargetFn) {
  const entity = getTarget(item, 'collection', 'folder', 'request');
  if (!entity || (entity.type === 'collection' && !entity.collection.available)) {
    return;
  }

  const name = await vscode.window.showInputBox({
    prompt: 'New name',
    value: entity.label,
    validateInput: validateItemName
  });

  if (!name || name.trim() === entity.label) {
    return;
  }

  const { format } = entity.collection;

  if (entity.type === 'collection') {
    // Like the webview: the display name changes, the directory keeps its name.
    const config = await findCollectionConfig(entity.uri);
    if (!config) {
      throw new Error(`"${entity.label}" has no bruno.json or opencollection.yml`);
    }
    await updateNameInFile(config, 'collection', name.trim(), format);
    return;
  }

  const parent = dirname(entity.uri);
  const newUri = entity.type === 'request'
    ? getRequestFileUri(parent, name, format)
    : vscode.Uri.joinPath(parent, sanitizeName(name.trim()));

  const moving = newUri.toString() !== entity.uri.toString();
  if (moving && await doesItExist(newUri)) {
    throw new Error(`"${basename(newUri)}" already exists here`);
  }

  // Update the name inside the file first, then move it so open editors follow.
  if (entity.type === 'request') {
    await updateNameInFile(entity.uri, 'request', name.trim(), format);
  } else {
    const folderFile = vscode.Uri.joinPath(entity.uri, `folder.${format}`);
    if (await doesItExist(folderFile)) {
      await updateNameInFile(folderFile, 'folder', name.trim(), format);
    }
  }

  if (moving) {
    await moveWithEditors(entity.uri, newUri);
  }
}

/** Move Up / Move Down: one place among the folders, or the requests, of the same directory. */
async function handleMove(item: Entity | undefined, getTarget: GetTargetFn, direction: 'up' | 'down', provider: NativeSidebarViewProvider) {
  const entity = getTarget(item, 'folder', 'request');

  if (!entity || !isMovable(entity)) {
    return;
  }

  await vscode.window.withProgress(
    { location: { viewId: NativeSidebarViewProvider.viewType } },
    () => shiftItem(provider, entity, direction)
  );
}

async function handleRevealFileInOS(item: Entity | undefined, getTarget: GetTargetFn) {
  const entity = getTarget(item, 'collection', 'folder', 'request');

  if (!entity) {
    return;
  }

  if (entity.uri.scheme !== 'file') {
    throw new Error('This item is not on the local file system');
  }

  await vscode.commands.executeCommand('revealFileInOS', entity.uri);
}

async function handleDelete(item: Entity | undefined, getTarget: GetTargetFn, setCopy: SetCopyFn, getCopy: GetCopyFn) {
  const entity = getTarget(item, 'folder', 'request');

  if (!entity) {
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Delete "${entity.label}"?`,
    { modal: true, detail: entity.type === 'folder' ? 'The folder and everything inside it will be moved to the trash.' : 'The request will be moved to the trash.' },
    'Delete'
  );

  if (confirm !== 'Delete') {
    return;
  }

  await closeTabsUnder(entity.uri);
  await vscode.workspace.fs.delete(entity.uri, { recursive: true, useTrash: true });

  // Make sure anything deleted isn't persisted as being copied
  const copied = getCopy();
  if (copied && (copied.uri.toString() === entity.uri.toString() || isInside(copied.uri, entity.uri))) {
    setCopy(undefined);
    await vscode.commands.executeCommand('setContext', HAS_COPIED_ITEM_KEY, false);
  }
}
