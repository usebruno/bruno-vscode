import * as _ from 'lodash';
import fs from 'fs';
import path from 'path';
import * as vscode from 'vscode';
import {
  hasRequestExtension,
  sizeInMB,
  getCollectionFormat,
  posixifyPath
} from '../utils/filesystem';

const {
  parseEnvironment: parseEnvFile,
  parseRequest: parseRequestFile,
  parseRequestViaWorker,
  parseCollection: parseCollectionFile,
  parseFolder: parseFolderFile
} = require('@usebruno/filestore');
const { dotenvToJson } = require('@usebruno/lang');

import { uuid } from '../utils/common';
import { getRequestUid } from '../cache/requestUids';
import { decryptStringSafe } from '../utils/encryption';
import { setDotEnvVars, getProcessEnvVars } from '../store/process-env';
import { setBrunoConfig } from '../store/bruno-config';
import EnvironmentSecretsStore from '../store/env-secrets';
import UiStateSnapshot from '../store/ui-state-snapshot';
import { parseFileMeta, hydrateRequestWithUuid } from '../utils/collection';
import { parseLargeRequestWithRedaction } from '../utils/parse';
import { transformBrunoConfigAfterRead } from '../utils/transformBrunoConfig';

// Message sender type - will be set by the extension (variadic args)
type MessageSender = (channel: string, ...args: unknown[]) => void;

const MAX_FILE_SIZE = 2.5 * 1024 * 1024;

const environmentSecretsStore = new EnvironmentSecretsStore();

let messageSender: MessageSender | null = null;

export function setMessageSender(sender: MessageSender): void {
  messageSender = sender;
}

const parseEnvironment = async (content: string, options: { format: string }) => {
  return parseEnvFile(content, { format: options.format });
};

const parseRequest = async (content: string, options: { format: string }) => {
  return parseRequestFile(content, { format: options.format });
};

const parseCollection = async (content: string, options: { format: string }) => {
  return parseCollectionFile(content, { format: options.format });
};

const parseFolder = async (content: string, options: { format: string }) => {
  return parseFolderFile(content, { format: options.format });
};

const parseDotEnv = (content: string): Record<string, string> => {
  return dotenvToJson(content);
};

const isDotEnvFile = (pathname: string, collectionPath: string): boolean => {
  const dirname = path.dirname(pathname);
  const basename = path.basename(pathname);
  return path.normalize(dirname) === path.normalize(collectionPath) && basename === '.env';
};

const isBrunoConfigFile = (pathname: string, collectionPath: string): boolean => {
  const dirname = path.dirname(pathname);
  const basename = path.basename(pathname);
  return path.normalize(dirname) === path.normalize(collectionPath) && basename === 'bruno.json';
};

const isEnvironmentsFolder = (pathname: string, collectionPath: string): boolean => {
  const dirname = path.dirname(pathname);
  const envDirectory = path.join(collectionPath, 'environments');
  return path.normalize(dirname) === path.normalize(envDirectory);
};

const isFolderRootFile = (pathname: string, collectionPath: string): boolean => {
  const basename = path.basename(pathname);
  const format = getCollectionFormat(collectionPath);

  if (format === 'yml') {
    return basename === 'folder.yml';
  } else if (format === 'bru') {
    return basename === 'folder.bru';
  }
  return false;
};

const isCollectionRootFile = (pathname: string, collectionPath: string): boolean => {
  const dirname = path.dirname(pathname);
  const basename = path.basename(pathname);

  if (path.normalize(dirname) !== path.normalize(collectionPath)) {
    return false;
  }
  return basename === 'collection.bru' || basename === 'opencollection.yml';
};

interface EnvironmentVariable {
  name: string;
  value: string;
  secret?: boolean;
  uid?: string;
}

interface Environment {
  name?: string;
  uid?: string;
  variables?: EnvironmentVariable[];
}

const envHasSecrets = (environment: Environment = {}): boolean => {
  const secrets = _.filter(environment.variables, (v) => v.secret);
  return secrets && secrets.length > 0;
};

interface CollectionRoot {
  request?: {
    params?: Array<{ uid?: string }>;
    headers?: Array<{ uid?: string }>;
    vars?: {
      req?: Array<{ uid?: string }>;
      res?: Array<{ uid?: string }>;
    };
  };
}

const hydrateCollectionRootWithUuid = (collectionRoot: CollectionRoot): CollectionRoot => {
  const params = _.get(collectionRoot, 'request.params', []);
  const headers = _.get(collectionRoot, 'request.headers', []);
  const requestVars = _.get(collectionRoot, 'request.vars.req', []);
  const responseVars = _.get(collectionRoot, 'request.vars.res', []);

  params.forEach((param: { uid?: string }) => (param.uid = uuid()));
  headers.forEach((header: { uid?: string }) => (header.uid = uuid()));
  requestVars.forEach((variable: { uid?: string }) => (variable.uid = uuid()));
  responseVars.forEach((variable: { uid?: string }) => (variable.uid = uuid()));

  return collectionRoot;
};

interface FileMeta {
  collectionUid: string;
  pathname: string;
  name: string;
  collectionRoot?: boolean;
  folderRoot?: boolean;
  seq?: number;
  uid?: string;
}

/** Parsed request/folder/collection/environment data */
interface ParsedFileData {
  name?: string;
  type?: string;
  uid?: string;
  variables?: EnvironmentVariable[];
  [key: string]: unknown;
}

interface FileData {
  meta: FileMeta;
  data?: ParsedFileData;
  partial?: boolean;
  loading?: boolean;
  size?: number;
  error?: { message?: string };
}

interface BrunoConfig {
  ignore?: string[];
  [key: string]: unknown;
}

interface LoadingState {
  isDiscovering: boolean;
  isProcessing: boolean;
  pendingFiles: Set<string>;
}

// Event handlers for file system changes
const addEnvironmentFile = async (
  pathname: string,
  collectionUid: string,
  collectionPath: string
): Promise<void> => {
  try {
    const basename = path.basename(pathname);
    const posixPathname = posixifyPath(pathname);
    const file: FileData = {
      meta: {
        collectionUid,
        pathname: posixPathname,
        name: basename
      }
    };

    const format = getCollectionFormat(collectionPath);
    const content = fs.readFileSync(pathname, 'utf8');

    const parsedEnv = await parseEnvironment(content, { format }) as Environment;

    const ext = path.extname(basename);
    parsedEnv.name = basename.substring(0, basename.length - ext.length);
    parsedEnv.uid = getRequestUid(pathname);

    _.each(parsedEnv.variables ?? [], (variable: EnvironmentVariable) => (variable.uid = uuid()));

    // hydrate environment variables with secrets
    if (envHasSecrets(parsedEnv)) {
      const envSecrets = environmentSecretsStore.getEnvSecrets(collectionPath, parsedEnv);
      _.each(envSecrets, (secret: { name: string; value: string }) => {
        const variable = _.find(parsedEnv.variables, (v: EnvironmentVariable) => v.name === secret.name);
        if (variable && secret.value) {
          const decryptionResult = decryptStringSafe(secret.value);
          variable.value = decryptionResult.value;
        }
      });
    }

    file.data = parsedEnv as ParsedFileData;

    if (messageSender) {
      messageSender('main:collection-tree-updated', 'addEnvironmentFile', file);
    }
  } catch (err) {
    console.error('Error processing environment file: ', err);
  }
};

const changeEnvironmentFile = async (
  pathname: string,
  collectionUid: string,
  collectionPath: string
): Promise<void> => {
  // Reuse addEnvironmentFile since uid stays the same
  await addEnvironmentFile(pathname, collectionUid, collectionPath);
};

const unlinkEnvironmentFile = async (pathname: string, collectionUid: string): Promise<void> => {
  try {
    const basename = path.basename(pathname);
    const posixPathname = posixifyPath(pathname);
    const file: FileData = {
      meta: {
        collectionUid,
        pathname: posixPathname,
        name: basename
      },
      data: {
        uid: getRequestUid(pathname),
        name: basename.substring(0, basename.length - 4)
      }
    };

    if (messageSender) {
      messageSender('main:collection-tree-updated', 'unlinkEnvironmentFile', file);
    }
  } catch (err) {
    console.error(err);
  }
};

/**
 * Collection Watcher Class
 * Uses VS Code's FileSystemWatcher for file monitoring
 */
class CollectionWatcher {
  private watchers: Map<string, vscode.FileSystemWatcher[]> = new Map();
  private loadingStates: Map<string, LoadingState> = new Map();
  private pathToCollectionUid: Map<string, string> = new Map();

  initializeLoadingState(collectionUid: string): void {
    if (!this.loadingStates.has(collectionUid)) {
      this.loadingStates.set(collectionUid, {
        isDiscovering: false,
        isProcessing: false,
        pendingFiles: new Set()
      });
    }
  }

  startCollectionDiscovery(collectionUid: string): void {
    this.initializeLoadingState(collectionUid);
    const state = this.loadingStates.get(collectionUid)!;

    state.isDiscovering = true;
    state.pendingFiles.clear();

    if (messageSender) {
      messageSender('main:collection-loading-state-updated', {
        collectionUid,
        isLoading: true
      });
    }
  }

  addFileToProcessing(collectionUid: string, filepath: string): void {
    this.initializeLoadingState(collectionUid);
    const state = this.loadingStates.get(collectionUid)!;
    state.pendingFiles.add(filepath);
  }

  markFileAsProcessed(collectionUid: string, filepath: string): void {
    const state = this.loadingStates.get(collectionUid);
    if (!state) return;

    state.pendingFiles.delete(filepath);

    // If discovery is complete and no pending files, mark as not loading
    if (!state.isDiscovering && state.pendingFiles.size === 0 && state.isProcessing) {
      state.isProcessing = false;
      if (messageSender) {
        messageSender('main:collection-loading-state-updated', {
          collectionUid,
          isLoading: false
        });
      }
    }
  }

  completeCollectionDiscovery(collectionUid: string): void {
    const state = this.loadingStates.get(collectionUid);
    if (!state) return;

    state.isDiscovering = false;

    if (state.pendingFiles.size > 0) {
      state.isProcessing = true;
    } else {
      if (messageSender) {
        messageSender('main:collection-loading-state-updated', {
          collectionUid,
          isLoading: false
        });
      }
    }
  }

  cleanupLoadingState(collectionUid: string): void {
    this.loadingStates.delete(collectionUid);
  }

  private initializeLoadingStateWithSender(collectionUid: string, sender: MessageSender | null): void {
    if (!this.loadingStates.has(collectionUid)) {
      this.loadingStates.set(collectionUid, {
        isDiscovering: false,
        isProcessing: false,
        pendingFiles: new Set()
      });
    }
  }

  private startCollectionDiscoveryWithSender(collectionUid: string, sender: MessageSender | null): void {
    this.initializeLoadingStateWithSender(collectionUid, sender);
    const state = this.loadingStates.get(collectionUid)!;

    state.isDiscovering = true;
    state.pendingFiles.clear();

    if (sender) {
      sender('main:collection-loading-state-updated', {
        collectionUid,
        isLoading: true
      });
    }
  }

  private completeCollectionDiscoveryWithSender(collectionUid: string, sender: MessageSender | null): void {
    const state = this.loadingStates.get(collectionUid);
    if (!state) return;

    state.isDiscovering = false;

    if (state.pendingFiles.size > 0) {
      state.isProcessing = true;
    } else {
      if (sender) {
        sender('main:collection-loading-state-updated', {
          collectionUid,
          isLoading: false
        });
      }
    }
  }

  private async handleDotEnvChangeWithSender(pathname: string, collectionUid: string, sender: MessageSender | null): Promise<void> {
    try {
      const content = fs.readFileSync(pathname, 'utf8');
      const jsonData = parseDotEnv(content);

      setDotEnvVars(collectionUid, jsonData);

      if (sender) {
        sender('main:process-env-update', {
          collectionUid,
          processEnvVariables: getProcessEnvVars(collectionUid)
        });
      }
    } catch (err) {
      console.error('Error handling .env change:', err);
    }
  }

  private async handleBrunoConfigChangeWithSender(
    pathname: string,
    collectionUid: string,
    collectionPath: string,
    sender: MessageSender | null
  ): Promise<void> {
    try {
      const content = fs.readFileSync(pathname, 'utf8');
      let brunoConfig = JSON.parse(content);
      brunoConfig = await transformBrunoConfigAfterRead(brunoConfig, collectionPath);

      setBrunoConfig(collectionUid, brunoConfig);

      if (sender) {
        sender('main:bruno-config-update', { collectionUid, brunoConfig });
      }
    } catch (err) {
      console.error('Error handling bruno.json change:', err);
    }
  }

  private async handleFileAddWithSender(
    pathname: string,
    collectionUid: string,
    collectionPath: string,
    useWorkerThread: boolean,
    sender: MessageSender | null
  ): Promise<void> {
    if (isBrunoConfigFile(pathname, collectionPath)) {
      await this.handleBrunoConfigChangeWithSender(pathname, collectionUid, collectionPath, sender);
      return;
    }

    if (isDotEnvFile(pathname, collectionPath)) {
      await this.handleDotEnvChangeWithSender(pathname, collectionUid, sender);
      return;
    }

    if (isEnvironmentsFolder(pathname, collectionPath)) {
      await this.addEnvironmentFileWithSender(pathname, collectionUid, collectionPath, sender);
      return;
    }

    if (isCollectionRootFile(pathname, collectionPath)) {
      await this.handleCollectionRootFileWithSender(pathname, collectionUid, collectionPath, 'addFile', sender);
      return;
    }

    if (isFolderRootFile(pathname, collectionPath)) {
      await this.handleFolderRootFileWithSender(pathname, collectionUid, collectionPath, 'addFile', sender);
      return;
    }

    const format = getCollectionFormat(collectionPath);
    if (hasRequestExtension(pathname, format)) {
      await this.handleRequestFileWithSender(pathname, collectionUid, collectionPath, useWorkerThread, sender);
    }
  }

  private async addEnvironmentFileWithSender(
    pathname: string,
    collectionUid: string,
    collectionPath: string,
    sender: MessageSender | null
  ): Promise<void> {
    try {
      const basename = path.basename(pathname);
      const posixPathname = posixifyPath(pathname);
      const file: FileData = {
        meta: {
          collectionUid,
          pathname: posixPathname,
          name: basename
        }
      };

      const format = getCollectionFormat(collectionPath);
      const content = fs.readFileSync(pathname, 'utf8');

      const parsedEnv = await parseEnvironment(content, { format }) as Environment;

      const ext = path.extname(basename);
      parsedEnv.name = basename.substring(0, basename.length - ext.length);
      parsedEnv.uid = getRequestUid(pathname);

      _.each(parsedEnv.variables ?? [], (variable: EnvironmentVariable) => (variable.uid = uuid()));

      // hydrate environment variables with secrets
      if (envHasSecrets(parsedEnv)) {
        const envSecrets = environmentSecretsStore.getEnvSecrets(collectionPath, parsedEnv);
        _.each(envSecrets, (secret: { name: string; value: string }) => {
          const variable = _.find(parsedEnv.variables, (v: EnvironmentVariable) => v.name === secret.name);
          if (variable && secret.value) {
            const decryptionResult = decryptStringSafe(secret.value);
            variable.value = decryptionResult.value;
          }
        });
      }

      file.data = parsedEnv as ParsedFileData;

      if (sender) {
        sender('main:collection-tree-updated', 'addEnvironmentFile', file);
      }
    } catch (err) {
      console.error('Error processing environment file: ', err);
    }
  }

  private async handleCollectionRootFileWithSender(
    pathname: string,
    collectionUid: string,
    collectionPath: string,
    action: string,
    sender: MessageSender | null
  ): Promise<void> {
    const format = getCollectionFormat(collectionPath);
    const file: FileData = {
      meta: {
        collectionUid,
        pathname: posixifyPath(pathname),
        name: path.basename(pathname),
        collectionRoot: true
      }
    };

    try {
      const content = fs.readFileSync(pathname, 'utf8');
      const parsed = await parseCollection(content, { format });

      if (format === 'yml') {
        file.data = parsed.collectionRoot;
        hydrateCollectionRootWithUuid(file.data as CollectionRoot);

        if (sender) {
          sender('main:collection-tree-updated', action, file);
        }

        if (parsed.brunoConfig) {
          const brunoConfig = await transformBrunoConfigAfterRead(parsed.brunoConfig, collectionPath);
          setBrunoConfig(collectionUid, brunoConfig);

          if (sender) {
            sender('main:bruno-config-update', { collectionUid, brunoConfig });
          }
        }
      } else {
        file.data = parsed;
        hydrateCollectionRootWithUuid(file.data as CollectionRoot);

        if (sender) {
          sender('main:collection-tree-updated', action, file);
        }
      }
    } catch (err) {
      console.error('Error handling collection root file:', err);
    }
  }

  private async handleFolderRootFileWithSender(
    pathname: string,
    collectionUid: string,
    collectionPath: string,
    action: string,
    sender: MessageSender | null
  ): Promise<void> {
    const file: FileData = {
      meta: {
        collectionUid,
        pathname: posixifyPath(pathname),
        name: path.basename(pathname),
        folderRoot: true
      }
    };

    try {
      const format = getCollectionFormat(collectionPath);
      const content = fs.readFileSync(pathname, 'utf8');
      file.data = await parseFolder(content, { format });

      hydrateCollectionRootWithUuid(file.data as CollectionRoot);

      if (sender) {
        sender('main:collection-tree-updated', action, file);
      }
    } catch (err) {
      console.error('Error handling folder root file:', err);
    }
  }

  private async handleRequestFileWithSender(
    pathname: string,
    collectionUid: string,
    collectionPath: string,
    useWorkerThread: boolean,
    sender: MessageSender | null
  ): Promise<void> {
    this.addFileToProcessing(collectionUid, pathname);

    const file: FileData = {
      meta: {
        collectionUid,
        pathname: posixifyPath(pathname),
        name: path.basename(pathname)
      }
    };

    try {
      const fileStats = fs.statSync(pathname);
      const content = fs.readFileSync(pathname, 'utf8');

      // Skip empty files - don't add them to the collection tree
      if (!content.trim()) {
        console.log('[Watcher] Skipping empty file:', pathname);
        this.markFileAsProcessed(collectionUid, pathname);
        return;
      }

      const format = getCollectionFormat(collectionPath);

      file.data = await parseRequest(content, { format });

      file.partial = false;
      file.loading = false;
      file.size = sizeInMB(fileStats?.size);
      hydrateRequestWithUuid(file.data, pathname);

      if (sender) {
        sender('main:collection-tree-updated', 'addFile', file);
      }
    } catch (error) {
      const err = error as Error;
      console.error('[Watcher] Error parsing file:', pathname, err.message);
      file.data = { name: path.basename(pathname), type: 'http-request' };
      file.error = { message: err?.message };
      file.partial = true;
      file.loading = false;
      hydrateRequestWithUuid(file.data, pathname);

      if (sender) {
        sender('main:collection-tree-updated', 'addFile', file);
      }
    } finally {
      this.markFileAsProcessed(collectionUid, pathname);
    }
  }

  addWatcher(
    watchPath: string,
    collectionUid: string,
    brunoConfig?: BrunoConfig,
    useWorkerThread = false
  ): void {
    if (this.watchers.has(watchPath)) {
      const existingWatchers = this.watchers.get(watchPath)!;
      existingWatchers.forEach(w => w.dispose());
    }

    this.initializeLoadingState(collectionUid);
    this.startCollectionDiscovery(collectionUid);

    const format = getCollectionFormat(watchPath);
    const watchers: vscode.FileSystemWatcher[] = [];

    const requestPattern = format === 'yml'
      ? new vscode.RelativePattern(watchPath, '**/*.yml')
      : new vscode.RelativePattern(watchPath, '**/*.bru');

    const envExt = format === 'yml' ? 'yml' : 'bru';
    const envPattern = new vscode.RelativePattern(watchPath, `environments/*.${envExt}`);
    const configPattern = new vscode.RelativePattern(watchPath, 'bruno.json');
    const ocYmlPattern = new vscode.RelativePattern(watchPath, 'opencollection.yml');
    const dotEnvPattern = new vscode.RelativePattern(watchPath, '.env');

    const requestWatcher = vscode.workspace.createFileSystemWatcher(requestPattern);
    requestWatcher.onDidCreate(uri => this.handleFileAdd(uri.fsPath, collectionUid, watchPath, useWorkerThread));
    requestWatcher.onDidChange(uri => this.handleFileChange(uri.fsPath, collectionUid, watchPath));
    requestWatcher.onDidDelete(uri => this.handleFileUnlink(uri.fsPath, collectionUid, watchPath));
    watchers.push(requestWatcher);

    const envWatcher = vscode.workspace.createFileSystemWatcher(envPattern);
    envWatcher.onDidCreate(uri => addEnvironmentFile(uri.fsPath, collectionUid, watchPath));
    envWatcher.onDidChange(uri => changeEnvironmentFile(uri.fsPath, collectionUid, watchPath));
    envWatcher.onDidDelete(uri => unlinkEnvironmentFile(uri.fsPath, collectionUid));
    watchers.push(envWatcher);

    const configWatcher = vscode.workspace.createFileSystemWatcher(configPattern);
    configWatcher.onDidChange(uri => this.handleBrunoConfigChange(uri.fsPath, collectionUid, watchPath));
    watchers.push(configWatcher);

    // Watch for opencollection.yml (YML format config changes are handled via collection root file handler)
    const ocYmlWatcher = vscode.workspace.createFileSystemWatcher(ocYmlPattern);
    ocYmlWatcher.onDidChange(uri => this.handleFileChange(uri.fsPath, collectionUid, watchPath));
    watchers.push(ocYmlWatcher);

    const dotEnvWatcher = vscode.workspace.createFileSystemWatcher(dotEnvPattern);
    dotEnvWatcher.onDidCreate(uri => this.handleDotEnvChange(uri.fsPath, collectionUid));
    dotEnvWatcher.onDidChange(uri => this.handleDotEnvChange(uri.fsPath, collectionUid));
    watchers.push(dotEnvWatcher);

    this.watchers.set(watchPath, watchers);
    this.pathToCollectionUid.set(watchPath, collectionUid);

    // Initial scan of collection
    this.performInitialScan(watchPath, collectionUid, useWorkerThread);
  }

  private async performInitialScan(
    watchPath: string,
    collectionUid: string,
    useWorkerThread: boolean
  ): Promise<void> {
    const format = getCollectionFormat(watchPath);
    const extension = format === 'yml' ? 'yml' : 'bru';

    try {
      // vscode.workspace.findFiles may not work for paths outside the workspace
      const { files, directories } = await this.scanDirectoryRecursive(watchPath, extension);

      // Process directories first (including empty folders)
      // Sort by path length to ensure parent folders are processed before children
      directories.sort((a, b) => a.length - b.length);
      for (const dirPath of directories) {
        await this.handleDirectoryAdd(dirPath, collectionUid, watchPath);
      }

      // Separate files by priority: config/env/root files first, then request files in parallel
      const priorityFiles: string[] = [];
      const requestFiles: string[] = [];

      for (const filePath of files) {
        if (isBrunoConfigFile(filePath, watchPath) ||
            isDotEnvFile(filePath, watchPath) ||
            isEnvironmentsFolder(filePath, watchPath) ||
            isCollectionRootFile(filePath, watchPath) ||
            isFolderRootFile(filePath, watchPath)) {
          priorityFiles.push(filePath);
        } else {
          requestFiles.push(filePath);
        }
      }

      // Process config/env/root files first (sequential - sets up collection state)
      const hasDotEnv = priorityFiles.some(f => isDotEnvFile(f, watchPath));
      for (const filePath of priorityFiles) {
        await this.handleFileAdd(filePath, collectionUid, watchPath, useWorkerThread);
      }

      // If no .env file was found, still send system process.env variables
      // so {{process.env.VAR}} highlights correctly in the editor
      if (!hasDotEnv && messageSender) {
        messageSender('main:process-env-update', {
          collectionUid,
          processEnvVariables: getProcessEnvVars(collectionUid)
        });
      }

      // Process request files in parallel batches for faster loading
      const BATCH_SIZE = 5;
      for (let i = 0; i < requestFiles.length; i += BATCH_SIZE) {
        const batch = requestFiles.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(filePath => this.handleFileAdd(filePath, collectionUid, watchPath, useWorkerThread))
        );
      }

      const uiStateSnapshotStore = new UiStateSnapshot();
      const collectionsSnapshotState = uiStateSnapshotStore.getCollections();
      const posixWatchPath = posixifyPath(watchPath);
      const collectionSnapshotState = collectionsSnapshotState?.find(
        (c: { pathname?: string }) => c?.pathname === watchPath || c?.pathname === posixWatchPath
      );

      if (messageSender && collectionSnapshotState) {
        messageSender('main:hydrate-app-with-ui-state-snapshot', collectionSnapshotState);
      }

      this.completeCollectionDiscovery(collectionUid);
    } catch (error) {
      console.error('[Watcher] Error during initial scan:', error);
      this.completeCollectionDiscovery(collectionUid);
    }
  }

  private async scanDirectoryRecursive(dir: string, extension: string): Promise<{ files: string[]; directories: string[] }> {
    const files: string[] = [];
    const directories: string[] = [];

    const scanDir = async (currentDir: string) => {
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);

          if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'environments') {
              directories.push(fullPath);
              await scanDir(fullPath);
            }
          } else if (entry.isFile() && entry.name.endsWith(`.${extension}`)) {
            files.push(fullPath);
          }
        }
      } catch (err) {
        console.error('[Watcher] Error scanning directory:', currentDir, err);
      }
    };

    await scanDir(dir);
    return { files, directories };
  }

  private async handleDirectoryAdd(
    pathname: string,
    collectionUid: string,
    collectionPath: string
  ): Promise<void> {
    // Skip the environments directory
    const envDirectory = path.join(collectionPath, 'environments');
    if (path.normalize(pathname) === path.normalize(envDirectory)) {
      return;
    }

    const folderBasename = path.basename(pathname);
    let name = folderBasename;
    let seq: number | undefined;

    const format = getCollectionFormat(collectionPath);
    const folderFilePath = path.join(pathname, `folder.${format}`);

    try {
      if (fs.existsSync(folderFilePath)) {
        const folderFileContent = fs.readFileSync(folderFilePath, 'utf8');
        const folderData = await parseFolder(folderFileContent, { format }) as { meta?: { name?: string; seq?: number } };
        // Only use parsed name if it's not the default "Untitled Folder"
        // and it's actually defined
        const parsedName = folderData?.meta?.name;
        if (parsedName && parsedName !== 'Untitled Folder') {
          name = parsedName;
        }
        seq = folderData?.meta?.seq;
      }
    } catch (error) {
      console.error(`Error occurred while parsing folder.${format} file:`, error);
    }

    const directory = {
      meta: {
        collectionUid,
        pathname: posixifyPath(pathname),
        name,
        seq,
        uid: getRequestUid(pathname)
      }
    };

    if (messageSender) {
      messageSender('main:collection-tree-updated', 'addDir', directory);
    }
  }

  private async handleFileAdd(
    pathname: string,
    collectionUid: string,
    collectionPath: string,
    useWorkerThread: boolean
  ): Promise<void> {
    if (isBrunoConfigFile(pathname, collectionPath)) {
      await this.handleBrunoConfigChange(pathname, collectionUid, collectionPath);
      return;
    }

    if (isDotEnvFile(pathname, collectionPath)) {
      await this.handleDotEnvChange(pathname, collectionUid);
      return;
    }

    if (isEnvironmentsFolder(pathname, collectionPath)) {
      await addEnvironmentFile(pathname, collectionUid, collectionPath);
      return;
    }

    if (isCollectionRootFile(pathname, collectionPath)) {
      await this.handleCollectionRootFile(pathname, collectionUid, collectionPath, 'addFile');
      return;
    }

    if (isFolderRootFile(pathname, collectionPath)) {
      await this.handleFolderRootFile(pathname, collectionUid, collectionPath, 'addFile');
      return;
    }

    const format = getCollectionFormat(collectionPath);
    if (hasRequestExtension(pathname, format)) {
      await this.handleRequestFile(pathname, collectionUid, collectionPath, useWorkerThread);
    }
  }

  private async handleFileChange(
    pathname: string,
    collectionUid: string,
    collectionPath: string
  ): Promise<void> {
    if (isBrunoConfigFile(pathname, collectionPath)) {
      await this.handleBrunoConfigChange(pathname, collectionUid, collectionPath);
      return;
    }

    if (isDotEnvFile(pathname, collectionPath)) {
      await this.handleDotEnvChange(pathname, collectionUid);
      return;
    }

    if (isEnvironmentsFolder(pathname, collectionPath)) {
      await changeEnvironmentFile(pathname, collectionUid, collectionPath);
      return;
    }

    if (isCollectionRootFile(pathname, collectionPath)) {
      await this.handleCollectionRootFile(pathname, collectionUid, collectionPath, 'change');
      return;
    }

    if (isFolderRootFile(pathname, collectionPath)) {
      await this.handleFolderRootFile(pathname, collectionUid, collectionPath, 'change');
      return;
    }

    const format = getCollectionFormat(collectionPath);
    if (hasRequestExtension(pathname, format)) {
      await this.handleRequestFileChange(pathname, collectionUid, collectionPath);
    }
  }

  private handleFileUnlink(
    pathname: string,
    collectionUid: string,
    collectionPath: string
  ): void {
    if (isEnvironmentsFolder(pathname, collectionPath)) {
      unlinkEnvironmentFile(pathname, collectionUid);
      return;
    }

    const format = getCollectionFormat(collectionPath);
    if (hasRequestExtension(pathname, format)) {
      const basename = path.basename(pathname);
      const dirname = path.dirname(pathname);

      if (basename === 'opencollection.yml' && path.normalize(dirname) === path.normalize(collectionPath)) {
        return;
      }

      const file: FileData = {
        meta: {
          collectionUid,
          pathname: posixifyPath(pathname),
          name: basename
        }
      };

      if (messageSender) {
        messageSender('main:collection-tree-updated', 'unlink', file);
      }
    }
  }

  private async handleBrunoConfigChange(
    pathname: string,
    collectionUid: string,
    collectionPath: string
  ): Promise<void> {
    try {
      const content = fs.readFileSync(pathname, 'utf8');
      let brunoConfig = JSON.parse(content);
      brunoConfig = await transformBrunoConfigAfterRead(brunoConfig, collectionPath);

      setBrunoConfig(collectionUid, brunoConfig);

      if (messageSender) {
        messageSender('main:bruno-config-update', { collectionUid, brunoConfig });
      }
    } catch (err) {
      console.error('Error handling bruno.json change:', err);
    }
  }

  private async handleDotEnvChange(pathname: string, collectionUid: string): Promise<void> {
    try {
      const content = fs.readFileSync(pathname, 'utf8');
      const jsonData = parseDotEnv(content);

      setDotEnvVars(collectionUid, jsonData);

      if (messageSender) {
        messageSender('main:process-env-update', {
          collectionUid,
          processEnvVariables: getProcessEnvVars(collectionUid)
        });
      }
    } catch (err) {
      console.error('Error handling .env change:', err);
    }
  }

  private async handleCollectionRootFile(
    pathname: string,
    collectionUid: string,
    collectionPath: string,
    action: string
  ): Promise<void> {
    const format = getCollectionFormat(collectionPath);
    const file: FileData = {
      meta: {
        collectionUid,
        pathname: posixifyPath(pathname),
        name: path.basename(pathname),
        collectionRoot: true
      }
    };

    try {
      const content = fs.readFileSync(pathname, 'utf8');
      const parsed = await parseCollection(content, { format });

      if (format === 'yml') {
        file.data = parsed.collectionRoot;
        hydrateCollectionRootWithUuid(file.data as CollectionRoot);

        if (messageSender) {
          messageSender('main:collection-tree-updated', action, file);
        }

        if (parsed.brunoConfig) {
          const brunoConfig = await transformBrunoConfigAfterRead(parsed.brunoConfig, collectionPath);
          setBrunoConfig(collectionUid, brunoConfig);

          if (messageSender) {
            messageSender('main:bruno-config-update', { collectionUid, brunoConfig });
          }
        }
      } else {
        file.data = parsed;
        hydrateCollectionRootWithUuid(file.data as CollectionRoot);

        if (messageSender) {
          messageSender('main:collection-tree-updated', action, file);
        }
      }
    } catch (err) {
      console.error('Error handling collection root file:', err);
    }
  }

  private async handleFolderRootFile(
    pathname: string,
    collectionUid: string,
    collectionPath: string,
    action: string
  ): Promise<void> {
    const file: FileData = {
      meta: {
        collectionUid,
        pathname: posixifyPath(pathname),
        name: path.basename(pathname),
        folderRoot: true
      }
    };

    try {
      const format = getCollectionFormat(collectionPath);
      const content = fs.readFileSync(pathname, 'utf8');
      file.data = await parseFolder(content, { format });

      hydrateCollectionRootWithUuid(file.data as CollectionRoot);

      if (messageSender) {
        messageSender('main:collection-tree-updated', action, file);
      }
    } catch (err) {
      console.error('Error handling folder root file:', err);
    }
  }

  private async handleRequestFile(
    pathname: string,
    collectionUid: string,
    collectionPath: string,
    useWorkerThread: boolean
  ): Promise<void> {
    this.addFileToProcessing(collectionUid, pathname);

    const file: FileData = {
      meta: {
        collectionUid,
        pathname: posixifyPath(pathname),
        name: path.basename(pathname)
      }
    };

    try {
      const fileStats = fs.statSync(pathname);
      const content = fs.readFileSync(pathname, 'utf8');

      // Skip empty files - don't add them to the collection tree
      if (!content.trim()) {
        console.log('[Watcher] Skipping empty file:', pathname);
        this.markFileAsProcessed(collectionUid, pathname);
        return;
      }

      const format = getCollectionFormat(collectionPath);

      file.data = await parseRequest(content, { format });

      file.partial = false;
      file.loading = false;
      file.size = sizeInMB(fileStats?.size);
      hydrateRequestWithUuid(file.data, pathname);

      if (messageSender) {
        messageSender('main:collection-tree-updated', 'addFile', file);
      }
    } catch (error) {
      const err = error as Error;
      console.error('[Watcher] Error parsing file:', pathname, err.message);
      file.data = { name: path.basename(pathname), type: 'http-request' };
      file.error = { message: err?.message };
      file.partial = true;
      file.loading = false;
      hydrateRequestWithUuid(file.data, pathname);

      if (messageSender) {
        messageSender('main:collection-tree-updated', 'addFile', file);
      }
    } finally {
      this.markFileAsProcessed(collectionUid, pathname);
    }
  }

  private async handleRequestFileChange(
    pathname: string,
    collectionUid: string,
    collectionPath: string
  ): Promise<void> {
    try {
      const content = fs.readFileSync(pathname, 'utf8');

      // If file becomes empty, remove it from the collection tree
      if (!content.trim()) {
        console.log('[Watcher] File is now empty, removing from tree:', pathname);
        if (messageSender) {
          messageSender('main:collection-tree-updated', 'unlink', {
            meta: { collectionUid, pathname: posixifyPath(pathname) }
          });
        }
        return;
      }

      const file: FileData = {
        meta: {
          collectionUid,
          pathname: posixifyPath(pathname),
          name: path.basename(pathname)
        }
      };

      const fileStats = fs.statSync(pathname);
      const format = getCollectionFormat(collectionPath);

      if (fileStats.size >= MAX_FILE_SIZE && format === 'bru') {
        file.data = await parseLargeRequestWithRedaction(content) as ParsedFileData;
      } else {
        file.data = await parseRequest(content, { format }) as ParsedFileData;
      }

      file.size = sizeInMB(fileStats?.size);
      hydrateRequestWithUuid(file.data, pathname);

      if (messageSender) {
        messageSender('main:collection-tree-updated', 'change', file);
      }
    } catch (err) {
      console.error('Error handling request file change:', err);
    }
  }

  hasWatcher(watchPath: string): boolean {
    return this.watchers.has(watchPath);
  }

  /**
   * Load only a single request file and its dependencies:
   * - The request file itself
   * - Parent directories and folder.bru files (folder hierarchy)
   * - Environment files
   * - Collection root file (collection.bru)
   * - .env file
   * - bruno.json config
   *
   * This is used when opening a .bru file directly to avoid loading the entire collection.
   *
   * @param requestFilePath - Path to the .bru request file
   * @param collectionUid - UID of the collection
   * @param collectionPath - Root path of the collection
   * @param targetSender - Optional webview-specific sender (if not provided, uses module messageSender which broadcasts)
   */
  async loadSingleRequest(
    requestFilePath: string,
    collectionUid: string,
    collectionPath: string,
    targetSender?: MessageSender
  ): Promise<void> {
    const sender = targetSender || messageSender;

    const format = getCollectionFormat(collectionPath);
    const filesToLoad: string[] = [];
    const directoriesToAdd: string[] = [];

    let currentDir = path.dirname(requestFilePath);
    while (path.normalize(currentDir) !== path.normalize(collectionPath) && currentDir.startsWith(collectionPath)) {
      directoriesToAdd.unshift(currentDir); // Add to front so we process from root to leaf
      currentDir = path.dirname(currentDir);
    }

    const collectionBruPath = path.join(collectionPath, 'collection.bru');
    const openCollectionYmlPath = path.join(collectionPath, 'opencollection.yml');
    if (fs.existsSync(collectionBruPath)) {
      filesToLoad.push(collectionBruPath);
    } else if (fs.existsSync(openCollectionYmlPath)) {
      filesToLoad.push(openCollectionYmlPath);
    }

    for (const dir of directoriesToAdd) {
      const folderBruPath = format === 'yml'
        ? path.join(dir, 'folder.yml')
        : path.join(dir, 'folder.bru');

      if (fs.existsSync(folderBruPath)) {
        filesToLoad.push(folderBruPath);
      }
    }

    filesToLoad.push(requestFilePath);

    const envDir = path.join(collectionPath, 'environments');
    const envExt = format === 'yml' ? '.yml' : '.bru';
    if (fs.existsSync(envDir)) {
      try {
        const envFiles = fs.readdirSync(envDir, { withFileTypes: true });
        for (const entry of envFiles) {
          if (entry.isFile() && entry.name.endsWith(envExt)) {
            filesToLoad.push(path.join(envDir, entry.name));
          }
        }
      } catch (err) {
        console.error('[Watcher] Error reading environments directory:', err);
      }
    }

    const dotEnvPath = path.join(collectionPath, '.env');
    if (fs.existsSync(dotEnvPath)) {
      await this.handleDotEnvChangeWithSender(dotEnvPath, collectionUid, sender);
    } else if (sender) {
      // Even without a .env file, send system process.env variables
      // so {{process.env.VAR}} highlights correctly in the editor
      sender('main:process-env-update', {
        collectionUid,
        processEnvVariables: getProcessEnvVars(collectionUid)
      });
    }

    const brunoJsonPath = path.join(collectionPath, 'bruno.json');
    if (fs.existsSync(brunoJsonPath)) {
      await this.handleBrunoConfigChangeWithSender(brunoJsonPath, collectionUid, collectionPath, sender);
    }

    this.initializeLoadingStateWithSender(collectionUid, sender);
    this.startCollectionDiscoveryWithSender(collectionUid, sender);

    for (const dir of directoriesToAdd) {
      const dirMeta: FileMeta = {
        collectionUid,
        pathname: posixifyPath(dir),
        name: path.basename(dir)
      };

      if (sender) {
        sender('main:collection-tree-updated', 'addDir', { meta: dirMeta });
      }
    }

    // Then process all files (collection root, folder.bru, request, environments)
    for (const filePath of filesToLoad) {
      await this.handleFileAddWithSender(filePath, collectionUid, collectionPath, false, sender);
    }

    // Complete discovery (uses targetSender)
    this.completeCollectionDiscoveryWithSender(collectionUid, sender);

    // Hydrate UI state snapshot (restore selected environment, etc.)
    const uiStateSnapshotStore = new UiStateSnapshot();
    const collectionsSnapshotState = uiStateSnapshotStore.getCollections();
    const posixCollectionPath = posixifyPath(collectionPath);
    const collectionSnapshotState = collectionsSnapshotState?.find(
      (c: { pathname?: string }) => c?.pathname === collectionPath || c?.pathname === posixCollectionPath
    );

    if (sender && collectionSnapshotState) {
      sender('main:hydrate-app-with-ui-state-snapshot', collectionSnapshotState);
    }

  }

  /**
   * Load only environment files for a collection and send them to a specific sender.
   * Used when opening the environment settings panel for an already-open collection,
   * so we can populate the panel's webview without re-scanning the entire collection.
   */
  async loadEnvironments(
    collectionPath: string,
    collectionUid: string,
    targetSender: MessageSender
  ): Promise<void> {
    const envDirPath = path.join(collectionPath, 'environments');
    if (!fs.existsSync(envDirPath)) return;

    const format = getCollectionFormat(collectionPath);
    const ext = format === 'yml' ? '.yml' : '.bru';
    const files = fs.readdirSync(envDirPath).filter(f => f.endsWith(ext));

    for (const file of files) {
      const filePath = path.join(envDirPath, file);
      await this.addEnvironmentFileWithSender(filePath, collectionUid, collectionPath, targetSender);
    }
  }

  /**
   * Setup file watchers without doing initial scan.
   * Used after loadSingleRequest to watch for future changes.
   */
  setupWatchersOnly(
    watchPath: string,
    collectionUid: string
  ): void {
    if (this.watchers.has(watchPath)) {
      const existingWatchers = this.watchers.get(watchPath)!;
      existingWatchers.forEach(w => w.dispose());
    }

    const format = getCollectionFormat(watchPath);
    const watchers: vscode.FileSystemWatcher[] = [];

    const requestPattern = format === 'yml'
      ? new vscode.RelativePattern(watchPath, '**/*.yml')
      : new vscode.RelativePattern(watchPath, '**/*.bru');

    const envExt = format === 'yml' ? 'yml' : 'bru';
    const envPattern = new vscode.RelativePattern(watchPath, `environments/*.${envExt}`);
    const configPattern = new vscode.RelativePattern(watchPath, 'bruno.json');
    const ocYmlPattern = new vscode.RelativePattern(watchPath, 'opencollection.yml');
    const dotEnvPattern = new vscode.RelativePattern(watchPath, '.env');

    const requestWatcher = vscode.workspace.createFileSystemWatcher(requestPattern);
    requestWatcher.onDidCreate(uri => this.handleFileAdd(uri.fsPath, collectionUid, watchPath, false));
    requestWatcher.onDidChange(uri => this.handleFileChange(uri.fsPath, collectionUid, watchPath));
    requestWatcher.onDidDelete(uri => this.handleFileUnlink(uri.fsPath, collectionUid, watchPath));
    watchers.push(requestWatcher);

    const envWatcher = vscode.workspace.createFileSystemWatcher(envPattern);
    envWatcher.onDidCreate(uri => addEnvironmentFile(uri.fsPath, collectionUid, watchPath));
    envWatcher.onDidChange(uri => changeEnvironmentFile(uri.fsPath, collectionUid, watchPath));
    envWatcher.onDidDelete(uri => unlinkEnvironmentFile(uri.fsPath, collectionUid));
    watchers.push(envWatcher);

    const configWatcher = vscode.workspace.createFileSystemWatcher(configPattern);
    configWatcher.onDidChange(uri => this.handleBrunoConfigChange(uri.fsPath, collectionUid, watchPath));

    const ocYmlWatcher = vscode.workspace.createFileSystemWatcher(ocYmlPattern);
    ocYmlWatcher.onDidChange(uri => this.handleFileChange(uri.fsPath, collectionUid, watchPath));
    watchers.push(ocYmlWatcher);
    watchers.push(configWatcher);

    const dotEnvWatcher = vscode.workspace.createFileSystemWatcher(dotEnvPattern);
    dotEnvWatcher.onDidCreate(uri => this.handleDotEnvChange(uri.fsPath, collectionUid));
    dotEnvWatcher.onDidChange(uri => this.handleDotEnvChange(uri.fsPath, collectionUid));
    watchers.push(dotEnvWatcher);

    this.watchers.set(watchPath, watchers);
  }

  /**
   * Load all items in a collection and send to a specific webview.
   * Used when a panel needs full collection data but the watcher already exists.
   */
  async loadFullCollection(
    collectionPath: string,
    collectionUid: string,
    targetSender: MessageSender
  ): Promise<void> {
    const sender = targetSender;
    const format = getCollectionFormat(collectionPath);
    const extension = format === 'yml' ? 'yml' : 'bru';

    this.startCollectionDiscoveryWithSender(collectionUid, sender);

    try {
      const { files, directories } = await this.scanDirectoryRecursive(collectionPath, extension);

      // Process directories first (sort by path length for parent-first ordering)
      directories.sort((a, b) => a.length - b.length);
      for (const dirPath of directories) {
        await this.handleDirectoryAddWithSender(dirPath, collectionUid, collectionPath, sender);
      }

      // Separate files by priority: config/env/root files first
      const priorityFiles: string[] = [];
      const requestFiles: string[] = [];

      for (const filePath of files) {
        if (isBrunoConfigFile(filePath, collectionPath) ||
            isDotEnvFile(filePath, collectionPath) ||
            isEnvironmentsFolder(filePath, collectionPath) ||
            isCollectionRootFile(filePath, collectionPath) ||
            isFolderRootFile(filePath, collectionPath)) {
          priorityFiles.push(filePath);
        } else {
          requestFiles.push(filePath);
        }
      }

      // Process priority files first
      const hasDotEnv = priorityFiles.some(f => isDotEnvFile(f, collectionPath));
      for (const filePath of priorityFiles) {
        await this.handleFileAddWithSender(filePath, collectionUid, collectionPath, false, sender);
      }

      // If no .env file, still send process.env variables
      if (!hasDotEnv && sender) {
        sender('main:process-env-update', {
          collectionUid,
          processEnvVariables: getProcessEnvVars(collectionUid)
        });
      }

      // Process request files in parallel batches
      const BATCH_SIZE = 5;
      for (let i = 0; i < requestFiles.length; i += BATCH_SIZE) {
        const batch = requestFiles.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(filePath => this.handleFileAddWithSender(filePath, collectionUid, collectionPath, false, sender))
        );
      }

      // Hydrate UI state snapshot
      const uiStateSnapshotStore = new UiStateSnapshot();
      const collectionsSnapshotState = uiStateSnapshotStore.getCollections();
      const posixPath = posixifyPath(collectionPath);
      const collectionSnapshotState = collectionsSnapshotState?.find(
        (c: { pathname?: string }) => c?.pathname === collectionPath || c?.pathname === posixPath
      );

      if (sender && collectionSnapshotState) {
        sender('main:hydrate-app-with-ui-state-snapshot', collectionSnapshotState);
      }

      this.completeCollectionDiscoveryWithSender(collectionUid, sender);
    } catch (error) {
      console.error('[Watcher] Error during loadFullCollection:', error);
      this.completeCollectionDiscoveryWithSender(collectionUid, sender);
    }
  }

  /**
   * Handle directory add with a specific sender
   */
  private async handleDirectoryAddWithSender(
    dirPath: string,
    collectionUid: string,
    collectionPath: string,
    sender: MessageSender | null
  ): Promise<void> {
    const dirMeta: FileMeta = {
      collectionUid,
      pathname: posixifyPath(dirPath),
      name: path.basename(dirPath)
    };

    if (sender) {
      sender('main:collection-tree-updated', 'addDir', { meta: dirMeta });
    }
  }

  removeWatcher(watchPath: string, collectionUid?: string): void {
    if (this.watchers.has(watchPath)) {
      const watchers = this.watchers.get(watchPath)!;
      watchers.forEach(w => w.dispose());
      this.watchers.delete(watchPath);
    }

    this.pathToCollectionUid.delete(watchPath);

    if (collectionUid) {
      this.cleanupLoadingState(collectionUid);
    }
  }

  getAllWatcherPaths(): string[] {
    return Array.from(this.watchers.keys());
  }

  getCollectionUidForPath(watchPath: string): string | undefined {
    return this.pathToCollectionUid.get(watchPath);
  }

  handleCollectionFolderRename(oldPath: string, newPath: string): void {
    const collectionUid = this.pathToCollectionUid.get(oldPath);
    if (!collectionUid) {
      return;
    }

    // Remove old watcher
    if (this.watchers.has(oldPath)) {
      const watchers = this.watchers.get(oldPath)!;
      watchers.forEach(w => w.dispose());
      this.watchers.delete(oldPath);
    }
    this.pathToCollectionUid.delete(oldPath);

    // Notify the webview about the path change
    if (messageSender) {
      messageSender('main:collection-folder-renamed', {
        collectionUid,
        oldPath,
        newPath
      });
    }

    // Add new watcher with updated path
    this.addWatcher(newPath, collectionUid);
  }

  dispose(): void {
    for (const [, watchers] of this.watchers) {
      watchers.forEach(w => w.dispose());
    }
    this.watchers.clear();
    this.loadingStates.clear();
    this.pathToCollectionUid.clear();
  }
}

const collectionWatcher = new CollectionWatcher();

export default collectionWatcher;
export { CollectionWatcher };
