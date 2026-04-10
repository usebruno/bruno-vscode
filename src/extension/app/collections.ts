import fs from 'fs';
import path from 'path';
import * as vscode from 'vscode';
import * as Yup from 'yup';
import { isDirectory, getCollectionStats, normalizeAndResolvePath, posixifyPath } from '../utils/filesystem';
import { generateUidBasedOnHash } from '../utils/common';
import { transformBrunoConfigAfterRead } from '../utils/transformBrunoConfig';
import LastOpenedCollections from '../store/last-opened-collections';
import { defaultWorkspaceManager } from '../store/default-workspace';
import {
  addCollectionToWorkspace as addToWorkspaceYml,
  readWorkspaceConfig
} from '../utils/workspace-config';
import { prepareWorkspaceConfigForClient } from '../ipc/workspace';
const { parseCollection } = require('@usebruno/filestore');

// Message sender type - will be set by the extension (variadic args)
type MessageSender = (channel: string, ...args: unknown[]) => void;

interface CollectionWatcher {
  hasWatcher(collectionPath: string): boolean;
  addWatcher(watchPath: string, collectionUid: string, brunoConfig?: BrunoConfig, useWorkerThread?: boolean): void;
  loadSingleRequest(requestFilePath: string, collectionUid: string, collectionPath: string, targetSender?: MessageSender): Promise<void>;
  setupWatchersOnly(watchPath: string, collectionUid: string): void;
}

// Event emitter for internal events
type EventEmitter = (event: string, ...args: unknown[]) => void;

interface BrunoConfig {
  name: string;
  type: string;
  version?: string;
  opencollection?: string;
  ignore?: string[];
  size?: number;
  filesCount?: number;
  [key: string]: unknown;
}

interface OpenCollectionOptions {
  dontSendDisplayErrors?: boolean;
}

// Schema for bruno.json validation
const configSchema = Yup.object({
  name: Yup.string().max(256, 'name must be 256 characters or less').required('name is required'),
  type: Yup.string().oneOf(['collection']).required('type is required'),
  // For BRU format collections
  version: Yup.string().oneOf(['1']).notRequired(),
  // For YAML format collections (opencollection)
  opencollection: Yup.string().notRequired()
});

let messageSender: MessageSender | null = null;
let eventEmitter: EventEmitter | null = null;

export function setMessageSender(sender: MessageSender): void {
  messageSender = sender;
}

export function setEventEmitter(emitter: EventEmitter): void {
  eventEmitter = emitter;
}

const readConfigFile = async (pathname: string): Promise<Record<string, unknown>> => {
  try {
    const jsonData = fs.readFileSync(pathname, 'utf8');
    return JSON.parse(jsonData);
  } catch (err) {
    return Promise.reject(new Error('Unable to parse json in bruno.json'));
  }
};

const validateSchema = async (config: Record<string, unknown>): Promise<void> => {
  try {
    await configSchema.validate(config);
  } catch (err) {
    return Promise.reject(new Error('bruno.json format is invalid'));
  }
};

const getCollectionConfigFile = async (pathname: string): Promise<BrunoConfig> => {
  const ocYmlPath = path.join(pathname, 'opencollection.yml');
  if (fs.existsSync(ocYmlPath)) {
    try {
      const content = fs.readFileSync(ocYmlPath, 'utf8');
      const { brunoConfig } = parseCollection(content, { format: 'yml' });
      await validateSchema(brunoConfig as unknown as Record<string, unknown>);
      return brunoConfig;
    } catch (err) {
      const error = err as Error;
      throw new Error(`Unable to parse opencollection.yml: ${error.message}`);
    }
  }

  // Fall back to bruno.json
  const configFilePath = path.join(pathname, 'bruno.json');
  if (!fs.existsSync(configFilePath)) {
    throw new Error(`The collection is not valid (neither bruno.json nor opencollection.yml found)`);
  }

  const config = await readConfigFile(configFilePath);
  await validateSchema(config);

  return config as unknown as BrunoConfig;
};

/**
 * Open collection dialog using VS Code's file picker
 */
export const openCollectionDialog = async (watcher: CollectionWatcher): Promise<void> => {
  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: true,
    openLabel: 'Open Collection',
    title: 'Select Bruno Collection Folder(s)'
  });

  if (!uris || uris.length === 0) {
    return;
  }

  const filePaths = [...new Set(uris.map(uri => uri.fsPath))];
  const invalidPaths: string[] = [];

  let alreadyOpenCount = 0;

  const openCollectionPromises = filePaths.map(async (filePath) => {
    const resolvedPath = path.resolve(filePath);

    if (isDirectory(resolvedPath)) {
      try {
        const result = await openCollection(watcher, resolvedPath);
        if (result.alreadyOpen) {
          alreadyOpenCount++;
        }
      } catch (err) {
        const error = err as Error;
        console.error(`[ERROR] Failed to open collection at "${resolvedPath}":`, error.message);
        return { error, path: resolvedPath };
      }
    } else {
      invalidPaths.push(resolvedPath);
      console.error(`[ERROR] Cannot open unknown folder: "${resolvedPath}"`);
    }
    return null;
  });

  await Promise.all(openCollectionPromises);

  // Show toast if user tried to open collections that were already open
  if (alreadyOpenCount > 0 && messageSender) {
    const message = alreadyOpenCount === 1
      ? 'Collection is already opened'
      : `${alreadyOpenCount} collections are already opened`;
    messageSender('main:toast-success', message);
  }

  if (invalidPaths.length > 0 && messageSender) {
    messageSender('main:display-error', `Some selected folders could not be opened: ${invalidPaths.join(', ')}`);
  }
};

export const openCollection = async (
  watcher: CollectionWatcher,
  collectionPath: string,
  options: OpenCollectionOptions = {}
): Promise<{ alreadyOpen: boolean }> => {
  const watcherExists = watcher.hasWatcher(collectionPath);

  // Always process the collection - each webview has its own Redux store
  // so we need to send collection data even if watcher already exists

  try {
    let brunoConfig = await getCollectionConfigFile(collectionPath);
    const uid = generateUidBasedOnHash(collectionPath);

    // Always ensure node_modules and .git are ignored, regardless of user config
    const defaultIgnores = ['node_modules', '.git'];
    const userIgnores = brunoConfig.ignore || [];
    brunoConfig.ignore = [...new Set([...defaultIgnores, ...userIgnores])];

    brunoConfig = await transformBrunoConfigAfterRead(brunoConfig, collectionPath) as unknown as BrunoConfig;

    const { size, filesCount } = await getCollectionStats(collectionPath);
    brunoConfig.size = size;
    brunoConfig.filesCount = filesCount;

    const lastOpenedStore = new LastOpenedCollections();
    lastOpenedStore.add(collectionPath);

    const workspacePath = defaultWorkspaceManager.getDefaultWorkspacePath();
    if (workspacePath) {
      try {
        await addToWorkspaceYml(workspacePath, { name: brunoConfig.name, path: collectionPath });
        if (messageSender) {
          const workspaceConfig = readWorkspaceConfig(workspacePath);
          // Use defaultWorkspaceManager UID ('default') to match what Redux expects
          const wsUid = defaultWorkspaceManager.getDefaultWorkspaceUid();
          const configForClient = prepareWorkspaceConfigForClient(workspaceConfig, workspacePath, true);
          messageSender('main:workspace-config-updated', posixifyPath(workspacePath), wsUid, configForClient);
        }
      } catch (err) {
        console.error('[Collections] Error adding collection to workspace:', err);
      }
    }

    if (messageSender) {
      messageSender('main:collection-opened', posixifyPath(collectionPath), uid, brunoConfig, true);
    }

    // Emit internal event for collection opened
    if (eventEmitter) {
      eventEmitter('main:collection-opened', collectionPath, uid, brunoConfig);
    }

    // Skip if watcher already exists (e.g. when re-sending collection data to a new webview).
    if (!watcherExists) {
      // Short delay to let the webview process collection-opened and create collection in Redux.
      // The webview's pending events queue will buffer any tree events that arrive before the collection exists.
      setTimeout(() => {
        watcher.addWatcher(collectionPath, uid, brunoConfig);
      }, 150);
    }

    return { alreadyOpen: watcherExists };
  } catch (err) {
    const error = err as Error;
    if (!options.dontSendDisplayErrors && messageSender) {
      messageSender('main:display-error', error.message || 'An error occurred while opening the local collection');
    }
    return { alreadyOpen: false };
  }
};

/**
 * Open multiple collections by pathname
 */
export const openCollectionsByPathname = async (
  watcher: CollectionWatcher,
  collectionPaths: string[],
  options: OpenCollectionOptions = {}
): Promise<void> => {
  const seenPaths = new Set<string>();

  for (const collectionPath of collectionPaths) {
    const resolvedPath = path.isAbsolute(collectionPath)
      ? collectionPath
      : normalizeAndResolvePath(collectionPath);

    const normalizedPath = path.normalize(resolvedPath);
    if (seenPaths.has(normalizedPath)) {
      continue;
    }
    seenPaths.add(normalizedPath);

    if (isDirectory(resolvedPath)) {
      await openCollection(watcher, resolvedPath, options);
    } else {
      console.error(`Cannot open unknown folder: "${resolvedPath}"`);
    }
  }
};

/**
 * Open a collection for a single request file
 * Only loads the clicked request and its dependencies (folders, environments)
 * instead of the entire collection
 *
 * @param watcher - The collection watcher
 * @param collectionPath - Path to the collection root
 * @param requestFilePath - Path to the specific .bru file
 * @param options - Options for opening
 * @param targetSender - Optional webview-specific sender (if not provided, uses module messageSender which broadcasts)
 */
export const openCollectionForSingleRequest = async (
  watcher: CollectionWatcher,
  collectionPath: string,
  requestFilePath: string,
  options: OpenCollectionOptions = {},
  targetSender?: MessageSender
): Promise<string | null> => {
  // Use targetSender if provided (for per-webview messaging), otherwise fall back to broadcast
  const sender = targetSender || messageSender;

  try {
    let brunoConfig = await getCollectionConfigFile(collectionPath);
    const uid = generateUidBasedOnHash(collectionPath);

    // Always ensure node_modules and .git are ignored
    const defaultIgnores = ['node_modules', '.git'];
    const userIgnores = brunoConfig.ignore || [];
    brunoConfig.ignore = [...new Set([...defaultIgnores, ...userIgnores])];

    brunoConfig = await transformBrunoConfigAfterRead(brunoConfig, collectionPath) as unknown as BrunoConfig;

    const { size, filesCount } = await getCollectionStats(collectionPath);
    brunoConfig.size = size;
    brunoConfig.filesCount = filesCount;

    // Pass shouldPersist=false for auto-opened collections (via clicking .bru file)
    if (sender) {
      sender('main:collection-opened', posixifyPath(collectionPath), uid, brunoConfig, false);
    }

    // Emit internal event with skipFullLoad=true to prevent full collection scan
    // We'll handle file loading ourselves with loadSingleRequest
    if (eventEmitter) {
      eventEmitter('main:collection-opened', collectionPath, uid, brunoConfig, true /* skipFullLoad */);
    }

    // Short delay to let the webview process collection-opened and create collection in Redux.
    // The webview's pending events queue will buffer any tree events that arrive before the collection exists.
    setTimeout(async () => {
      try {
        // Pass the targetSender so file events also go to the right webview
        await watcher.loadSingleRequest(requestFilePath, uid, collectionPath, targetSender);

        watcher.setupWatchersOnly(collectionPath, uid);
      } catch (err) {
        console.error('[openCollectionForSingleRequest] Error loading single request:', err);
      }
    }, 150);

    return uid;
  } catch (err) {
    const error = err as Error;
    if (!options.dontSendDisplayErrors && sender) {
      sender('main:display-error', error.message || 'An error occurred while opening the local collection');
    }
    return null;
  }
};

export {
  getCollectionConfigFile,
  validateSchema,
  readConfigFile
};
