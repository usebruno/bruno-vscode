import fs from 'fs';
import path from 'path';
import * as vscode from 'vscode';

export interface WorkspaceCollection {
  name: string;
  path: string;
}

const MAX_SCAN_DEPTH = 5;

/**
 * Find collections (folders containing bruno.json or opencollection.yml) under a directory,
 * up to 5 levels deep. Folders inside a collection are not searched for further collections.
 */
export const findCollectionsInDirectory = (dirPath: string, depth = 0): WorkspaceCollection[] => {
  if (depth > MAX_SCAN_DEPTH) return [];

  try {
    const brunoJsonPath = path.join(dirPath, 'bruno.json');
    const ocYmlPath = path.join(dirPath, 'opencollection.yml');

    if (fs.existsSync(brunoJsonPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(brunoJsonPath, 'utf8'));
        return [{ name: config.name || path.basename(dirPath), path: dirPath }];
      } catch {
      }
    } else if (fs.existsSync(ocYmlPath)) {
      return [{ name: path.basename(dirPath), path: dirPath }];
    }

    const collections: WorkspaceCollection[] = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        collections.push(...findCollectionsInDirectory(path.join(dirPath, entry.name), depth + 1));
      }
    }
    return collections;
  } catch {
    return [];
  }
};

/**
 * Find collections in all open VS Code workspace folders.
 */
export const findWorkspaceCollections = (): WorkspaceCollection[] => {
  const workspaceFolders = vscode.workspace.workspaceFolders || [];
  return workspaceFolders.flatMap((folder) => findCollectionsInDirectory(folder.uri.fsPath));
};
