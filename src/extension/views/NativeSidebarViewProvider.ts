import * as vscode from 'vscode';
import type { RequestMethod } from '@bruno-types';
import { generateUidBasedOnHash, sortByNameThenSequence } from '../utils/common';
import { validateSchema } from '../app/collections';
import { parseCollection, parseFolder } from '../utils/parse';
import { parseFileMeta } from '../utils/collection';
import { stripDirtyMarker } from '../utils/dirty-marker';
import { BrunoEditorProvider } from '../editors/bruno-editor-provider';
import logsStore from '../store/logs';
import { basename, dirname, doesItExist, isInside, isSameDir, normalizeDir, readText, META_FILES } from '../utils/file';
import type { CollectionFormat } from '../../utils/collection';
import type { OpenedCollections } from '../store/opened-collections';
import { startCase } from 'lodash';

export type Type = 'request' | 'folder' | 'collection';
export type RequestType = 'HTTP' | 'GRAPHQL' | 'GRPC' | 'WS';
type EntityParams =
  | [type: 'request', requestMethod: RequestMethod, requestType: RequestType]
  | [type: 'folder' | 'collection'];

export interface CollectionRoot {
  uid: string;
  name: string;
  /** Directory of the collection. Any scheme VS Code can open, not just file://. */
  uri: vscode.Uri;
  format: CollectionFormat;
  /** Names from the collection config's `ignore` list, skipped while listing children. */
  ignore: string[];
  /** Found by scanning the workspace folders, or opened explicitly by the user. */
  source: 'workspace' | 'opened';
  /** False when an opened collection's folder cannot be read right now. */
  available: boolean;
}

/** A request as the search sees it: its name, and the URIs of the directories that hold it. */
interface IndexedRequest {
  uri: string;
  name: string;
  dirs: string[];
}

/** A folder or request found inside a collection, before it becomes a tree item. */
export interface ChildEntry {
  uri: vscode.Uri;
  name: string;
  seq?: number;
  params: EntityParams;
}

/**
 * Files that mark a directory as a collection root. Order is priority: when a
 * directory has more than one, the first match wins (mirrors getCollectionConfigFile).
 */
const COLLECTION_CONFIG_FILES = ['opencollection.yml', 'opencollection.yaml', 'bruno.json'] as const;
const COLLECTION_CONFIG_GLOB = `**/{${COLLECTION_CONFIG_FILES.join(',')}}`;
const SCAN_EXCLUDE_GLOB = '**/node_modules/**';

const REFRESH_DEBOUNCE_MS = 300;

/** True only after a scan found no collections; package.json shows the welcome content on it. */
const EMPTY_CONTEXT_KEY = 'bruno.sidebar.empty';

/** True while a search filter narrows the tree; package.json shows the clear action on it. */
const FILTER_CONTEXT_KEY = 'bruno.sidebar.filtered';

/** Directories that never hold requests, regardless of the collection's ignore list. */
const ALWAYS_IGNORED_DIRS = ['node_modules', 'environments'];

const REQUEST_TYPES: Record<string, RequestType> = {
  'http-request': 'HTTP',
  'graphql-request': 'GRAPHQL',
  'grpc-request': 'GRPC',
  'ws-request': 'WS'
};

function uidFor(uri: vscode.Uri): string {
  // Local items keep the same uid the rest of the extension derives from the
  // fs path; other schemes have no fs path, so hash the full URI.
  return generateUidBasedOnHash(uri.scheme === 'file' ? uri.fsPath : uri.toString());
}

/** The config file that makes `dir` a collection root, by COLLECTION_CONFIG_FILES priority. */
export async function findCollectionConfig(dir: vscode.Uri): Promise<vscode.Uri | undefined> {
  for (const name of COLLECTION_CONFIG_FILES) {
    const candidate = vscode.Uri.joinPath(dir, name);
    if (await doesItExist(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function isCollectionConfig(uri: vscode.Uri): boolean {
  return (COLLECTION_CONFIG_FILES as readonly string[]).includes(basename(uri));
}

/**
 * The seq written in a request's meta block (bru) or info block (yml), or undefined when it has
 * none. parseFileMeta reports a missing seq as 1, which would pin the request to the top instead
 * of sorting it by name, as the full parser's result does.
 */
function readSeq(content: string, format: CollectionFormat): number | undefined {
  const block = format === 'yml'
    ? /^info:\s*\n((?:[ \t]+[^\n]*\n?)+)/m.exec(content)?.[1]
    : /meta\s*{\s*([\s\S]*?)\s*}/.exec(content)?.[1];
  const seq = block ? /^\s*seq\s*:\s*["']?(\d+)["']?\s*$/m.exec(block)?.[1] : undefined;

  return seq === undefined ? undefined : Number(seq);
}

/** False for a path readChildren never lists: under a dot entry, an always-ignored directory or the collection's ignore list. */
function isListed(uri: vscode.Uri, collection: CollectionRoot): boolean {
  if (!isInside(uri, collection.uri)) {
    return true;
  }

  const ignored = new Set([...ALWAYS_IGNORED_DIRS, ...collection.ignore]);
  const segments = uri.path.slice(normalizeDir(collection.uri).path.length + 1).split('/');

  return !segments.some((segment) => segment.startsWith('.') || ignored.has(segment));
}


export class NativeSidebarViewProvider implements vscode.TreeDataProvider<Entity>, vscode.Disposable {
  static readonly viewType = 'bruno.nativeSidebarView';
  private readonly openedCollections: OpenedCollections;
  private _onDidChangeTreeData: vscode.EventEmitter<Entity | undefined | null | void> = new vscode.EventEmitter<Entity | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<Entity | undefined | null | void> = this._onDidChangeTreeData.event;
  private collectionsPromise?: Promise<CollectionRoot[]>;
  /** Lower-cased search text; empty when the tree is unfiltered. */
  private _filter = '';
  /** URIs of every item the filter keeps: matching requests and the directories that hold them. */
  private matchesPromise?: Promise<Set<string>>;
  /** Every request in the shown collections, read once per tree change and shared by every filter text. */
  private requestIndexPromise?: Promise<IndexedRequest[]>;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private treeUpdateTimer?: ReturnType<typeof setTimeout>;
  private disposables: vscode.Disposable[] = [];
  /** Watchers inside discovered collections; replaced on every rescan. */
  private contentWatchers: vscode.Disposable[] = [];

  constructor(openedCollections: OpenedCollections) {
    // Config files decide which collections exist, so they trigger a full rescan.
    // This glob watcher only covers the workspace folders; opened collections
    // get their own watchers in watchCollectionContents.
    const configWatcher = vscode.workspace.createFileSystemWatcher(COLLECTION_CONFIG_GLOB);
    this.openedCollections = openedCollections;

    this.disposables.push(
      configWatcher,
      configWatcher.onDidCreate(() => this.scheduleRefresh()),
      configWatcher.onDidDelete(() => this.scheduleRefresh()),
      configWatcher.onDidChange(() => this.scheduleRefresh()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.scheduleRefresh()),
      this.openedCollections.onDidChange(() => this.scheduleRefresh())
    );
  }

  getTreeItem(element: Entity): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: Entity): Promise<Entity[]> {
    if (!element) {
      const collections = await this.getCollections();
      const collectionsToShow = this._filter ? await this.filterEntries(collections) : collections;
      return collectionsToShow.map((collection) => this.createRootEntity(collection));
    }

    if (element.type === 'request' || !element.collection.available) {
      return [];
    }

    const entriesFound = await this.readChildren(element.uri, element.collection);
    const entries = this._filter ? await this.filterEntries(entriesFound) : entriesFound;
    return entries.map((entry) => this.createEntity(
      entry.name,
      entry.params[0] === 'folder' ? this.folderState() : vscode.TreeItemCollapsibleState.None,
      entry.uri,
      element.collection,
      ...entry.params
    ));
  }

  /**
   * Lets TreeView.reveal walk up from any item. Folders are rebuilt from their
   * path, which is cheap and avoids holding the whole tree in memory.
   */
  async getParent(element: Entity): Promise<Entity | undefined> {
    if (element.type === 'collection') {
      return undefined;
    }
    const parentUri = dirname(element.uri);
    if (isSameDir(parentUri, element.collection.uri)) {
      return this.createRootEntity(element.collection);
    }
    const folder = await this.readFolder(parentUri, basename(parentUri), element.collection.format);
    return this.createEntity(folder.name, this.folderState(), parentUri, element.collection, 'folder');
  }

  /** The tree item for the request file at `uri`, when it sits in a shown collection; undefined otherwise. */
  async findRequestEntity(uri: vscode.Uri): Promise<Entity | undefined> {
    const root = await this.findRootEntity(uri);

    if (!root || !root.collection.available || isSameDir(uri, root.collection.uri)) {
      return undefined;
    }

    const { format } = root.collection;
    const name = basename(uri);

    if (!name.endsWith(`.${format}`) || META_FILES[format].includes(name)) {
      return undefined;
    }

    const entry = await this.readRequest(uri, name.slice(0, -(format.length + 1)), format);

    return entry && this.createEntity(entry.name, vscode.TreeItemCollapsibleState.None, uri, root.collection, ...entry.params);
  }

  /** The shown collection that is, or contains, `uri`; undefined when none does. */
  async findRootEntity(uri: vscode.Uri): Promise<Entity | undefined> {
    const collections = await this.getCollections();
    const match = collections.find((collection) => isSameDir(collection.uri, uri) || isInside(uri, collection.uri));
    return match && this.createRootEntity(match);
  }

  /** Forget the discovered collections and rebuild the whole tree. */
  refresh(): void {
    this.collectionsPromise = undefined;
    this.requestIndexPromise = undefined;
    this.matchesPromise = undefined;
    this._onDidChangeTreeData.fire();
  }

  /** The active search text, as typed by the user minus surrounding whitespace. */
  get filter(): string {
    return this._filter;
  }

  /**
   * Narrow the tree to requests whose name contains `text` (case-insensitive).
   * Collections and folders without a match are hidden;
   * those with one are expanded. Empty text shows the whole tree again.
   */
  set filter(text: string) {
    const inputText = text.trim().toLowerCase();
    if (inputText === this._filter) {
      return;
    }

    this._filter = inputText;
    this.matchesPromise = undefined;
    void vscode.commands.executeCommand('setContext', FILTER_CONTEXT_KEY, inputText.length > 0);
    this._onDidChangeTreeData.fire();
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    if (this.treeUpdateTimer) {
      clearTimeout(this.treeUpdateTimer);
    }
    this.disposeContentWatchers();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this._onDidChangeTreeData.dispose();
  }

  /** Coalesce bursts of config events (e.g. a git checkout) into a single rescan. */
  private scheduleRefresh(): void {
    // A refresh repaints everything a tree update would, so a pending one is redundant.
    if (this.treeUpdateTimer) {
      clearTimeout(this.treeUpdateTimer);
      this.treeUpdateTimer = undefined;
    }
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      this.refresh();
    }, REFRESH_DEBOUNCE_MS);
  }

  /** Repaint expanded nodes after request/folder changes without rediscovering collections. */
  private scheduleTreeUpdate(): void {
    // The coming refresh covers this update; scheduling one would only add a stale paint.
    if (this.refreshTimer) {
      return;
    }
    if (this.treeUpdateTimer) {
      clearTimeout(this.treeUpdateTimer);
    }
    this.treeUpdateTimer = setTimeout(() => {
      this.treeUpdateTimer = undefined;
      this.requestIndexPromise = undefined;
      this.matchesPromise = undefined;
      this._onDidChangeTreeData.fire();
    }, REFRESH_DEBOUNCE_MS);
  }

  /** Scan lazily on first use and cache the result until the next refresh. */
  private getCollections(): Promise<CollectionRoot[]> {
    if (!this.collectionsPromise) {
      // Runs under the view's own progress bar, like Explorer loading a folder,
      // so a slow remote scan is visible and announced rather than a blank view.
      this.collectionsPromise = Promise.resolve(vscode.window.withProgress(
        { location: { viewId: NativeSidebarViewProvider.viewType } },
        () => this.discoverCollections()
      )).then((collections) => {
        // The welcome content is gated on this key, so it waits for a finished
        // scan instead of flashing while the tree is still empty because loading.
        void vscode.commands.executeCommand('setContext', EMPTY_CONTEXT_KEY, collections.length === 0);
        return collections;
      });
    }
    return this.collectionsPromise;
  }

  private async discoverCollections(): Promise<CollectionRoot[]> {
    this.disposeContentWatchers();

    type Candidate = { dir: vscode.Uri; config: vscode.Uri; source: CollectionRoot['source'] };

    // One config file per directory, by COLLECTION_CONFIG_FILES priority. Workspace
    // candidates go in first, so a folder both scanned and opened counts as workspace.
    const configByDir = new Map<string, Candidate>();
    const consider = (candidate: Candidate): void => {
      const key = candidate.dir.toString();
      const current = configByDir.get(key);
      if (!current || this.configPriority(candidate.config) < this.configPriority(current.config)) {
        configByDir.set(key, candidate);
      }
    };

    if (vscode.workspace.workspaceFolders?.length) {
      // findFiles is async, honours files.exclude / search.exclude, and is served
      // by whichever file system provider owns the workspace's scheme.
      const configFiles = await vscode.workspace.findFiles(COLLECTION_CONFIG_GLOB, SCAN_EXCLUDE_GLOB);
      for (const config of configFiles) {
        consider({ dir: dirname(config), config, source: 'workspace' });
      }
    }

    // Opened collections may live anywhere VS Code can read, including remote hosts.
    const unavailable: vscode.Uri[] = [];
    for (const dir of this.openedCollections.list()) {
      const config = await findCollectionConfig(dir);
      if (config) {
        consider({ dir, config, source: 'opened' });
      } else {
        unavailable.push(dir);
      }
    }

    // Lexicographic order puts a parent before anything nested under it, so a
    // single pass is enough to drop collections that live inside another one.
    const roots: Candidate[] = [];
    for (const key of [...configByDir.keys()].sort()) {
      const candidate = configByDir.get(key);
      if (!roots.some((root) => isInside(candidate.dir, root.dir))) {
        roots.push(candidate);
      }
    }

    const collections = (await Promise.all(
      roots.map(({ dir, config, source }) => this.readCollection(dir, config, source))
    ))
      .filter((collection): collection is CollectionRoot => collection !== undefined)
      .concat(unavailable.map((dir) => this.unavailableCollection(dir)))
      .sort((a, b) => a.name.localeCompare(b.name));

    this.watchCollectionContents(collections);
    return collections;
  }

  /** Keeps an opened collection in the tree while its folder cannot be read, like a missing workspace folder in Explorer. */
  private unavailableCollection(dir: vscode.Uri): CollectionRoot {
    return { uid: uidFor(dir), name: basename(dir), uri: dir, format: 'bru', ignore: [], source: 'opened', available: false };
  }

  private createRootEntity(collection: CollectionRoot): Entity {
    return this.createEntity(
      collection.name,
      collection.available ? this.folderState() : vscode.TreeItemCollapsibleState.None,
      collection.uri,
      collection,
      'collection'
    );
  }

  /**
   * Build a tree item. While a filter is active the id carries the search
   * text, so VS Code treats the items as new and renders them with the
   * expanded state the filter asks for instead of the expansion it remembers
   * for the unfiltered tree. Clearing the filter brings that memory back.
   */
  private createEntity(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    uri: vscode.Uri,
    collection: CollectionRoot,
    ...params: EntityParams
  ): Entity {
    const item = new Entity(label, collapsibleState, uri, collection, ...params);

    if (this._filter) {
      item.id = `${item.id}#filter:${this._filter}`;
    }

    return item;
  }

  /** Expandable items open up while a filter is active, so every match is in view. */
  private folderState(): vscode.TreeItemCollapsibleState {
    return this._filter ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
  }

  private doesItMatch(name: string, filter: string): boolean {
    return name.toLowerCase().includes(filter);
  }

  /** Keep only the collections, folders or requests the active filter matched. */
  private async filterEntries<T extends { uri: vscode.Uri }>(items: T[]): Promise<T[]> {
    const matches = await this.getMatches();
    return items.filter((item) => matches.has(item.uri.toString()));
  }

  /** Built once per filter text and tree change, then shared by every getChildren call. */
  private getMatches(): Promise<Set<string>> {
    if (!this.matchesPromise) {
      const filter = this._filter;
      this.matchesPromise = Promise.resolve(vscode.window.withProgress(
        { location: { viewId: NativeSidebarViewProvider.viewType } },
        () => this.getRequestIndex()
      )).then((index) => {
        const matches = new Set<string>();
        for (const request of index) {
          if (this.doesItMatch(request.name, filter)) {
            matches.add(request.uri);
            request.dirs.forEach((dir) => matches.add(dir));
          }
        }

        return matches;
      });
    }
    return this.matchesPromise;
  }

  /** Walks the collections only when the tree changed since the last walk, not on every keystroke. */
  private getRequestIndex(): Promise<IndexedRequest[]> {
    if (!this.requestIndexPromise) {
      this.requestIndexPromise = this.indexRequests();
    }

    return this.requestIndexPromise;
  }

  private async indexRequests(): Promise<IndexedRequest[]> {
    const index: IndexedRequest[] = [];
    const collections = await this.getCollections();

    await Promise.all(
      collections
        .filter((collection) => collection.available)
        .map((collection) => this.indexRequestsIn(collection.uri, collection, [], index))
    );

    return index;
  }

  /** Adds every request beneath `dir` to `index`, with the directories from the collection root down to it. */
  private async indexRequestsIn(dir: vscode.Uri, collection: CollectionRoot, parents: string[], index: IndexedRequest[]): Promise<void> {
    const dirs = [...parents, dir.toString()];
    const entries = await this.readChildren(dir, collection);

    await Promise.all(entries.map(async (entry) => {
      if (entry.params[0] !== 'request') {
        await this.indexRequestsIn(entry.uri, collection, dirs, index);
        return;
      }

      index.push({ uri: entry.uri.toString(), name: entry.name, dirs });
    }));
  }

  private configPriority(uri: vscode.Uri): number {
    const index = (COLLECTION_CONFIG_FILES as readonly string[]).indexOf(basename(uri));
    return index === -1 ? COLLECTION_CONFIG_FILES.length : index;
  }

  private async readCollection(dir: vscode.Uri, config: vscode.Uri, source: CollectionRoot['source']): Promise<CollectionRoot | undefined> {
    try {
      const { name, ignore } = await this.readCollectionConfig(config);

      return {
        uid: uidFor(dir),
        name: name || basename(dir),
        uri: dir,
        format: basename(config) === 'bruno.json' ? 'bru' : 'yml',
        ignore: Array.isArray(ignore) ? ignore.filter((entry): entry is string => typeof entry === 'string') : [],
        source,
        available: true
      };
    } catch (err) {
      logsStore.addLog('warn', [`Skipping collection at ${dir.toString()}: ${(err as Error).message}`]);
      return undefined;
    }
  }

  private async readCollectionConfig(config: vscode.Uri): Promise<{ name?: string; ignore?: unknown }> {
    const content = await readText(config);

    if (basename(config) === 'bruno.json') {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error('Unable to parse json in bruno.json');
      }

      await validateSchema(parsed);

      return { name: parsed.name as string, ignore: parsed.ignore };
    }

    const { brunoConfig } = parseCollection(content, { format: 'yml' });
    return { name: brunoConfig?.name, ignore: brunoConfig?.ignore };
  }

  /**
   * List the folders and requests directly inside `dir`, in the order the tree
   * shows them. Folder names and ordering come from folder.bru / folder.yml
   * when present; request names, types and methods come from the parsed
   * request file. This is kept public so that reordering can work from the same listing.
   */
  async readChildren(dir: vscode.Uri, collection: CollectionRoot): Promise<ChildEntry[]> {
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(dir);
    } catch (err) {
      logsStore.addLog('warn', [`Unable to read ${dir.toString()}: ${(err as Error).message}`]);
      return [];
    }

    const requestExt = `.${collection.format}`;
    const metaFiles = META_FILES[collection.format];
    const ignored = new Set([...ALWAYS_IGNORED_DIRS, ...collection.ignore]);

    const children = await Promise.all(entries.map(async ([name, fileType]): Promise<ChildEntry | undefined> => {
      if (name.startsWith('.') || ignored.has(name)) {
        return undefined;
      }

      const uri = vscode.Uri.joinPath(dir, name);
      if (fileType & vscode.FileType.Directory) {
        return this.readFolder(uri, name, collection.format);
      }

      if ((fileType & vscode.FileType.File) && name.endsWith(requestExt) && !metaFiles.includes(name)) {
        return this.readRequest(uri, name.slice(0, -requestExt.length), collection.format);
      }

      return undefined;
    }));

    // Same order as the Bruno sidebar: all folders first, then all requests,
    // each group arranged by sortByNameThenSequence.
    const found = children.filter((child): child is ChildEntry => child !== undefined);
    return [
      ...sortByNameThenSequence(found.filter((child) => child.params[0] === 'folder')),
      ...sortByNameThenSequence(found.filter((child) => child.params[0] === 'request'))
    ];
  }

  private async readFolder(uri: vscode.Uri, dirName: string, format: CollectionFormat): Promise<ChildEntry> {
    const entry: ChildEntry = { uri, name: dirName, params: ['folder'] };
    const folderFile = vscode.Uri.joinPath(uri, `folder.${format}`);

    try {
      const content = await readText(folderFile);
      const { meta } = parseFolder(content, { format }) ?? {};
      // The parser substitutes "Untitled Folder" when the file carries no name.
      if (meta?.name && meta.name !== 'Untitled Folder') {
        entry.name = meta.name;
      }

      if (typeof meta?.seq === 'number') {
        entry.seq = meta.seq;
      }
    } catch {
      // No folder metadata file, or it is unreadable: the directory name is fine.
    }

    return entry;
  }

  private async readRequest(uri: vscode.Uri, fileStem: string, format: CollectionFormat): Promise<ChildEntry | undefined> {
    try {
      // Metadata only: the tree needs the type, name, seq and method, not the whole request.
      const content = stripDirtyMarker(await readText(uri));
      const parsed = parseFileMeta(content, format) as { type?: string; name?: unknown; request?: { method?: string } } | null;
      const requestType = REQUEST_TYPES[parsed?.type];

      if (!requestType) {
        // Not a request (e.g. an unrelated .yml file in a yml collection).
        return undefined;
      }

      const method = String(parsed?.request?.method || (requestType === 'GRAPHQL' ? 'POST' : 'GET')).toUpperCase() as RequestMethod;

      return {
        uri,
        name: parsed?.name ? String(parsed.name) : fileStem,
        seq: readSeq(content, format),
        params: ['request', method, requestType]
      };
    } catch (err) {
      logsStore.addLog('warn', [`Skipping request at ${uri.toString()}: ${(err as Error).message}`]);
      return undefined;
    }
  }

  /**
   * Update the tree when anything inside a collection changes. A config file
   * change means a collection may have appeared, moved or gone, so it rescans.
   */
  private watchCollectionContents(collections: CollectionRoot[]): void {
    const onContentChange = (collection: CollectionRoot) => (uri: vscode.Uri): void => {
      if (!isListed(uri, collection)) {
        return;
      }

      if (isCollectionConfig(uri)) {
        this.scheduleRefresh();
      } else {
        this.scheduleTreeUpdate();
      }
    };

    for (const collection of collections) {
      const directory = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(dirname(collection.uri), basename(collection.uri))
      );
      this.contentWatchers.push(
        directory,
        directory.onDidCreate(() => this.scheduleRefresh()),
        directory.onDidDelete(() => this.scheduleRefresh())
      );

      if (!collection.available) {
        // Rescan once a config file shows up inside the missing folder.
        const configAppears = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(collection.uri, `{${COLLECTION_CONFIG_FILES.join(',')}}`)
        );
        this.contentWatchers.push(
          configAppears,
          configAppears.onDidCreate(() => this.scheduleRefresh()));
        continue;
      }

      const contents = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(collection.uri, '**/*'));
      this.contentWatchers.push(
        contents,
        contents.onDidCreate(onContentChange(collection)),
        contents.onDidDelete(onContentChange(collection)),
        contents.onDidChange(onContentChange(collection))
      );
    }
  }

  private disposeContentWatchers(): void {
    for (const watcher of this.contentWatchers) {
      watcher.dispose();
    }
    this.contentWatchers = [];
  }
}

const methodColors = {
  'GET': 'charts.green',
  'POST': 'charts.yellow',
  'PUT': 'charts.blue',
  'PATCH': 'charts.orange',
  'DELETE': 'charts.red',
  'HEAD': 'charts.purple',
  'OPTIONS': 'charts.purple',
  'TRACE': 'charts.purple',
  'CONNECT': 'charts.purple',
} as const;

export class Entity extends vscode.TreeItem {
  readonly label: string;
  readonly collapsibleState?: vscode.TreeItemCollapsibleState;
  readonly type: Type;
  readonly uri: vscode.Uri;
  readonly collection: CollectionRoot;
  /** @deprecated To handle a bug in existing openRunnerPanel function which ignores the targetPath. This will be removed in the future  */
  readonly uid: string;

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    uri: vscode.Uri,
    collection: CollectionRoot,
    ...params: EntityParams
  ) {
    super(label, collapsibleState);

    const [type, requestMethod, requestType] = params;
    this.label = label;
    this.type = type;
    this.uri = uri;
    this.collection = collection;
    this.uid = uidFor(uri);

    // A stable id lets VS Code keep expansion state across tree refreshes.
    this.id = uri.toString();
    this.resourceUri = uri;

    // Menu `when` clauses match on this: collection, collection:opened,
    // collection:unavailable, folder, or request:<kind>.
    this.contextValue = type === 'request' ? `request:${requestType.toLowerCase()}`
      : type === 'collection' && !collection.available ? 'collection:unavailable'
        : type === 'collection' && collection.source === 'opened' ? 'collection:opened'
          : type;

    this.collapsibleState = collapsibleState;
    this.tooltip = this.getTooltip(requestType, requestMethod);
    this.accessibilityInformation = { label: this.getSpokenLabel(requestType, requestMethod) };

    if (type === 'collection' && !collection.available) {
      this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
      this.description = 'Not found';
      this.tooltip = `${uri.toString()} cannot be read. Close it, or bring the folder back.`;
    } else if (type === 'collection') {
      this.iconPath = new vscode.ThemeIcon('folder-library');
      // A click on the name opens the collection's settings.
      // With a command set, VS Code expands and collapses only from the chevron.
      this.command = {
        command: 'bruno.sidebar.settings',
        title: 'Open Collection Settings',
        arguments: [this]
      };
    } else if (type === 'folder') {
      this.iconPath = new vscode.ThemeIcon('folder');
    } else {
      this.iconPath = this.getRequestIcon(requestType, requestMethod);
      // gRPC and WebSocket requests have no HTTP method worth showing.
      if (requestType === 'HTTP' || requestType === 'GRAPHQL') {
        this.description = requestMethod;
      }
      this.command = {
        command: 'vscode.openWith',
        title: 'Open Request',
        arguments: [uri, BrunoEditorProvider.viewType]
      };
    }
  }

  /**
   * What a screen reader announces. Sighted users get the same facts from the
   * icon shape and colour, which assistive tech cannot see. 
   */
  private getSpokenLabel(requestType?: RequestType, requestMethod?: RequestMethod): string {
    switch (this.type) {
      case 'collection':
        return this.collection.available ? `Collection ${this.label}` : `Collection ${this.label}, not found`;
      case 'folder':
        return `Folder ${this.label}`;
      case 'request': {
        const kind: Record<RequestType, string> = {
          HTTP: `HTTP ${requestMethod}`,
          GRAPHQL: 'GraphQL',
          GRPC: 'gRPC',
          WS: 'WebSocket'
        };
        return `${kind[requestType]} request ${this.label}`;
      }
    }
  }

  private getRequestIcon(type: RequestType, method?: RequestMethod): vscode.ThemeIcon {
    if (type === 'GRAPHQL') {
      return new vscode.ThemeIcon('symbol-interface', new vscode.ThemeColor('charts.purple'));
    } else if (type === 'GRPC') {
      return new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor('charts.blue'));
    } else if (type === 'WS') {
      return new vscode.ThemeIcon('plug', new vscode.ThemeColor('charts.green'));
    } else {
      return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(methodColors[method] ?? 'charts.green'));
    }
  }

  private getTooltip(requestType?: RequestType, requestMethod?: RequestMethod) {
    const fileTypeLabel = this.type !== 'request' ? `${startCase(this.type)} - ` : '';
    const requestTypeLabel = this.type === 'request' && requestType ? `${requestType} - ` : '';
    // gRPC and WebSocket requests have no HTTP method worth showing.
    const requestMethodLabel = requestMethod && (requestType === 'HTTP' || requestType === 'GRAPHQL') ? `${requestMethod} - ` : '';

    return `${fileTypeLabel}${requestTypeLabel}${requestMethodLabel}${this.label}`;
  }
}
