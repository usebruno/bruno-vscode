/**
 * Migration for external collections from old bruno-vscode extension
 *
 * Old extension stored external collections in:
 * - globalState key: 'bruno-external-collections'
 * - Format: Array<{ path, name, uid, lastOpened, config, closed }>
 *
 * New extension stores collections in workspace.yml:
 * - Located at: {defaultWorkspace}/workspace.yml
 * - Format: collections: [{ name, path }]
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

interface OldExternalCollection {
  path: string;
  name: string;
  uid: string;
  lastOpened?: number;
  config?: {
    name?: string;
    version?: string;
    type?: string;
  };
  closed?: boolean;
}

interface WorkspaceConfig {
  info?: {
    name?: string;
    type?: string;
  };
  collections?: Array<{ name?: string; path: string }>;
  specs?: Array<{ name: string; path: string }>;
  docs?: string;
}

function readWorkspaceConfig(workspacePath: string): WorkspaceConfig | null {
  const workspaceYmlPath = path.join(workspacePath, 'workspace.yml');

  if (!fs.existsSync(workspaceYmlPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(workspaceYmlPath, 'utf8');
    return yaml.load(content) as WorkspaceConfig;
  } catch (error) {
    console.error('[Migration] Error reading workspace.yml:', error);
    return null;
  }
}

function writeWorkspaceConfig(workspacePath: string, config: WorkspaceConfig): boolean {
  const workspaceYmlPath = path.join(workspacePath, 'workspace.yml');

  try {
    const content = yaml.dump(config, { lineWidth: -1 });
    fs.writeFileSync(workspaceYmlPath, content, 'utf8');
    return true;
  } catch (error) {
    console.error('[Migration] Error writing workspace.yml:', error);
    return false;
  }
}

function isValidCollectionPath(collectionPath: string): boolean {
  if (!collectionPath || !fs.existsSync(collectionPath)) {
    return false;
  }

  const brunoJsonPath = path.join(collectionPath, 'bruno.json');
  const collectionBruPath = path.join(collectionPath, 'collection.bru');
  const ocYmlPath = path.join(collectionPath, 'opencollection.yml');

  return fs.existsSync(brunoJsonPath) || fs.existsSync(collectionBruPath) || fs.existsSync(ocYmlPath);
}

function makeRelativePath(collectionPath: string, workspacePath: string): string {
  try {
    const relative = path.relative(workspacePath, collectionPath);
    // If the relative path goes outside the workspace, use absolute path
    if (relative.startsWith('..')) {
      return collectionPath;
    }
    return relative;
  } catch {
    return collectionPath;
  }
}

/**
 * Migrate external collections from old extension to default workspace
 *
 * @param context VS Code extension context
 * @param defaultWorkspacePath Path to the default workspace
 * @returns Number of collections migrated
 */
export async function migrateExternalCollections(
  context: vscode.ExtensionContext,
  defaultWorkspacePath: string
): Promise<number> {
  const externalCollections = context.globalState.get<OldExternalCollection[]>(
    'bruno-external-collections',
    []
  );

  if (!externalCollections || externalCollections.length === 0) {
    return 0;
  }

  let config = readWorkspaceConfig(defaultWorkspacePath);

  if (!config) {
    config = {
      info: {
        name: 'My Workspace',
        type: 'workspace'
      },
      collections: []
    };
  }

  if (!config.collections) {
    config.collections = [];
  }

  const existingPaths = new Set(
    config.collections.map((c) => path.normalize(c.path))
  );

  let migratedCount = 0;

  for (const collection of externalCollections) {
    if (collection.closed === true) {
      continue;
    }

    if (!isValidCollectionPath(collection.path)) {
      continue;
    }

    const normalizedPath = path.normalize(collection.path);
    if (existingPaths.has(normalizedPath)) {
      continue;
    }

    const collectionName = collection.config?.name || collection.name || path.basename(collection.path);

    // Use relative path if inside workspace, otherwise absolute
    const collectionPathToStore = makeRelativePath(collection.path, defaultWorkspacePath);

    config.collections.push({
      name: collectionName,
      path: collectionPathToStore
    });

    existingPaths.add(normalizedPath);
    migratedCount++;
  }

  if (migratedCount > 0) {
    if (writeWorkspaceConfig(defaultWorkspacePath, config)) {
      // Successfully wrote collections to workspace.yml
    } else {
      console.error('[Migration] Failed to write workspace.yml');
      return 0;
    }
  }

  return migratedCount;
}
