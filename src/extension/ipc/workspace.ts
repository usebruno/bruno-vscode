
import fs from 'fs';
import path from 'path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { registerHandler, registerEventListener, sendToWebview } from './handlers';
import { createDirectory, sanitizeName, isValidCollectionDirectory, posixifyPath } from '../utils/filesystem';
import LastOpenedWorkspaces from '../store/last-opened-workspaces';
import { defaultWorkspaceManager } from '../store/default-workspace';
import { globalEnvironmentsManager } from '../store/workspace-environments';
import {
  createWorkspaceConfig,
  readWorkspaceConfig,
  writeWorkspaceConfig,
  validateWorkspaceConfig,
  updateWorkspaceName,
  updateWorkspaceDocs,
  addCollectionToWorkspace,
  removeCollectionFromWorkspace,
  getWorkspaceCollections,
  normalizeCollectionEntry,
  validateWorkspacePath,
  validateWorkspaceDirectory,
  getWorkspaceUid
} from '../utils/workspace-config';

interface WorkspaceWatcherInterface {
  addWatcher(workspacePath: string): void;
  removeWatcher(workspacePath: string): void;
}

interface WorkspaceConfig {
  info?: {
    name?: string;
    type?: string;
  };
  name?: string;
  type?: string;
  collections?: Array<{ name?: string; path: string }>;
  specs?: Array<{ name: string; path: string }>;
}

interface CollectionEntry {
  name: string;
  path: string;
}

interface EnvironmentVariable {
  uid?: string;
  name: string;
  value: string;
  secret?: boolean;
}

interface Environment {
  uid: string;
  name: string;
  variables: EnvironmentVariable[];
}

const DEFAULT_WORKSPACE_NAME = 'My Workspace';

const prepareWorkspaceConfigForClient = (
  workspaceConfig: WorkspaceConfig,
  workspacePath: string,
  isDefault: boolean
): WorkspaceConfig => {
  const collections = workspaceConfig.collections || [];
  const filteredCollections = collections
    .map((collection) => {
      let resolvedPath = collection.path;
      if (resolvedPath && !path.isAbsolute(resolvedPath)) {
        resolvedPath = path.resolve(workspacePath, resolvedPath);
      }
      return { ...collection, resolvedPath, path: posixifyPath(resolvedPath) };
    })
    .filter((collection) => collection.resolvedPath && isValidCollectionDirectory(collection.resolvedPath))
    .map(({ resolvedPath, ...collection }) => collection);

  const config = {
    ...workspaceConfig,
    collections: filteredCollections
  };

  if (isDefault) {
    return {
      ...config,
      name: DEFAULT_WORKSPACE_NAME,
      type: 'default'
    };
  }
  return config;
};

const registerWorkspaceIpc = (workspaceWatcher?: WorkspaceWatcherInterface): void => {
  const lastOpenedWorkspaces = new LastOpenedWorkspaces();

  registerHandler('renderer:create-workspace', async (args) => {
    const [workspaceName, workspaceFolderNameInput, workspaceLocation] = args as [string, string, string];

    try {
      const workspaceFolderName = sanitizeName(workspaceFolderNameInput);
      const dirPath = path.join(workspaceLocation, workspaceFolderName);

      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        if (files.length > 0) {
          throw new Error(`workspace: ${dirPath} already exists and is not empty`);
        }
      }

      validateWorkspaceDirectory(dirPath);

      if (!fs.existsSync(dirPath)) {
        await createDirectory(dirPath);
      }

      await createDirectory(path.join(dirPath, 'collections'));

      const workspaceUid = getWorkspaceUid(dirPath);
      const isDefault = workspaceUid === 'default';
      const workspaceConfig = createWorkspaceConfig(workspaceName);

      await writeWorkspaceConfig(dirPath, workspaceConfig);

      lastOpenedWorkspaces.add(dirPath);

      const configForClient = prepareWorkspaceConfigForClient(workspaceConfig, dirPath, isDefault);

      sendToWebview('main:workspace-opened', posixifyPath(dirPath), workspaceUid, configForClient);

      if (workspaceWatcher) {
        workspaceWatcher.addWatcher(dirPath);
      }

      return {
        workspaceConfig: configForClient,
        workspaceUid,
        workspacePath: dirPath
      };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:open-workspace', async (args) => {
    const [workspacePath] = args as [string];

    try {
      validateWorkspacePath(workspacePath);

      const workspaceConfig = readWorkspaceConfig(workspacePath);
      validateWorkspaceConfig(workspaceConfig);

      const workspaceUid = getWorkspaceUid(workspacePath);
      const isDefault = workspaceUid === 'default';
      const configForClient = prepareWorkspaceConfigForClient(workspaceConfig, workspacePath, isDefault);

      lastOpenedWorkspaces.add(workspacePath);

      sendToWebview('main:workspace-opened', posixifyPath(workspacePath), workspaceUid, configForClient);

      if (workspaceWatcher) {
        workspaceWatcher.addWatcher(workspacePath);
      }

      return {
        workspaceConfig: configForClient,
        workspaceUid,
        workspacePath
      };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:open-workspace-dialog', async () => {
    try {
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: 'Open Workspace',
        openLabel: 'Open Workspace'
      });

      if (!uris || uris.length === 0) {
        return null;
      }

      const workspacePath = uris[0].fsPath;
      validateWorkspacePath(workspacePath);

      const workspaceConfig = readWorkspaceConfig(workspacePath);
      validateWorkspaceConfig(workspaceConfig);

      const workspaceUid = getWorkspaceUid(workspacePath);
      const isDefault = workspaceUid === 'default';
      const configForClient = prepareWorkspaceConfigForClient(workspaceConfig, workspacePath, isDefault);

      lastOpenedWorkspaces.add(workspacePath);

      sendToWebview('main:workspace-opened', posixifyPath(workspacePath), workspaceUid, configForClient);

      if (workspaceWatcher) {
        workspaceWatcher.addWatcher(workspacePath);
      }

      return {
        workspaceConfig: configForClient,
        workspaceUid,
        workspacePath
      };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:load-workspace-collections', async (args) => {
    let workspacePath: string;
    const arg = args[0];

    if (typeof arg === 'string') {
      workspacePath = arg;
    } else if (arg && typeof arg === 'object' && 'workspacePath' in arg) {
      workspacePath = (arg as { workspacePath: string }).workspacePath;
    } else if (arg && typeof arg === 'object' && 'path' in arg) {
      workspacePath = (arg as { path: string }).path;
    } else {
      throw new Error(`Invalid workspace path argument: ${JSON.stringify(arg)}`);
    }

    try {
      if (!workspacePath) {
        throw new Error('Workspace path is undefined');
      }

      validateWorkspacePath(workspacePath);
      return getWorkspaceCollections(workspacePath);
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:load-workspace-apispecs', async (args) => {
    const [workspacePath] = args as [string];

    try {
      if (!workspacePath) {
        throw new Error('Workspace path is undefined');
      }

      const workspaceFilePath = path.join(workspacePath, 'workspace.yml');

      if (!fs.existsSync(workspaceFilePath)) {
        throw new Error('Invalid workspace: workspace.yml not found');
      }

      const yamlContent = fs.readFileSync(workspaceFilePath, 'utf8');
      const workspaceConfig = yaml.load(yamlContent) as WorkspaceConfig;

      if (!workspaceConfig || typeof workspaceConfig !== 'object') {
        return [];
      }

      const specs = workspaceConfig.specs || [];

      const resolvedSpecs = specs.map((spec) => {
        if (spec.path && !path.isAbsolute(spec.path)) {
          return {
            ...spec,
            path: path.join(workspacePath, spec.path)
          };
        }
        return spec;
      });

      return resolvedSpecs;
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:get-last-opened-workspaces', async () => {
    try {
      const workspacePaths = lastOpenedWorkspaces.getAll();
      const validWorkspaces: string[] = [];
      const invalidPaths: string[] = [];

      for (const workspacePath of workspacePaths) {
        const workspaceYmlPath = path.join(workspacePath, 'workspace.yml');

        if (fs.existsSync(workspaceYmlPath)) {
          validWorkspaces.push(workspacePath);
        } else {
          invalidPaths.push(workspacePath);
        }
      }

      for (const invalidPath of invalidPaths) {
        lastOpenedWorkspaces.remove(invalidPath);
      }

      return validWorkspaces;
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:rename-workspace', async (args) => {
    const [workspacePath, newName] = args as [string, string];

    try {
      await updateWorkspaceName(workspacePath, newName);
      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:close-workspace', async (args) => {
    const [workspacePath] = args as [string];

    try {
      lastOpenedWorkspaces.remove(workspacePath);

      if (workspaceWatcher) {
        workspaceWatcher.removeWatcher(workspacePath);
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  });

  // TODO: Implement using VS Code's file picker and archiver
  registerHandler('renderer:export-workspace', async (args) => {
    const [workspacePath, workspaceName] = args as [string, string];

    try {
      if (!workspacePath || !fs.existsSync(workspacePath)) {
        throw new Error('Workspace path does not exist');
      }

      const defaultFileName = `${sanitizeName(workspaceName)}.zip`;

      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultFileName),
        filters: { 'Zip Files': ['zip'] },
        title: 'Export Workspace'
      });

      if (!uri) {
        return { success: false, canceled: true };
      }

      // TODO: Implement archive creation
      // For now, return a not implemented message
      vscode.window.showWarningMessage('Workspace export not yet implemented');
      return { success: false, error: 'Not implemented' };
    } catch (error) {
      throw error;
    }
  });

  // TODO: Implement using VS Code's file picker and extract-zip
  registerHandler('renderer:import-workspace', async (args) => {
    const [zipFilePath, extractLocation] = args as [string, string];

    try {
      // TODO: Implement archive extraction
      vscode.window.showWarningMessage('Workspace import not yet implemented');
      return { success: false, error: 'Not implemented' };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:save-workspace-docs', async (args) => {
    const [workspacePath, docs] = args as [string, string];

    try {
      return await updateWorkspaceDocs(workspacePath, docs);
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:load-workspace-environments', async (args) => {
    const [workspacePath] = args as [string];

    try {
      const result = await globalEnvironmentsManager.getActiveGlobalEnvironmentUid(workspacePath);
      // TODO: Return full environment list when fully implemented
      return [];
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:create-workspace-environment', async (args) => {
    const [workspacePath, environmentName] = args as [string, string];

    try {
      // TODO: Implement when globalEnvironmentsManager is fully implemented
      return { success: false, error: 'Not implemented' };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:add-collection-to-workspace', async (args) => {
    const [workspacePath, collection] = args as [string, CollectionEntry];

    try {
      const normalizedCollection = normalizeCollectionEntry(workspacePath, collection);

      const updatedCollections = await addCollectionToWorkspace(workspacePath, normalizedCollection);

      const workspaceConfig = readWorkspaceConfig(workspacePath);
      const workspaceUid = getWorkspaceUid(workspacePath);
      const isDefault = workspaceUid === 'default';
      const configForClient = prepareWorkspaceConfigForClient(workspaceConfig, workspacePath, isDefault);

      sendToWebview('main:workspace-config-updated', posixifyPath(workspacePath), workspaceUid, configForClient);

      return updatedCollections;
    } catch (error) {
      console.error('[Workspace IPC] Error adding collection to workspace:', error);
      throw error;
    }
  });

  registerHandler('renderer:ensure-collections-folder', async (args) => {
    const [workspacePath] = args as [string];

    try {
      const collectionsPath = path.join(workspacePath, 'collections');
      if (!fs.existsSync(collectionsPath)) {
        await createDirectory(collectionsPath);
      }
      return collectionsPath;
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:start-workspace-watcher', async (args) => {
    const [workspacePath] = args as [string];

    try {
      if (workspaceWatcher) {
        workspaceWatcher.addWatcher(workspacePath);
      }
      return true;
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:remove-collection-from-workspace', async (args) => {
    const [workspaceUid, workspacePath, collectionPath, options = {}] = args as [string, string, string, { deleteFiles?: boolean }];

    try {
      const { deleteFiles = false } = options;
      const result = await removeCollectionFromWorkspace(workspacePath, collectionPath);

      if (deleteFiles && result.removedCollection && fs.existsSync(collectionPath)) {
        fs.rmSync(collectionPath, { recursive: true, force: true });
      }

      const correctWorkspaceUid = getWorkspaceUid(workspacePath);
      const isDefault = correctWorkspaceUid === 'default';
      const configForClient = prepareWorkspaceConfigForClient(result.updatedConfig as WorkspaceConfig, workspacePath, isDefault);

      sendToWebview('main:workspace-config-updated', posixifyPath(workspacePath), correctWorkspaceUid, configForClient);

      return true;
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:get-collection-workspaces', async (args) => {
    const [collectionPath] = args as [string];

    try {
      const workspacePaths = lastOpenedWorkspaces.getAll();
      const workspacesWithCollection: string[] = [];

      for (const workspacePath of workspacePaths) {
        try {
          const workspaceYmlPath = path.join(workspacePath, 'workspace.yml');
          if (fs.existsSync(workspaceYmlPath)) {
            const workspaceConfig = yaml.load(fs.readFileSync(workspaceYmlPath, 'utf8')) as WorkspaceConfig || {};
            const collections = workspaceConfig.collections || [];

            const hasCollection = collections.some((c) => {
              const resolvedPath = path.isAbsolute(c.path)
                ? c.path
                : path.resolve(workspacePath, c.path);
              return path.normalize(resolvedPath) === path.normalize(collectionPath);
            });

            if (hasCollection) {
              workspacesWithCollection.push(workspacePath);
            }
          }
        } catch (error) {
          console.warn('Failed to check workspace collection:', (error as Error).message);
        }
      }

      return workspacesWithCollection;
    } catch (error) {
      return [];
    }
  });

  registerHandler('renderer:get-default-workspace', async () => {
    try {
      const workspacePath = defaultWorkspaceManager.getDefaultWorkspacePath();
      if (!workspacePath || !defaultWorkspaceManager.isValidDefaultWorkspace(workspacePath)) {
        return null;
      }

      const workspaceUid = defaultWorkspaceManager.getDefaultWorkspaceUid();
      const workspaceConfig = readWorkspaceConfig(workspacePath);
      const configForClient = prepareWorkspaceConfigForClient(workspaceConfig, workspacePath, true);

      return {
        workspaceConfig: configForClient,
        workspaceUid,
        workspacePath
      };
    } catch (error) {
      console.error('Error getting default workspace:', error);
      return null;
    }
  });

  registerHandler('sidebar:get-workspace-summary', async () => {
    try {
      let workspacePath = defaultWorkspaceManager.getDefaultWorkspacePath();

      // If no default workspace exists, auto-create one
      if (!workspacePath || !defaultWorkspaceManager.isValidDefaultWorkspace(workspacePath)) {
        const initResult = await defaultWorkspaceManager.initializeDefaultWorkspace();
        if (initResult) {
          workspacePath = initResult.workspacePath;
        }
      }

      if (!workspacePath || !defaultWorkspaceManager.isValidDefaultWorkspace(workspacePath)) {
        return null;
      }

      const workspaceConfig = readWorkspaceConfig(workspacePath);
      const collections = workspaceConfig.collections || [];

      const resolvedCollections = collections
        .map((c) => {
          const resolvedPath = path.isAbsolute(c.path)
            ? c.path
            : path.resolve(workspacePath!, c.path);
          return {
            name: c.name || path.basename(resolvedPath),
            path: resolvedPath,
            uid: getWorkspaceUid(resolvedPath)
          };
        })
        .filter((c) => isValidCollectionDirectory(c.path));

      return {
        workspacePath,
        workspaceUid: defaultWorkspaceManager.getDefaultWorkspaceUid(),
        name: workspaceConfig.info?.name || workspaceConfig.name || DEFAULT_WORKSPACE_NAME,
        collections: resolvedCollections
      };
    } catch (error) {
      console.error('[Sidebar] Error getting workspace summary:', error);
      return null;
    }
  });

  registerHandler('sidebar:get-all-workspaces', async () => {
    try {
      const workspacePaths = lastOpenedWorkspaces.getAll();
      const workspaces: Array<{ uid: string; name: string; pathname: string }> = [];

      // Always include default workspace first
      const defaultPath = defaultWorkspaceManager.getDefaultWorkspacePath();
      if (defaultPath && defaultWorkspaceManager.isValidDefaultWorkspace(defaultPath)) {
        const config = readWorkspaceConfig(defaultPath);
        workspaces.push({
          uid: defaultWorkspaceManager.getDefaultWorkspaceUid(),
          name: config.info?.name || config.name || DEFAULT_WORKSPACE_NAME,
          pathname: posixifyPath(defaultPath)
        });
      }

      for (const workspacePath of workspacePaths) {
        if (workspacePath === defaultPath) continue;

        const workspaceYmlPath = path.join(workspacePath, 'workspace.yml');
        if (fs.existsSync(workspaceYmlPath)) {
          try {
            const config = readWorkspaceConfig(workspacePath);
            workspaces.push({
              uid: getWorkspaceUid(workspacePath),
              name: config.info?.name || config.name || path.basename(workspacePath),
              pathname: posixifyPath(workspacePath)
            });
          } catch (error) {
            console.warn('[Sidebar] Error loading workspace:', workspacePath);
          }
        }
      }

      return workspaces;
    } catch (error) {
      console.error('[Sidebar] Error getting all workspaces:', error);
      return [];
    }
  });

  registerHandler('sidebar:switch-workspace', async (args) => {
    const [workspaceUid] = args as [string];

    try {
      const workspacePaths = lastOpenedWorkspaces.getAll();
      let targetPath: string | null = null;

      if (workspaceUid === 'default') {
        targetPath = defaultWorkspaceManager.getDefaultWorkspacePath();
      } else {
        for (const workspacePath of workspacePaths) {
          if (getWorkspaceUid(workspacePath) === workspaceUid) {
            targetPath = workspacePath;
            break;
          }
        }
      }

      if (!targetPath) {
        throw new Error(`Workspace not found: ${workspaceUid}`);
      }

      const workspaceConfig = readWorkspaceConfig(targetPath);
      const isDefault = workspaceUid === 'default';
      const configForClient = prepareWorkspaceConfigForClient(workspaceConfig, targetPath, isDefault);

      sendToWebview('main:workspace-opened', posixifyPath(targetPath), workspaceUid, configForClient);

      return { success: true, workspacePath: targetPath };
    } catch (error) {
      throw error;
    }
  });

  registerHandler('sidebar:execute-command', async (args) => {
    const [command, ...commandArgs] = args as [string, ...unknown[]];

    try {
      await vscode.commands.executeCommand(command, ...commandArgs);
      return { success: true };
    } catch (error) {
      console.error('[Sidebar] Error executing command:', command, error);
      throw error;
    }
  });

  // Flag to prevent workspace initialization running multiple times
  let workspaceInitialized = false;

  registerEventListener('main:renderer-ready', async () => {
    // Only initialize workspace once, not for every webview that calls renderer:ready
    if (workspaceInitialized) {
      return;
    }
    workspaceInitialized = true;

    try {
      let defaultWorkspacePath: string | null = null;

      let defaultPath = defaultWorkspaceManager.getDefaultWorkspacePath();

      // If no default workspace exists, auto-create one
      if (!defaultPath || !defaultWorkspaceManager.isValidDefaultWorkspace(defaultPath)) {
        const initResult = await defaultWorkspaceManager.initializeDefaultWorkspace();
        if (initResult) {
          defaultPath = initResult.workspacePath;
        }
      }

      if (defaultPath && defaultWorkspaceManager.isValidDefaultWorkspace(defaultPath)) {
        defaultWorkspacePath = defaultPath;
        const workspaceUid = defaultWorkspaceManager.getDefaultWorkspaceUid();

        const workspaceConfig = readWorkspaceConfig(defaultPath);

        const configForClient = prepareWorkspaceConfigForClient(workspaceConfig, defaultPath, true);

        sendToWebview('main:workspace-opened', posixifyPath(defaultPath), workspaceUid, configForClient);

        if (workspaceWatcher) {
          workspaceWatcher.addWatcher(defaultPath);
        }
      } else {
        // No valid default workspace to send
      }

      const workspacePaths = lastOpenedWorkspaces.getAll();
      const invalidPaths: string[] = [];

      for (const workspacePath of workspacePaths) {
        if (defaultWorkspacePath && workspacePath === defaultWorkspacePath) {
          continue;
        }

        const workspaceYmlPath = path.join(workspacePath, 'workspace.yml');

        if (fs.existsSync(workspaceYmlPath)) {
          try {
            const workspaceConfig = readWorkspaceConfig(workspacePath);
            validateWorkspaceConfig(workspaceConfig);
            const workspaceUid = getWorkspaceUid(workspacePath);
            const isDefault = workspaceUid === 'default';
            const configForClient = prepareWorkspaceConfigForClient(workspaceConfig, workspacePath, isDefault);

            sendToWebview('main:workspace-opened', posixifyPath(workspacePath), workspaceUid, configForClient);

            if (workspaceWatcher) {
              workspaceWatcher.addWatcher(workspacePath);
            }
          } catch (error) {
            console.error(`[DEBUG] Error loading workspace ${workspacePath}:`, error);
            invalidPaths.push(workspacePath);
          }
        } else {
          invalidPaths.push(workspacePath);
        }
      }

      for (const invalidPath of invalidPaths) {
        lastOpenedWorkspaces.remove(invalidPath);
      }
    } catch (error) {
      console.error('[DEBUG] Error initializing workspaces:', error);
    }
  });
};

export default registerWorkspaceIpc;
export { prepareWorkspaceConfigForClient };
