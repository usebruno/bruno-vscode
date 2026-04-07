import * as _ from 'lodash';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as vscode from 'vscode';
import * as fsExtra from 'fs-extra';
import AdmZip from 'adm-zip';
import extractZip from 'extract-zip';
import { registerHandler, registerEventListener, sendToWebview, broadcastToAllWebviews, emit } from './handlers';
import {
  writeFile,
  hasBruExtension,
  isDirectory,
  createDirectory,
  sanitizeName,
  safeToRename,
  hasRequestExtension,
  getCollectionFormat,
  searchForRequestFiles,
  validateName,
  getCollectionStats,
  sizeInMB,
  safeWriteFileSync,
  copyPath,
  removePath,
  getPaths,
  generateUniqueName,
  isDotEnvFile,
  isBrunoConfigFile,
  isBruEnvironmentConfig,
  isCollectionRootBruFile
} from '../utils/filesystem';
import { openCollectionDialog, openCollectionsByPathname } from '../app/collections';
import { writeFileViaVSCode, isDocumentRegistered } from '../editors/dirty-state-manager';
import { generateUidBasedOnHash, stringifyJson, safeStringifyJSON, safeParseJSON } from '../utils/common';
import { moveRequestUid, deleteRequestUid, getRequestUid } from '../cache/requestUids';
import EnvironmentSecretsStore from '../store/env-secrets';
import CollectionSecurityStore from '../store/collection-security';
import UiStateSnapshotStore from '../store/ui-state-snapshot';
import LastOpenedCollections from '../store/last-opened-collections';
import { defaultWorkspaceManager } from '../store/default-workspace';
import {
  addCollectionToWorkspace as addToWorkspaceYml,
  removeCollectionFromWorkspace as removeFromWorkspaceYml,
  readWorkspaceConfig,
  getWorkspaceUid
} from '../utils/workspace-config';
import { prepareWorkspaceConfigForClient } from './workspace';
import { getEnvVars, getTreePathFromCollectionToItem, mergeVars, parseBruFileMeta, hydrateRequestWithUuid, transformRequestToSaveToFilesystem } from '../utils/collection';
import { getProcessEnvVars } from '../store/process-env';
import collectionWatcher from '../app/collection-watcher';
import { transformBrunoConfigBeforeSave } from '../utils/transformBrunoConfig';
import { REQUEST_TYPES } from '../utils/constants';

const {
  parseRequest,
  stringifyRequest,
  parseRequestViaWorker,
  stringifyRequestViaWorker,
  parseCollection,
  stringifyCollection,
  parseFolder,
  stringifyFolder,
  stringifyEnvironment,
  parseEnvironment
} = require('@usebruno/filestore');

const {
  postmanToBruno: postmanToBrunoConverter,
  openApiToBruno: openApiToBrunoConverter,
  insomniaToBruno: insomniaToBrunoConverter,
  wsdlToBruno: wsdlToBrunoConverter,
  openCollectionToBruno: openCollectionToBrunoConverter
} = require('@usebruno/converters');

const environmentSecretsStore = new EnvironmentSecretsStore();
const collectionSecurityStore = new CollectionSecurityStore();
const uiStateSnapshotStore = new UiStateSnapshotStore();

// Limits for async loading
const MAX_COLLECTION_SIZE_IN_MB = 20;
const MAX_SINGLE_FILE_SIZE_IN_COLLECTION_IN_MB = 5;
const MAX_COLLECTION_FILES_COUNT = 2000;

interface Environment {
  name: string;
  variables: Array<{ name: string; value: string; secret?: boolean; uid?: string }>;
}

interface BrunoConfig {
  version?: string;
  opencollection?: string;
  name: string;
  type: string;
  ignore?: string[];
  size?: number;
  filesCount?: number;
  [key: string]: unknown;
}

/** Message sender type for sending events to webview */
type MessageSender = (channel: string, ...args: unknown[]) => void;

interface CollectionWatcherInterface {
  hasWatcher(path: string): boolean;
  getAllWatcherPaths(): string[];
  addWatcher(watchPath: string, collectionUid: string, brunoConfig?: object, useWorkerThread?: boolean): void;
  removeWatcher(watchPath: string, collectionUid?: string): void;
  loadSingleRequest?(requestFilePath: string, collectionUid: string, collectionPath: string, targetSender?: MessageSender): Promise<void>;
  setupWatchersOnly?(watchPath: string, collectionUid: string): void;
}

const envHasSecrets = (environment: Environment): boolean => {
  const secrets = _.filter(environment.variables, (v) => v.secret);
  return secrets && secrets.length > 0;
};

const findCollectionPathByItemPath = (filePath: string): string | null => {
  const allCollectionPaths = collectionWatcher.getAllWatcherPaths();

  const sortedPaths = allCollectionPaths.sort((a, b) => b.length - a.length);

  for (const collectionPath of sortedPaths) {
    if (filePath.startsWith(collectionPath + path.sep) || filePath === collectionPath) {
      return collectionPath;
    }
  }

  return null;
};

const validatePathIsInsideCollection = (filePath: string): void => {
  const collectionPath = findCollectionPathByItemPath(filePath);

  if (!collectionPath) {
    throw new Error(`Path: ${filePath} should be inside a collection`);
  }
};

const registerCollectionIpc = (watcher: CollectionWatcherInterface): void => {
  registerHandler('renderer:create-collection', async (args) => {
    const [collectionName, collectionFolderNameInput, collectionLocation, options = {}] = args as [string, string, string, { format?: string }];

    try {
      const format = options.format || 'yml';
      const collectionFolderName = sanitizeName(collectionFolderNameInput);
      const dirPath = path.join(collectionLocation, collectionFolderName);

      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        if (files.length > 0) {
          throw new Error(`collection: ${dirPath} already exists and is not empty`);
        }
      }

      if (!validateName(path.basename(dirPath))) {
        throw new Error(`collection: invalid pathname - ${dirPath}`);
      }

      if (!fs.existsSync(dirPath)) {
        await createDirectory(dirPath);
      }

      const uid = generateUidBasedOnHash(dirPath);
      let brunoConfig: BrunoConfig = {
        version: '1',
        name: collectionName,
        type: 'collection',
        ignore: ['node_modules', '.git']
      };

      if (format === 'yml') {
        brunoConfig = {
          opencollection: '1.0.0',
          name: collectionName,
          type: 'collection',
          ignore: ['node_modules', '.git']
        };
        const content = await stringifyCollection({ meta: { name: collectionName } }, brunoConfig, { format });
        await writeFile(path.join(dirPath, 'opencollection.yml'), content);
      } else if (format === 'bru') {
        const content = await stringifyJson(brunoConfig);
        await writeFile(path.join(dirPath, 'bruno.json'), content);
      } else {
        throw new Error(`Invalid format: ${format}`);
      }

      const { size, filesCount } = await getCollectionStats(dirPath);
      brunoConfig.size = size;
      brunoConfig.filesCount = filesCount;

      const lastOpenedStore = new LastOpenedCollections();
      lastOpenedStore.add(dirPath);

      const workspacePath = defaultWorkspaceManager.getDefaultWorkspacePath();
      if (workspacePath) {
        try {
          await addToWorkspaceYml(workspacePath, { name: collectionName, path: dirPath });
          const workspaceConfig = readWorkspaceConfig(workspacePath);
          // Use the default workspace UID ('default') to match what Redux expects
          const wsUid = defaultWorkspaceManager.getDefaultWorkspaceUid();
          const configForClient = prepareWorkspaceConfigForClient(workspaceConfig, workspacePath, true);
          broadcastToAllWebviews('main:workspace-config-updated', workspacePath, wsUid, configForClient);
        } catch (err) {
          console.error('[Collection IPC] Error adding collection to workspace:', err);
        }
      }

      broadcastToAllWebviews('main:collection-opened', dirPath, uid, brunoConfig, true);
      emit('main:collection-opened', dirPath, uid, brunoConfig);

      return { success: true, collectionPath: dirPath, uid, brunoConfig };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:clone-collection', async (args) => {
    const [collectionName, collectionFolderNameInput, collectionLocation, previousPath] = args as [string, string, string, string];

    try {
      const collectionFolderName = sanitizeName(collectionFolderNameInput);
      const dirPath = path.join(collectionLocation, collectionFolderName);

      if (fs.existsSync(dirPath)) {
        throw new Error(`collection: ${dirPath} already exists`);
      }

      if (!validateName(path.basename(dirPath))) {
        throw new Error(`collection: invalid pathname - ${dirPath}`);
      }

      await createDirectory(dirPath);
      const uid = generateUidBasedOnHash(dirPath);
      const format = getCollectionFormat(previousPath);

      // Copy all files from previous collection
      const files = searchForRequestFiles(previousPath);

      for (const sourceFilePath of files) {
        const relativePath = path.relative(previousPath, sourceFilePath);
        const newFilePath = path.join(dirPath, relativePath);

        const isRootConfigFile = (path.basename(sourceFilePath) === 'opencollection.yml' || path.basename(sourceFilePath) === 'bruno.json')
          && path.dirname(sourceFilePath) === previousPath;

        if (isRootConfigFile) {
          continue;
        }

        fs.mkdirSync(path.dirname(newFilePath), { recursive: true });
        fs.copyFileSync(sourceFilePath, newFilePath);
      }

      let brunoConfig: BrunoConfig;
      if (format === 'yml') {
        brunoConfig = {
          opencollection: '1.0.0',
          name: collectionName,
          type: 'collection',
          ignore: ['node_modules', '.git']
        };
        const content = await stringifyCollection({ meta: { name: collectionName } }, brunoConfig, { format });
        await writeFile(path.join(dirPath, 'opencollection.yml'), content);
      } else {
        brunoConfig = {
          version: '1',
          name: collectionName,
          type: 'collection',
          ignore: ['node_modules', '.git']
        };
        const content = await stringifyJson(brunoConfig);
        await writeFile(path.join(dirPath, 'bruno.json'), content);
      }

      const { size, filesCount } = await getCollectionStats(dirPath);
      brunoConfig.size = size;
      brunoConfig.filesCount = filesCount;

      broadcastToAllWebviews('main:collection-opened', dirPath, uid, brunoConfig, true);
      emit('main:collection-opened', dirPath, uid);

      return { success: true, collectionPath: dirPath };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:rename-collection', async (args) => {
    const [newName, collectionPathname] = args as [string, string];

    try {
      const format = getCollectionFormat(collectionPathname);

      if (format === 'yml') {
        const configFilePath = path.join(collectionPathname, 'opencollection.yml');
        const content = fs.readFileSync(configFilePath, 'utf8');
        const parsed = await parseCollection(content, { format: 'yml' });
        const brunoConfig = parsed.brunoConfig as BrunoConfig;
        brunoConfig.name = newName;
        const newContent = await stringifyCollection(parsed.collectionRoot, brunoConfig, { format: 'yml' });
        await writeFile(path.join(collectionPathname, 'opencollection.yml'), newContent);
      } else if (format === 'bru') {
        const configFilePath = path.join(collectionPathname, 'bruno.json');
        const content = fs.readFileSync(configFilePath, 'utf8');
        const brunoConfig = JSON.parse(content) as BrunoConfig;
        brunoConfig.name = newName;
        const newContent = await stringifyJson(brunoConfig);
        await writeFile(path.join(collectionPathname, 'bruno.json'), newContent);
      } else {
        throw new Error(`Invalid format: ${format}`);
      }

      broadcastToAllWebviews('main:collection-renamed', { collectionPathname, newName });

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:open-collection', async () => {
    try {
      await openCollectionDialog(watcher as Parameters<typeof openCollectionDialog>[0]);
      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:open-collection-by-path', async (args) => {
    const [collectionPaths] = args as [string[]];

    try {
      await openCollectionsByPathname(watcher as Parameters<typeof openCollectionsByPathname>[0], collectionPaths);
      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:close-collection', async (args) => {
    const [collectionPath] = args as [string];

    try {
      watcher.removeWatcher(collectionPath);

      const lastOpenedStore = new LastOpenedCollections();
      lastOpenedStore.remove(collectionPath);

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:remove-collection', async (args) => {
    const [collectionPath, _collectionUid, workspaceId] = args as [string, string, string];

    try {
      watcher.removeWatcher(collectionPath);

      const lastOpenedStore = new LastOpenedCollections();
      lastOpenedStore.remove(collectionPath);

      let workspacePath: string | null = null;
      if (workspaceId === 'default' || !workspaceId) {
        workspacePath = defaultWorkspaceManager.getDefaultWorkspacePath();
      } else {
        workspacePath = workspaceId;
      }

      if (workspacePath) {
        try {
          const result = await removeFromWorkspaceYml(workspacePath, collectionPath);
          // Use defaultWorkspaceManager UID ('default') to match what Redux expects
          const wsUid = (workspaceId === 'default' || !workspaceId)
            ? defaultWorkspaceManager.getDefaultWorkspaceUid()
            : getWorkspaceUid(workspacePath);
          const isDefault = wsUid === 'default';
          const configForClient = prepareWorkspaceConfigForClient(result.updatedConfig, workspacePath, isDefault);
          broadcastToAllWebviews('main:workspace-config-updated', workspacePath, wsUid, configForClient);
        } catch (err) {
          console.error('[Collection IPC] Error removing collection from workspace.yml:', err);
        }
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:new-request', async (args) => {
    const [pathname, request] = args as [string, { filename?: string; [key: string]: unknown }];

    try {
      if (fs.existsSync(pathname)) {
        throw new Error(`path: ${pathname} already exists`);
      }

      const collectionPath = findCollectionPathByItemPath(pathname);
      if (!collectionPath) {
        throw new Error('Collection not found for the given pathname');
      }

      const format = getCollectionFormat(collectionPath);
      const baseFilename = request?.filename?.replace(`.${format}`, '');
      if (!validateName(baseFilename || '')) {
        throw new Error(`${request.filename} is not a valid filename`);
      }

      validatePathIsInsideCollection(pathname);

      const content = await stringifyRequestViaWorker(request, { format });
      await writeFile(pathname, content);

      const uri = vscode.Uri.file(pathname);
      await vscode.commands.executeCommand('vscode.openWith', uri, 'bruno.requestEditor');

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:save-request', async (args) => {
    const [pathname, request, format] = args as [string, unknown, string];

    try {
      if (!fs.existsSync(pathname)) {
        throw new Error(`path: ${pathname} does not exist`);
      }

      const content = await stringifyRequestViaWorker(request, { format });

      // Use VS Code-aware write if the file is open in a custom editor
      if (isDocumentRegistered(pathname)) {
        await writeFileViaVSCode(pathname, content);
      } else {
        await writeFile(pathname, content);
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:new-folder', async (args) => {
    const [pathname, collectionPath] = args as [string, string];

    try {
      const resolvedFolderName = sanitizeName(path.basename(pathname));
      const resolvedPathname = path.join(path.dirname(pathname), resolvedFolderName);

      if (fs.existsSync(resolvedPathname)) {
        throw new Error(`folder: ${resolvedPathname} already exists`);
      }

      validatePathIsInsideCollection(resolvedPathname);

      fs.mkdirSync(resolvedPathname);

      const format = getCollectionFormat(collectionPath);
      const folderData = {
        meta: {
          name: resolvedFolderName
        }
      };
      const folderFilePath = path.join(resolvedPathname, `folder.${format}`);
      const content = await stringifyFolder(folderData, { format });
      await writeFile(folderFilePath, content);

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:create-environment', async (args) => {
    const [collectionPathname, name, variables] = args as [string, string, Array<{ name: string; value: string }>];

    try {
      const envDirPath = path.join(collectionPathname, 'environments');
      if (!fs.existsSync(envDirPath)) {
        await createDirectory(envDirPath);
      }

      const format = getCollectionFormat(collectionPathname);
      const existingFiles = fs.existsSync(envDirPath) ? fs.readdirSync(envDirPath) : [];
      const existingEnvNames = existingFiles
        .filter((file) => file.endsWith(`.${format}`))
        .map((file) => path.basename(file, `.${format}`));

      const sanitizedName = sanitizeName(name);
      const uniqueName = generateUniqueName(sanitizedName, (n) => existingEnvNames.includes(n));
      const envFilePath = path.join(envDirPath, `${uniqueName}.${format}`);

      const environment: Environment = {
        name: uniqueName,
        variables: variables || []
      };

      if (envHasSecrets(environment)) {
        environmentSecretsStore.storeEnvSecrets(collectionPathname, environment);
      }

      const content = await stringifyEnvironment(environment, { format });
      await writeFile(envFilePath, content);

      return { success: true, name: uniqueName };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:save-environment', async (args) => {
    const [collectionPathname, environment] = args as [string, Environment];

    try {
      const envDirPath = path.join(collectionPathname, 'environments');
      if (!fs.existsSync(envDirPath)) {
        await createDirectory(envDirPath);
      }

      const format = getCollectionFormat(collectionPathname);
      const envFilePath = path.join(envDirPath, `${environment.name}.${format}`);

      if (!fs.existsSync(envFilePath)) {
        throw new Error(`environment: ${envFilePath} does not exist`);
      }

      if (envHasSecrets(environment)) {
        environmentSecretsStore.storeEnvSecrets(collectionPathname, environment);
      }

      const content = await stringifyEnvironment(environment, { format });
      await writeFile(envFilePath, content);

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:delete-environment', async (args) => {
    const [collectionPathname, environmentName] = args as [string, string];

    try {
      const format = getCollectionFormat(collectionPathname);
      const envFilePath = path.join(collectionPathname, 'environments', `${environmentName}.${format}`);

      if (!fs.existsSync(envFilePath)) {
        throw new Error(`environment: ${envFilePath} does not exist`);
      }

      fs.unlinkSync(envFilePath);

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:rename-environment', async (args) => {
    const [collectionPathname, environmentName, newName] = args as [string, string, string];

    try {
      const format = getCollectionFormat(collectionPathname);
      const envDirPath = path.join(collectionPathname, 'environments');
      const envFilePath = path.join(envDirPath, `${environmentName}.${format}`);

      if (!fs.existsSync(envFilePath)) {
        throw new Error(`environment: ${envFilePath} does not exist`);
      }

      const newEnvFilePath = path.join(envDirPath, `${newName}.${format}`);
      if (!safeToRename(envFilePath, newEnvFilePath)) {
        throw new Error(`environment: ${newEnvFilePath} already exists`);
      }

      fs.renameSync(envFilePath, newEnvFilePath);

      environmentSecretsStore.renameEnvironment(collectionPathname, environmentName, newName);

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  // Rename item (file/folder)
  registerHandler('renderer:rename-item', async (args) => {
    const [oldPath, newPath, newName] = args as [string, string, string];

    try {
      if (!fs.existsSync(oldPath)) {
        throw new Error(`path: ${oldPath} does not exist`);
      }

      if (!safeToRename(oldPath, newPath)) {
        throw new Error(`path: ${newPath} already exists`);
      }

      const collectionPath = findCollectionPathByItemPath(oldPath);
      const format = collectionPath ? getCollectionFormat(collectionPath) : 'bru';

      if (isDirectory(oldPath)) {
        // For folders: update the name inside folder.bru/folder.yml before renaming
        const folderFilePath = path.join(oldPath, `folder.${format}`);
        if (fs.existsSync(folderFilePath)) {
          const oldContent = fs.readFileSync(folderFilePath, 'utf8');
          const folderJson = await parseFolder(oldContent, { format });
          folderJson.meta = folderJson.meta || {};
          folderJson.meta.name = newName;
          const newContent = await stringifyFolder(folderJson, { format });
          await writeFile(folderFilePath, newContent);
        }

        // Collect request files before rename for UID mapping updates
        const itemCollectionPath = collectionPath;
        const collectionUid = itemCollectionPath ? generateUidBasedOnHash(itemCollectionPath) : null;
        const requestFiles = itemCollectionPath ? searchForRequestFiles(oldPath, itemCollectionPath) : [];

        fs.renameSync(oldPath, newPath);

        for (const oldFilePath of requestFiles) {
          const newFilePath = oldFilePath.replace(oldPath, newPath);
          moveRequestUid(oldFilePath, newFilePath);
        }

        // VS Code FileSystemWatcher doesn't reliably fire events for files
        // inside renamed directories. Manually broadcast unlinkDir for the old
        // folder, then broadcast addFile for all files in the new folder.
        if (collectionUid && itemCollectionPath) {
          broadcastToAllWebviews('main:collection-tree-updated', 'unlinkDir', {
            directory: { pathname: oldPath },
            meta: {
              collectionUid,
              pathname: oldPath,
              name: path.basename(oldPath)
            }
          });

          // Scan the new folder and broadcast addFile events for all .bru files
          const newFiles = searchForRequestFiles(newPath, itemCollectionPath);
          for (const filePath of newFiles) {
            try {
              const basename = path.basename(filePath);
              const isFolderRoot = basename === `folder.${format}`;

              const content = fs.readFileSync(filePath, 'utf8');

              if (isFolderRoot) {
                const folderData = await parseFolder(content, { format });
                broadcastToAllWebviews('main:collection-tree-updated', 'addFile', {
                  meta: {
                    collectionUid,
                    pathname: filePath,
                    name: basename,
                    folderRoot: true
                  },
                  data: folderData
                });
              } else if (hasRequestExtension(filePath, format)) {
                const requestData = await parseRequest(content, { format });
                const fileStats = fs.statSync(filePath);
                hydrateRequestWithUuid(requestData, filePath);
                broadcastToAllWebviews('main:collection-tree-updated', 'addFile', {
                  meta: {
                    collectionUid,
                    pathname: filePath,
                    name: basename
                  },
                  data: requestData,
                  partial: false,
                  loading: false,
                  size: sizeInMB(fileStats.size)
                });
              }
            } catch (err) {
              console.error('[rename-item] Error broadcasting addFile for:', filePath, err);
            }
          }
        }
      } else if (hasRequestExtension(oldPath, format)) {
        // For request files: update the name inside the .bru file before renaming
        const oldContent = fs.readFileSync(oldPath, 'utf8');
        const requestJson = await parseRequest(oldContent, { format });
        requestJson.name = newName;
        const newContent = await stringifyRequest(requestJson, { format });
        await writeFile(oldPath, newContent);

        fs.renameSync(oldPath, newPath);
        moveRequestUid(oldPath, newPath);
      } else {
        // Fallback for other file types
        fs.renameSync(oldPath, newPath);
        if (fs.statSync(newPath).isFile()) {
          moveRequestUid(oldPath, newPath);
        }
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:delete-item', async (args) => {
    const [itemPath, collectionPath] = args as [string, string];

    try {
      if (!fs.existsSync(itemPath)) {
        throw new Error(`path: ${itemPath} does not exist`);
      }

      validatePathIsInsideCollection(itemPath);

      const closeTabsForPath = async (filePath: string) => {
        const uri = vscode.Uri.file(filePath);
        for (const tabGroup of vscode.window.tabGroups.all) {
          for (const tab of tabGroup.tabs) {
            const tabInput = tab.input;
            if (tabInput && typeof tabInput === 'object' && 'uri' in tabInput) {
              const tabUri = (tabInput as { uri: vscode.Uri }).uri;
              if (tabUri.fsPath === uri.fsPath) {
                await vscode.window.tabGroups.close(tab);
              }
            }
          }
        }
      };

      const collectionUid = generateUidBasedOnHash(collectionPath);
      const stats = fs.statSync(itemPath);
      if (stats.isDirectory()) {
        const requestFiles = await searchForRequestFiles(itemPath, collectionPath);

        // Close tabs for all request files in the directory
        for (const requestFile of requestFiles) {
          await closeTabsForPath(requestFile);
          deleteRequestUid(requestFile);
        }

        fs.rmSync(itemPath, { recursive: true, force: true });

        // Manually broadcast unlinkDir event since VS Code FileSystemWatcher
        // only watches file patterns (e.g. **/*.bru), not directories
        broadcastToAllWebviews('main:collection-tree-updated', 'unlinkDir', {
          directory: {
            pathname: itemPath
          },
          meta: {
            collectionUid,
            pathname: itemPath,
            name: path.basename(itemPath)
          }
        });
      } else {
        // Close tab for the single file being deleted
        await closeTabsForPath(itemPath);
        fs.unlinkSync(itemPath);
        deleteRequestUid(itemPath);
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  // Move item (drag & drop)
  registerHandler('renderer:move-item', async (args) => {
    const [{ targetDirname, sourcePathname }] = args as [{ targetDirname: string; sourcePathname: string }];

    try {
      if (!fs.existsSync(targetDirname)) {
        throw new Error(`target directory: ${targetDirname} does not exist`);
      }
      if (!fs.existsSync(sourcePathname)) {
        throw new Error(`source: ${sourcePathname} does not exist`);
      }

      validatePathIsInsideCollection(sourcePathname);

      const sourceDirname = path.dirname(sourcePathname);
      const pathnamesBefore = await getPaths(sourcePathname);
      const pathnamesAfter = pathnamesBefore?.map((p) => p?.replace(sourceDirname, targetDirname));
      await copyPath(sourcePathname, targetDirname);
      await removePath(sourcePathname);
      // Move the request uids of the previous file/folders to the new file/folder items
      pathnamesAfter?.forEach((_, index) => {
        moveRequestUid(pathnamesBefore[index], pathnamesAfter[index]);
      });

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:clone-folder', async (args) => {
    const [itemFolder, collectionPath, collectionPathname] = args as [any, string, string];

    try {
      if (fs.existsSync(collectionPath)) {
        throw new Error(`folder: ${collectionPath} already exists`);
      }

      validatePathIsInsideCollection(collectionPath);

      const format = getCollectionFormat(collectionPathname);

      // Recursively clone the folder structure
      const cloneFolderRecursive = async (sourceItem: any, destPath: string) => {
        fs.mkdirSync(destPath, { recursive: true });

        if (sourceItem.root) {
          const folderContent = await stringifyFolder(sourceItem.root, { format });
          await writeFile(path.join(destPath, `folder.${format}`), folderContent);
        } else {
          const folderData = { meta: { name: sourceItem.name || path.basename(destPath) } };
          const folderContent = await stringifyFolder(folderData, { format });
          await writeFile(path.join(destPath, `folder.${format}`), folderContent);
        }

        for (const child of (sourceItem.items || [])) {
          if (child.type === 'folder') {
            await cloneFolderRecursive(child, path.join(destPath, child.filename));
          } else {
            // Clone request file - copy the source file directly
            if (child.pathname && fs.existsSync(child.pathname)) {
              const destFilePath = path.join(destPath, child.filename);
              fs.copyFileSync(child.pathname, destFilePath);
            }
          }
        }
      };

      await cloneFolderRecursive(itemFolder, collectionPath);

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:copy-item', async (args) => {
    const [sourcePath, destinationPath] = args as [string, string];

    try {
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`source: ${sourcePath} does not exist`);
      }

      if (fs.existsSync(destinationPath)) {
        throw new Error(`destination: ${destinationPath} already exists`);
      }

      await copyPath(sourcePath, destinationPath);

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:save-bruno-config', async (args) => {
    const [collectionPath, brunoConfig] = args as [string, BrunoConfig];

    try {
      const format = getCollectionFormat(collectionPath);
      const configFilePath = format === 'yml'
        ? path.join(collectionPath, 'opencollection.yml')
        : path.join(collectionPath, 'bruno.json');

      const transformedConfig = transformBrunoConfigBeforeSave(brunoConfig);

      if (format === 'yml') {
        // For YML, need to merge with collection root
        const content = fs.readFileSync(configFilePath, 'utf8');
        const parsed = await parseCollection(content, { format });
        const newContent = await stringifyCollection(parsed.collectionRoot, transformedConfig, { format });
        await writeFile(configFilePath, newContent);
      } else {
        const content = await stringifyJson(transformedConfig);
        await writeFile(configFilePath, content);
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  // Handler for updating bruno.json with new brunoConfig (e.g., when adding protofiles/import paths)
  // This is called from useProtoFileManagement and other places that update brunoConfig
  registerHandler('renderer:update-bruno-config', async (args) => {
    const [brunoConfig, collectionPath, collectionRoot] = args as [BrunoConfig, string, Record<string, unknown>];

    try {
      const format = getCollectionFormat(collectionPath);
      const transformedConfig = transformBrunoConfigBeforeSave(brunoConfig);

      if (format === 'yml') {
        const configFilePath = path.join(collectionPath, 'opencollection.yml');
        const content = await stringifyCollection(collectionRoot, transformedConfig, { format });
        await writeFile(configFilePath, content);
      } else {
        const configFilePath = path.join(collectionPath, 'bruno.json');
        const content = await stringifyJson(transformedConfig);
        await writeFile(configFilePath, content);
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:save-ui-state-snapshot', async (args) => {
    const [collections] = args as [unknown[]];

    try {
      uiStateSnapshotStore.saveUiStateSnapshot(collections);
      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:update-ui-state-snapshot', async (args) => {
    const [payload] = args as [{ type: string; data: { collectionPath: string; environmentName: string } }];

    try {
      uiStateSnapshotStore.update(payload);

      // Broadcast collection env change to all tabs so other tabs of the same collection update
      if (payload.type === 'COLLECTION_ENVIRONMENT' && payload.data?.collectionPath) {
        const collectionSnapshot = uiStateSnapshotStore.getCollectionByPathname({
          pathname: payload.data.collectionPath
        });
        broadcastToAllWebviews('main:hydrate-app-with-ui-state-snapshot', collectionSnapshot);
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  // Note: When opening a single .bru file, we use openCollectionForSingleRequest which handles
  // loading only the necessary files. This event listener is for cases where we want to load
  // the full collection (e.g., opening from sidebar "Open Collection" dialog).
  // The skipFullLoad flag indicates the caller will handle file loading separately.
  registerEventListener('main:collection-opened', (collectionPath: unknown, uid: unknown, brunoConfig: unknown, skipFullLoad?: unknown) => {
    // Skip full collection load if skipFullLoad flag is set (e.g., single request mode)
    if (skipFullLoad === true) {
      return;
    }

    if (watcher && typeof collectionPath === 'string' && typeof uid === 'string') {
      const { size, filesCount } = (brunoConfig as BrunoConfig) || { size: 0, filesCount: 0 };
      const useWorkerThread = (size || 0) >= MAX_COLLECTION_SIZE_IN_MB || (filesCount || 0) >= MAX_COLLECTION_FILES_COUNT;
      watcher.addWatcher(collectionPath, uid, brunoConfig as object, useWorkerThread);
    }
  });

  registerHandler('renderer:save-folder-root', async (args) => {
    const [folder] = args as [{ name: string; folderPathname: string; collectionPathname: string; root: Record<string, unknown> }];

    try {
      const { name: folderName, root: folderRoot = {}, folderPathname, collectionPathname } = folder;

      const format = getCollectionFormat(collectionPathname);
      const folderFilePath = path.join(folderPathname, `folder.${format}`);

      if (!folderRoot.meta) {
        folderRoot.meta = {
          name: folderName
        };
      }

      const content = await stringifyFolder(folderRoot, { format });

      // Use VS Code-aware write if the file is open in a custom editor
      if (isDocumentRegistered(folderFilePath)) {
        await writeFileViaVSCode(folderFilePath, content);
      } else {
        await writeFile(folderFilePath, content);
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:save-collection-root', async (args) => {
    const [collectionPathname, collectionRoot, brunoConfig] = args as [string, Record<string, unknown>, BrunoConfig];

    try {
      const format = getCollectionFormat(collectionPathname);
      const filename = format === 'yml' ? 'opencollection.yml' : 'collection.bru';
      const content = await stringifyCollection(collectionRoot, brunoConfig, { format });
      const filePath = path.join(collectionPathname, filename);

      // Use VS Code-aware write if the file is open in a custom editor
      if (isDocumentRegistered(filePath)) {
        await writeFileViaVSCode(filePath, content);
      } else {
        await writeFile(filePath, content);
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  // Additional handlers to be implemented:
  // - renderer:save-multiple-requests
  // - renderer:copy-environment
  // - renderer:export-collection

  registerHandler('renderer:import-collection', async (args) => {
    const [collection, collectionLocation, format = 'yml'] = args as [any, string, string];

    try {
      const collectionName = collection.name || 'Imported Collection';
      const collectionFolderName = sanitizeName(collectionName);
      const dirPath = path.join(collectionLocation, collectionFolderName);

      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        if (files.length > 0) {
          throw new Error(`collection: ${dirPath} already exists and is not empty`);
        }
      }

      if (!fs.existsSync(dirPath)) {
        await createDirectory(dirPath);
      }

      const uid = generateUidBasedOnHash(dirPath);

      // Use existing brunoConfig from collection if available, otherwise create new
      let brunoConfig: BrunoConfig = collection.brunoConfig || (format === 'yml'
        ? {
            opencollection: '1.0.0',
            name: collectionName,
            type: 'collection',
            ignore: ['node_modules', '.git']
          }
        : {
            version: '1',
            name: collectionName,
            type: 'collection',
            ignore: ['node_modules', '.git']
          });

      if (format === 'yml') {
        const content = await stringifyCollection(collection.root || { meta: { name: collectionName } }, brunoConfig, { format });
        await writeFile(path.join(dirPath, 'opencollection.yml'), content);
      } else {
        const content = await stringifyJson(brunoConfig);
        await writeFile(path.join(dirPath, 'bruno.json'), content);

        // Write collection.bru for BRU format (contains collection root settings)
        const collectionContent = await stringifyCollection(collection.root || { meta: { name: collectionName } }, brunoConfig, { format });
        await writeFile(path.join(dirPath, 'collection.bru'), collectionContent);
      }

      if (collection.environments && Array.isArray(collection.environments)) {
        const envDir = path.join(dirPath, 'environments');
        if (!fs.existsSync(envDir)) {
          await createDirectory(envDir);
        }
        for (const env of collection.environments) {
          if (env.name && env.variables) {
            const envContent = await stringifyEnvironment(env, { format });
            const ext = format === 'yml' ? 'yml' : 'bru';
            await writeFile(path.join(envDir, `${sanitizeName(env.name)}.${ext}`), envContent);
          }
        }
      }

      const getFilenameWithFormat = (item: any, fmt: string): string => {
        if (item?.filename) {
          const ext = path.extname(item.filename);
          if (ext === '.bru' || ext === '.yml') {
            return item.filename.replace(ext, `.${fmt}`);
          }
          return item.filename;
        }
        return `${item.name}.${fmt}`;
      };

      // Recursively write items (requests and folders)
      const writeItems = async (items: any[], parentDir: string) => {
        if (!items || !Array.isArray(items)) return;

        for (const item of items) {
          const isRequestType = ['http-request', 'graphql-request', 'grpc-request', 'ws-request'].includes(item.type);
          if (!isRequestType && (item.type === 'folder' || (item.items && Array.isArray(item.items) && item.items.length > 0))) {
            const folderName = sanitizeName(item?.filename || item?.name || 'folder');
            const folderDir = path.join(parentDir, folderName);
            if (!fs.existsSync(folderDir)) {
              await createDirectory(folderDir);
            }

            if (item?.root?.meta?.name) {
              try {
                item.root.meta.seq = item.seq;
                const folderContent = await stringifyFolder(item.root, { format });
                const ext = format === 'yml' ? 'yml' : 'bru';
                await writeFile(path.join(folderDir, `folder.${ext}`), folderContent);
              } catch (_) {
                // Skip folder config if serialization fails
              }
            }

            await writeItems(item.items, folderDir);
          } else if (isRequestType) {
            const filename = sanitizeName(getFilenameWithFormat(item, format));
            try {
              const requestContent = await stringifyRequestViaWorker(item, { format });
              await writeFile(path.join(parentDir, filename), requestContent);
            } catch (err) {
              console.error(`[Import] Failed to write request "${item.name}":`, err);
              // Continue with remaining items
            }
          } else if (item.type === 'js') {
            const filename = sanitizeName(item?.filename || `${item.name}.js`);
            await writeFile(path.join(parentDir, filename), item.fileContent || '');
          }
        }
      };

      await writeItems(collection.items, dirPath);

      const { size, filesCount } = await getCollectionStats(dirPath);
      brunoConfig.size = size;
      brunoConfig.filesCount = filesCount;

      const lastOpenedStore = new LastOpenedCollections();
      lastOpenedStore.add(dirPath);

      const workspacePath = defaultWorkspaceManager.getDefaultWorkspacePath();
      if (workspacePath) {
        try {
          await addToWorkspaceYml(workspacePath, { name: collectionName, path: dirPath });
          const workspaceConfig = readWorkspaceConfig(workspacePath);
          const wsUid = defaultWorkspaceManager.getDefaultWorkspaceUid();
          const configForClient = prepareWorkspaceConfigForClient(workspaceConfig, workspacePath, true);
          broadcastToAllWebviews('main:workspace-config-updated', workspacePath, wsUid, configForClient);
        } catch (err) {
          console.error('[Collection IPC] Error adding collection to workspace:', err);
        }
      }

      broadcastToAllWebviews('main:collection-opened', dirPath, uid, brunoConfig, true);
      emit('main:collection-opened', dirPath, uid, brunoConfig);

      return dirPath;
    } catch (error) {
      throw error;
    }
  });

  // --- Collection format conversion handlers ---
  // These run on the extension (Node.js) side because @usebruno/converters
  // uses worker_threads which are not available in the webview (browser).

  registerHandler('renderer:convert-postman-to-bruno', async (args) => {
    const [postmanCollection] = args as [any];
    try {
      return await postmanToBrunoConverter(postmanCollection);
    } catch (error) {
      console.error('[Collection IPC] Error converting Postman to Bruno:', error);
      throw error;
    }
  });

  registerHandler('renderer:convert-openapi-to-bruno', async (args) => {
    const [openapiSpec, options] = args as [any, any];
    try {
      return await openApiToBrunoConverter(openapiSpec, options || {});
    } catch (error) {
      console.error('[Collection IPC] Error converting OpenAPI to Bruno:', error);
      throw error;
    }
  });

  registerHandler('renderer:convert-insomnia-to-bruno', async (args) => {
    const [insomniaCollection] = args as [any];
    try {
      return await insomniaToBrunoConverter(insomniaCollection);
    } catch (error) {
      console.error('[Collection IPC] Error converting Insomnia to Bruno:', error);
      throw error;
    }
  });

  registerHandler('renderer:convert-wsdl-to-bruno', async (args) => {
    const [wsdlData] = args as [string];
    try {
      return await wsdlToBrunoConverter(wsdlData);
    } catch (error) {
      console.error('[Collection IPC] Error converting WSDL to Bruno:', error);
      throw error;
    }
  });

  registerHandler('renderer:convert-opencollection-to-bruno', async (args) => {
    const [openCollectionData] = args as [any];
    try {
      return await openCollectionToBrunoConverter(openCollectionData);
    } catch (error) {
      console.error('[Collection IPC] Error converting OpenCollection to Bruno:', error);
      throw error;
    }
  });

  // --- ZIP collection import handlers ---

  // Receives base64-encoded ZIP data from webview, saves to temp file,
  // validates it's a Bruno collection, and returns the temp path.
  registerHandler('renderer:validate-and-save-zip', async (args) => {
    const [base64Data, fileName] = args as [string, string];
    try {
      const tempDir = path.join(os.tmpdir(), `bruno_zip_upload_${Date.now()}`);
      await fsExtra.ensureDir(tempDir);
      const tempZipPath = path.join(tempDir, sanitizeName(fileName) || 'collection.zip');

      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(tempZipPath, buffer);

      // Validate it's a Bruno collection ZIP
      const zip = new AdmZip(tempZipPath);
      const entries = zip.getEntries().map((e) => e.entryName);
      const valid = entries.some(
        (name) =>
          name === 'bruno.json'
          || name === 'opencollection.yml'
          || /^[^/]+\/bruno\.json$/.test(name)
          || /^[^/]+\/opencollection\.yml$/.test(name)
      );

      if (!valid) {
        await fsExtra.remove(tempDir).catch(() => {});
      }

      return { valid, tempZipPath: valid ? tempZipPath : '' };
    } catch (error) {
      console.error('[Collection IPC] Error validating ZIP:', error);
      return { valid: false, tempZipPath: '' };
    }
  });

  registerHandler('renderer:is-bruno-collection-zip', async (args) => {
    const [zipFilePath] = args as [string];
    try {
      const zip = new AdmZip(zipFilePath);
      const entries = zip.getEntries().map((e) => e.entryName);

      return entries.some(
        (name) =>
          name === 'bruno.json'
          || name === 'opencollection.yml'
          || /^[^/]+\/bruno\.json$/.test(name)
          || /^[^/]+\/opencollection\.yml$/.test(name)
      );
    } catch {
      return false;
    }
  });

  registerHandler('renderer:import-collection-zip', async (args) => {
    const [zipFilePath, collectionLocation] = args as [string, string];

    try {
      if (!fs.existsSync(zipFilePath)) {
        throw new Error('ZIP file does not exist');
      }

      if (!collectionLocation || !fs.existsSync(collectionLocation)) {
        throw new Error('Collection location does not exist');
      }

      const tempDir = path.join(os.tmpdir(), `bruno_zip_import_${Date.now()}`);
      await fsExtra.ensureDir(tempDir);

      // Validates that no symlinks point outside the base directory
      const validateNoExternalSymlinks = (dir: string, baseDir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const stat = fs.lstatSync(fullPath);

          if (stat.isSymbolicLink()) {
            const linkTarget = fs.readlinkSync(fullPath);
            const resolvedTarget = path.resolve(path.dirname(fullPath), linkTarget);
            if (!resolvedTarget.startsWith(baseDir + path.sep) && resolvedTarget !== baseDir) {
              throw new Error(`Security error: Symlink "${entry.name}" points outside extraction directory`);
            }
          }

          if (stat.isDirectory() && !stat.isSymbolicLink()) {
            validateNoExternalSymlinks(fullPath, baseDir);
          }
        }
      };

      try {
        await extractZip(zipFilePath, { dir: tempDir });

        validateNoExternalSymlinks(tempDir, tempDir);

        const extractedItems = fs.readdirSync(tempDir);
        let collectionDir = tempDir;

        if (extractedItems.length === 1) {
          const singleItem = path.join(tempDir, extractedItems[0]);
          const singleItemStat = fs.lstatSync(singleItem);
          if (singleItemStat.isDirectory() && !singleItemStat.isSymbolicLink()) {
            collectionDir = singleItem;
          }
        }

        const brunoJsonPath = path.join(collectionDir, 'bruno.json');
        const openCollectionYmlPath = path.join(collectionDir, 'opencollection.yml');

        if (!fs.existsSync(brunoJsonPath) && !fs.existsSync(openCollectionYmlPath)) {
          throw new Error('Invalid collection: Neither bruno.json nor opencollection.yml found in the ZIP file');
        }

        // Ensure config files are not symlinks
        if (fs.existsSync(brunoJsonPath) && fs.lstatSync(brunoJsonPath).isSymbolicLink()) {
          throw new Error('Security error: bruno.json cannot be a symbolic link');
        }
        if (fs.existsSync(openCollectionYmlPath) && fs.lstatSync(openCollectionYmlPath).isSymbolicLink()) {
          throw new Error('Security error: opencollection.yml cannot be a symbolic link');
        }

        let collectionName = 'Imported Collection';
        let brunoConfig: BrunoConfig = { name: collectionName, version: '1', type: 'collection', ignore: ['node_modules', '.git'] };

        if (fs.existsSync(openCollectionYmlPath)) {
          try {
            const content = fs.readFileSync(openCollectionYmlPath, 'utf8');
            const parsed = parseCollection(content, { format: 'yml' });
            brunoConfig = parsed.brunoConfig || brunoConfig;
            collectionName = brunoConfig.name || collectionName;
          } catch (e) {
            console.error(`Error parsing opencollection.yml at ${openCollectionYmlPath}:`, e);
          }
        } else if (fs.existsSync(brunoJsonPath)) {
          try {
            brunoConfig = JSON.parse(fs.readFileSync(brunoJsonPath, 'utf8'));
            collectionName = brunoConfig.name || collectionName;
          } catch (e) {
            console.error(`Error parsing bruno.json at ${brunoJsonPath}:`, e);
          }
        }

        let sanitizedCollectionName = sanitizeName(collectionName);
        if (!sanitizedCollectionName) {
          sanitizedCollectionName = `untitled-${Date.now()}`;
        }
        let finalCollectionPath = path.join(collectionLocation, sanitizedCollectionName);
        let counter = 1;
        while (fs.existsSync(finalCollectionPath)) {
          finalCollectionPath = path.join(collectionLocation, `${sanitizedCollectionName} (${counter})`);
          counter++;
        }

        await fsExtra.move(collectionDir, finalCollectionPath);
        if (tempDir !== collectionDir) {
          await fsExtra.remove(tempDir).catch(() => {});
        }

        const uid = generateUidBasedOnHash(finalCollectionPath);
        const { size, filesCount } = await getCollectionStats(finalCollectionPath);
        brunoConfig.size = size;
        brunoConfig.filesCount = filesCount;

        const lastOpenedStore = new LastOpenedCollections();
        lastOpenedStore.add(finalCollectionPath);

        const workspacePath = defaultWorkspaceManager.getDefaultWorkspacePath();
        if (workspacePath) {
          try {
            await addToWorkspaceYml(workspacePath, { name: collectionName, path: finalCollectionPath });
            const workspaceConfig = readWorkspaceConfig(workspacePath);
            const wsUid = defaultWorkspaceManager.getDefaultWorkspaceUid();
            const configForClient = prepareWorkspaceConfigForClient(workspaceConfig, workspacePath, true);
            broadcastToAllWebviews('main:workspace-config-updated', workspacePath, wsUid, configForClient);
          } catch (err) {
            console.error('[Collection IPC] Error adding ZIP collection to workspace:', err);
          }
        }

        broadcastToAllWebviews('main:collection-opened', finalCollectionPath, uid, brunoConfig, true);
        emit('main:collection-opened', finalCollectionPath, uid, brunoConfig);

        return finalCollectionPath;
      } catch (error) {
        await fsExtra.remove(tempDir).catch(() => {});
        throw error;
      }
    } catch (error) {
      throw error;
    }
  });

  registerHandler('sidebar:get-collection-tree', async (args) => {
    const [collectionPath] = args as [string];

    try {
      if (!collectionPath || !fs.existsSync(collectionPath)) {
        return null;
      }

      const uid = generateUidBasedOnHash(collectionPath);
      const collectionName = path.basename(collectionPath);

      const buildTree = (dirPath: string): Array<{
        uid: string;
        name: string;
        type: 'request' | 'folder';
        pathname: string;
        method?: string;
        requestType?: string;
        items?: unknown[];
      }> => {
        const items: Array<{
          uid: string;
          name: string;
          type: 'request' | 'folder';
          pathname: string;
          method?: string;
          requestType?: string;
          items?: unknown[];
        }> = [];

        try {
          const entries = fs.readdirSync(dirPath, { withFileTypes: true });

          // Sort: folders first, then files, alphabetically
          entries.sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
          });

          let format: 'bru' | 'yml' = 'bru';
          try {
            format = getCollectionFormat(collectionPath);
          } catch { /* default to bru */ }
          const requestExt = format === 'yml' ? '.yml' : '.bru';
          const skipFiles = format === 'yml'
            ? ['folder.yml', 'opencollection.yml']
            : ['folder.bru', 'collection.bru'];

          for (const entry of entries) {
            const entryPath = path.join(dirPath, entry.name);

            // Skip hidden files and directories
            if (entry.name.startsWith('.')) continue;

            if (entry.name === 'bruno.json' || entry.name === 'opencollection.yml') continue;
            if (skipFiles.includes(entry.name)) continue;
            if (entry.name.endsWith('.env') || entry.name.endsWith('.env.json')) continue;

            if (entry.isDirectory()) {
              items.push({
                uid: generateUidBasedOnHash(entryPath),
                name: entry.name,
                type: 'folder',
                pathname: entryPath,
                items: buildTree(entryPath)
              });
            } else if (entry.name.endsWith(requestExt)) {
              let method = 'GET';
              let requestType = 'http';

              try {
                const content = fs.readFileSync(entryPath, 'utf8');

                if (format === 'yml') {
                  // YML format parsing
                  if (content.match(/^\s*graphql\s*:/m)) {
                    requestType = 'graphql';
                    method = 'POST';
                  } else if (content.match(/^\s*grpc\s*:/m)) {
                    requestType = 'grpc';
                  } else if (content.match(/^\s*websocket\s*:/m)) {
                    requestType = 'ws';
                  } else {
                    const httpMatch = content.match(/method\s*:\s*['"]?(\w+)['"]?/m);
                    if (httpMatch) {
                      method = httpMatch[1].toUpperCase();
                    }
                  }
                } else {
                  // BRU format parsing
                  const metaMatch = content.match(/meta\s*\{[^}]*type:\s*(\w+)/);
                  if (metaMatch) {
                    const type = metaMatch[1].toLowerCase();
                    if (type === 'graphql') requestType = 'graphql';
                    else if (type === 'grpc') requestType = 'grpc';
                    else if (type === 'ws' || type === 'websocket') requestType = 'ws';
                  }

                  const methodMatch = content.match(/(?:get|post|put|delete|patch|options|head)\s*\{/i);
                  if (methodMatch) {
                    method = methodMatch[0].replace(/\s*\{/, '').toUpperCase();
                  }
                }
              } catch (parseError) {
                // Ignore parse errors
              }

              items.push({
                uid: generateUidBasedOnHash(entryPath),
                name: entry.name.replace(requestExt, ''),
                type: 'request',
                pathname: entryPath,
                method,
                requestType
              });
            }
          }
        } catch (readError) {
          console.error('[Sidebar] Error reading directory:', dirPath, readError);
        }

        return items;
      };

      return {
        uid,
        name: collectionName,
        pathname: collectionPath,
        items: buildTree(collectionPath)
      };
    } catch (error) {
      console.error('[Sidebar] Error building collection tree:', error);
      return null;
    }
  });

  registerHandler('sidebar:close-collection', async (args) => {
    const [collectionUid, collectionPath] = args as [string, string];

    try {
      if (watcher && collectionPath) {
        watcher.removeWatcher(collectionPath, collectionUid);
      }

      const lastOpenedStore = new LastOpenedCollections();
      lastOpenedStore.remove(collectionPath);

      sendToWebview('main:collection-closed', collectionUid);

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('sidebar:create-request-in-folder', async (args) => {
    const [folderPath, requestType] = args as [string, 'http' | 'graphql' | 'grpc' | 'ws'];

    try {
      const name = await vscode.window.showInputBox({
        prompt: 'Enter request name',
        placeHolder: 'New Request'
      });

      if (!name) return { success: false, canceled: true };

      let format: 'bru' | 'yml' = 'bru';
      try {
        const { findCollectionRoot } = require('../utils/path');
        const collRoot = findCollectionRoot(folderPath);
        if (collRoot) {
          format = getCollectionFormat(collRoot);
        }
      } catch { /* default to bru */ }
      const ext = format === 'yml' ? '.yml' : '.bru';

      const sanitizedName = sanitizeName(name);
      const filename = `${sanitizedName}${ext}`;
      const filePath = path.join(folderPath, filename);

      if (fs.existsSync(filePath)) {
        throw new Error(`Request already exists: ${filename}`);
      }

      // Generate request content based on type
      let content = '';
      if (requestType === 'graphql') {
        content = `meta {
  name: ${name}
  type: graphql
  seq: 1
}

post {
  url: {{baseUrl}}/graphql
  body: graphql
  auth: none
}

body:graphql {
  query {

  }
}
`;
      } else if (requestType === 'grpc') {
        content = `meta {
  name: ${name}
  type: grpc
  seq: 1
}

grpc {
  url: {{baseUrl}}
  method:
}
`;
      } else if (requestType === 'ws') {
        content = `meta {
  name: ${name}
  type: ws
  seq: 1
}

ws {
  url: {{baseUrl}}
}
`;
      } else {
        // Default HTTP request
        content = `meta {
  name: ${name}
  type: http
  seq: 1
}

get {
  url: {{baseUrl}}
  body: none
  auth: none
}
`;
      }

      await writeFile(filePath, content);

      return { success: true, filePath };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('sidebar:create-folder-in', async (args) => {
    const [parentPath] = args as [string];

    try {
      const name = await vscode.window.showInputBox({
        prompt: 'Enter folder name',
        placeHolder: 'New Folder'
      });

      if (!name) return { success: false, canceled: true };

      const sanitizedName = sanitizeName(name);
      const folderPath = path.join(parentPath, sanitizedName);

      if (fs.existsSync(folderPath)) {
        throw new Error(`Folder already exists: ${sanitizedName}`);
      }

      await createDirectory(folderPath);

      return { success: true, folderPath };
    } catch (error) {
      throw error;
    }
  });

  // Rename item from sidebar
  registerHandler('sidebar:rename-item', async (args) => {
    const [itemPath, itemUid] = args as [string, string];

    try {
      const ext = path.extname(itemPath);
      const currentName = path.basename(itemPath, ext);
      const isFile = fs.statSync(itemPath).isFile();

      const newName = await vscode.window.showInputBox({
        prompt: `Rename ${isFile ? 'request' : 'folder'}`,
        value: currentName,
        placeHolder: currentName
      });

      if (!newName || newName === currentName) {
        return { success: false, canceled: true };
      }

      const sanitizedName = sanitizeName(newName);
      const parentDir = path.dirname(itemPath);
      const newPath = isFile
        ? path.join(parentDir, `${sanitizedName}${ext}`)
        : path.join(parentDir, sanitizedName);

      if (fs.existsSync(newPath)) {
        throw new Error(`${isFile ? 'Request' : 'Folder'} already exists: ${sanitizedName}`);
      }

      fs.renameSync(itemPath, newPath);

      return { success: true, newPath };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('sidebar:delete-item', async (args) => {
    const [itemPath, itemUid] = args as [string, string];

    try {
      const isFile = fs.statSync(itemPath).isFile();
      const itemExt = path.extname(itemPath);
      const itemName = path.basename(itemPath, itemExt);

      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete "${itemName}"?`,
        { modal: true },
        'Delete'
      );

      if (confirm !== 'Delete') {
        return { success: false, canceled: true };
      }

      if (isFile) {
        fs.unlinkSync(itemPath);
      } else {
        fs.rmSync(itemPath, { recursive: true, force: true });
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  // Duplicate item from sidebar
  registerHandler('sidebar:duplicate-item', async (args) => {
    const [itemPath, itemUid] = args as [string, string];

    try {
      const isFile = fs.statSync(itemPath).isFile();
      const itemExt = path.extname(itemPath);
      const currentName = path.basename(itemPath, itemExt);
      const parentDir = path.dirname(itemPath);

      let newName = `${currentName} copy`;
      let counter = 1;
      let newPath = isFile
        ? path.join(parentDir, `${newName}${itemExt}`)
        : path.join(parentDir, newName);

      while (fs.existsSync(newPath)) {
        counter++;
        newName = `${currentName} copy ${counter}`;
        newPath = isFile
          ? path.join(parentDir, `${newName}${itemExt}`)
          : path.join(parentDir, newName);
      }

      if (isFile) {
        fs.copyFileSync(itemPath, newPath);
      } else {
        await copyPath(itemPath, newPath);
      }

      return { success: true, newPath };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('sidebar:import-collection', async (args) => {
    const [format] = args as [string];

    try {
      let filters: { [key: string]: string[] } = {};
      switch (format) {
        case 'postman':
          filters = { 'Postman Collection': ['json'] };
          break;
        case 'insomnia':
          filters = { 'Insomnia Export': ['json', 'yaml', 'yml'] };
          break;
        case 'openapi':
          filters = { 'OpenAPI Specification': ['json', 'yaml', 'yml'] };
          break;
        case 'bruno':
          filters = { 'Bruno Collection': ['json'] };
          break;
        default:
          filters = { 'All Files': ['*'] };
      }

      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters,
        title: `Import ${format.charAt(0).toUpperCase() + format.slice(1)} Collection`
      });

      if (!uris || uris.length === 0) {
        return { success: false, canceled: true };
      }

      // TODO: Implement actual import using @usebruno/converters
      vscode.window.showWarningMessage(`Import from ${format} not yet fully implemented`);

      return { success: false, error: 'Not implemented' };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:get-collection-security-config', async (args) => {
    const [collectionPath] = args as [string];
    try {
      return collectionSecurityStore.getSecurityConfigForCollection(collectionPath);
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:save-collection-security-config', async (args) => {
    const [collectionPath, securityConfig] = args as [string, { jsSandboxMode?: string }];
    try {
      collectionSecurityStore.setSecurityConfigForCollection(collectionPath, {
        jsSandboxMode: securityConfig.jsSandboxMode
      });

      // Broadcast to all webviews so other tabs of the same collection update
      broadcastToAllWebviews('main:collection-security-config-updated', {
        collectionPath,
        securityConfig: { jsSandboxMode: securityConfig.jsSandboxMode }
      });

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  // Last opened collections persistence handlers

  const lastOpenedCollections = new LastOpenedCollections();

  registerHandler('renderer:add-last-opened-collection', async (args) => {
    const [collectionPath] = args as [string];
    try {
      lastOpenedCollections.add(collectionPath);
      return { success: true };
    } catch (error) {
      console.error('[Collection IPC] Error adding to last opened collections:', error);
      throw error;
    }
  });

  registerHandler('renderer:remove-last-opened-collection', async (args) => {
    const [collectionPath] = args as [string];
    try {
      lastOpenedCollections.remove(collectionPath);
      return { success: true };
    } catch (error) {
      console.error('[Collection IPC] Error removing from last opened collections:', error);
      throw error;
    }
  });

  registerHandler('renderer:get-last-opened-collections', async () => {
    try {
      const collections = lastOpenedCollections.getAll();
      const validCollections = collections.filter((collectionPath) => {
        try {
          return fs.existsSync(collectionPath) && isDirectory(collectionPath);
        } catch {
          return false;
        }
      });
      if (validCollections.length !== collections.length) {
        lastOpenedCollections.update(validCollections);
      }
      return validCollections;
    } catch (error) {
      console.error('[Collection IPC] Error getting last opened collections:', error);
      throw error;
    }
  });

  registerEventListener('main:renderer-ready', async () => {
    try {
      const collectionPaths = lastOpenedCollections.getAll();
      const validPaths: string[] = [];

      for (const collectionPath of collectionPaths) {
        if (fs.existsSync(collectionPath) && isDirectory(collectionPath)) {
          validPaths.push(collectionPath);
        }
      }

      if (validPaths.length !== collectionPaths.length) {
        lastOpenedCollections.update(validPaths);
      }

      if (validPaths.length > 0) {
        await openCollectionsByPathname(watcher as Parameters<typeof openCollectionsByPathname>[0], validPaths, { dontSendDisplayErrors: true });
      }
    } catch (error) {
      console.error('[Collection IPC] Error loading last opened collections:', error);
    }
  });

  // GraphQL schema file loading
  registerHandler('renderer:load-gql-schema-file', async () => {
    try {
      const result = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          'GraphQL Schema': ['json', 'graphql', 'gql', 'sdl'],
          'All Files': ['*']
        },
        title: 'Load GraphQL Schema'
      });

      if (!result || result.length === 0) {
        return null;
      }

      const filePath = result[0].fsPath;
      const content = fs.readFileSync(filePath, 'utf8');

      // Try to parse as JSON first (introspection result)
      const parsed = safeParseJSON(content);
      if (parsed && typeof parsed === 'object') {
        const parsedObj = parsed as Record<string, unknown>;
        if ('data' in parsedObj && parsedObj.data && typeof parsedObj.data === 'object' && '__schema' in (parsedObj.data as object)) {
          return parsedObj.data;
        }
        if ('__schema' in parsedObj) {
          return parsedObj;
        }
        // Return as-is if it's some other JSON format
        return parsedObj;
      }

      // Return as SDL string if not valid JSON
      return content;
    } catch (error) {
      console.error('[Collection IPC] Error loading GraphQL schema file:', error);
      throw new Error('Failed to load GraphQL schema file');
    }
  });

};

export default registerCollectionIpc;
export {
  findCollectionPathByItemPath,
  validatePathIsInsideCollection,
  envHasSecrets
};
