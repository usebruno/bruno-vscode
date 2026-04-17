/**
 * Default workspace manager
 * Handles auto-creation and management of the default workspace
 */

import fs from 'fs';
import path from 'path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { generateUidBasedOnHash } from '../utils/common';
import { createDirectory } from '../utils/filesystem';
import { getPreferences, savePreferences } from './preferences';

const DEFAULT_WORKSPACE_UID = 'default';
const DEFAULT_WORKSPACE_NAME = 'My Workspace';

interface WorkspaceConfig {
  info?: {
    name?: string;
    type?: string;
  };
  name?: string;
  type?: string;
  collections?: Array<{ name?: string; path: string }>;
}

let extensionContext: vscode.ExtensionContext | null = null;

export function setExtensionContext(context: vscode.ExtensionContext): void {
  extensionContext = context;
}

class DefaultWorkspaceManager {
  private defaultWorkspacePath: string | null = null;
  private initializationPromise: Promise<{ workspacePath: string; workspaceUid: string } | null> | null = null;

  private getGlobalStoragePath(): string | null {
    if (!extensionContext) {
      console.error('Extension context not set');
      return null;
    }
    return extensionContext.globalStorageUri.fsPath;
  }

  getDefaultWorkspaceFolderPath(): string | null {
    const globalStorage = this.getGlobalStoragePath();
    if (!globalStorage) return null;
    return path.join(globalStorage, 'default-workspace');
  }

  getDefaultWorkspacePath(): string | null {
    if (this.defaultWorkspacePath) {
      return this.defaultWorkspacePath;
    }

    const preferences = getPreferences() as unknown as Record<string, unknown>;
    const general = preferences?.general as Record<string, unknown> | undefined;
    if (general?.defaultWorkspacePath && typeof general.defaultWorkspacePath === 'string') {
      this.defaultWorkspacePath = general.defaultWorkspacePath;
      return this.defaultWorkspacePath;
    }

    // Fall back to default location in global storage
    const defaultPath = this.getDefaultWorkspaceFolderPath();
    if (defaultPath && this.isValidDefaultWorkspace(defaultPath)) {
      this.defaultWorkspacePath = defaultPath;
      return this.defaultWorkspacePath;
    }

    return null;
  }

  getDefaultWorkspaceUid(): string {
    return DEFAULT_WORKSPACE_UID;
  }

  async setDefaultWorkspacePath(workspacePath: string): Promise<string> {
    const preferences = getPreferences() as unknown as Record<string, unknown>;
    if (!preferences.general) {
      preferences.general = {};
    }
    (preferences.general as Record<string, unknown>).defaultWorkspacePath = workspacePath;
    await savePreferences(preferences as Parameters<typeof savePreferences>[0]);

    this.defaultWorkspacePath = workspacePath;

    return workspacePath;
  }

  isValidDefaultWorkspace(workspacePath: string | null): boolean {
    if (!workspacePath || !fs.existsSync(workspacePath)) {
      return false;
    }

    const workspaceYmlPath = path.join(workspacePath, 'workspace.yml');
    if (!fs.existsSync(workspaceYmlPath)) {
      return false;
    }

    return true;
  }

  private createWorkspaceYmlContent(name: string = DEFAULT_WORKSPACE_NAME): string {
    const config: WorkspaceConfig = {
      info: {
        name,
        type: 'workspace'
      },
      collections: []
    };

    return yaml.dump(config, { lineWidth: -1 });
  }

  async initializeDefaultWorkspace(): Promise<{ workspacePath: string; workspaceUid: string } | null> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._initializeDefaultWorkspace();
    const result = await this.initializationPromise;
    this.initializationPromise = null;
    return result;
  }

  private async _initializeDefaultWorkspace(): Promise<{ workspacePath: string; workspaceUid: string } | null> {
    try {
      const existingPath = this.getDefaultWorkspacePath();
      if (existingPath && this.isValidDefaultWorkspace(existingPath)) {
          return {
          workspacePath: existingPath,
          workspaceUid: DEFAULT_WORKSPACE_UID
        };
      }

      const workspacePath = this.getDefaultWorkspaceFolderPath();
      if (!workspacePath) {
        console.error('Cannot determine default workspace path');
        return null;
      }

      const globalStorage = this.getGlobalStoragePath();
      if (globalStorage && !fs.existsSync(globalStorage)) {
        await createDirectory(globalStorage);
      }

      if (!fs.existsSync(workspacePath)) {
        await createDirectory(workspacePath);
      }

      const collectionsPath = path.join(workspacePath, 'collections');
      if (!fs.existsSync(collectionsPath)) {
        await createDirectory(collectionsPath);
      }

      const workspaceYmlPath = path.join(workspacePath, 'workspace.yml');
      if (!fs.existsSync(workspaceYmlPath)) {
        const ymlContent = this.createWorkspaceYmlContent();
        fs.writeFileSync(workspaceYmlPath, ymlContent, 'utf8');
      }

      await this.setDefaultWorkspacePath(workspacePath);

      this.defaultWorkspacePath = workspacePath;

      return {
        workspacePath,
        workspaceUid: DEFAULT_WORKSPACE_UID
      };
    } catch (error) {
      console.error('Error initializing default workspace:', error);
      return null;
    }
  }

  /**
   * Get workspace config
   */
  getWorkspaceConfig(workspacePath?: string): WorkspaceConfig | null {
    const targetPath = workspacePath || this.getDefaultWorkspacePath();
    if (!targetPath) return null;

    const workspaceYmlPath = path.join(targetPath, 'workspace.yml');
    if (!fs.existsSync(workspaceYmlPath)) return null;

    try {
      const content = fs.readFileSync(workspaceYmlPath, 'utf8');
      return yaml.load(content) as WorkspaceConfig;
    } catch (error) {
      console.error('Error reading workspace.yml:', error);
      return null;
    }
  }

  async saveWorkspaceConfig(config: WorkspaceConfig, workspacePath?: string): Promise<boolean> {
    const targetPath = workspacePath || this.getDefaultWorkspacePath();
    if (!targetPath) return false;

    try {
      const workspaceYmlPath = path.join(targetPath, 'workspace.yml');
      const ymlContent = yaml.dump(config, { lineWidth: -1 });
      fs.writeFileSync(workspaceYmlPath, ymlContent, 'utf8');
      return true;
    } catch (error) {
      console.error('Error saving workspace.yml:', error);
      return false;
    }
  }

  async addCollectionToWorkspace(collectionPath: string, collectionName?: string): Promise<boolean> {
    const workspacePath = this.getDefaultWorkspacePath();
    if (!workspacePath) {
      const result = await this.initializeDefaultWorkspace();
      if (!result) return false;
    }

    const config = this.getWorkspaceConfig();
    if (!config) return false;

    if (!config.collections) {
      config.collections = [];
    }

    // Normalize to relative path for consistent storage
    let relativePath = collectionPath;
    try {
      const rel = path.relative(workspacePath!, collectionPath);
      if (!rel.startsWith('..')) {
        relativePath = rel;
      }
    } catch { }

    // Check for existing entry by resolving stored paths to absolute for comparison
    const exists = config.collections.some(c => {
      const resolved = path.isAbsolute(c.path)
        ? c.path
        : path.resolve(workspacePath!, c.path);
      return path.normalize(resolved) === path.normalize(collectionPath);
    });
    if (exists) return true;

    const name = collectionName || path.basename(collectionPath);
    config.collections.push({
      name,
      path: relativePath
    });

    return this.saveWorkspaceConfig(config);
  }

  async removeCollectionFromWorkspace(collectionPath: string): Promise<boolean> {
    const config = this.getWorkspaceConfig();
    if (!config || !config.collections) return false;

    const workspacePath = this.getDefaultWorkspacePath();

    config.collections = config.collections.filter(c => {
      const resolvedPath = path.isAbsolute(c.path)
        ? c.path
        : path.resolve(workspacePath!, c.path);
      return path.normalize(resolvedPath) !== path.normalize(collectionPath);
    });

    return this.saveWorkspaceConfig(config);
  }
}

export const defaultWorkspaceManager = new DefaultWorkspaceManager();
export { DefaultWorkspaceManager, DEFAULT_WORKSPACE_UID };
