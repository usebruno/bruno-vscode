/**
 * Constrained folder picker with request name input using VS Code's QuickPick.
 * Only folders inside the given root can be chosen; the user cannot navigate
 * above it. Goes through workspace.fs, so the root can be on any file system.
 */

import * as vscode from 'vscode';
import { basename, dirname, isInside, isSameDir } from './file';

interface FolderPickItem extends vscode.QuickPickItem {
  uri: vscode.Uri;
  action: 'navigate' | 'select';
}

export interface SaveLocation {
  folder: vscode.Uri;
  name: string;
}

/**
 * Show a folder picker constrained to `root`, followed by a name input.
 * Returns the chosen folder and request name, or undefined if cancelled.
 */
export async function showSaveRequestPicker(
  rootPath: vscode.Uri,
  defaultName?: string,
  options?: { title?: string }
): Promise<SaveLocation | undefined> {
  const rootName = basename(rootPath);

  // Step 1: Pick a folder, unless the root is the only choice there is.
  const folder = (await listSubfolders(rootPath)).length === 0
    ? rootPath
    : await showFolderStep(rootPath, rootName, options?.title);

  if (!folder) {
    return undefined
  };

  // Step 2: Enter name
  const name = await showNameStep(defaultName, folder, rootPath);

  if (!name) {
    return undefined
  };

  return { folder, name };
}

/** List of folders into which a request can be saved under `dir` */
async function listSubfolders(dir: vscode.Uri): Promise<string[]> {
  try {
    const entries = await vscode.workspace.fs.readDirectory(dir);

    return entries
      .filter(([name, type]) => (type & vscode.FileType.Directory) && !name.startsWith('.') && name !== 'node_modules' && name !== 'environments')
      .map(([name]) => name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/** Where `uri` sits under `root`, for display: "/" for the root itself. */
function getRelativePath(root: vscode.Uri, uri: vscode.Uri): string {
  return uri.path.slice(root.path.length).replace(/^\//, '') || '/';
}

async function showFolderStep(rootPath: vscode.Uri, rootName: string, title?: string): Promise<vscode.Uri | undefined> {
  return new Promise<vscode.Uri | undefined>((resolve) => {
    const quickPick = vscode.window.createQuickPick<FolderPickItem>();
    let currentPath = rootPath;
    let resolved = false;

    quickPick.title = title || `Save request to ${rootName}`;
    quickPick.placeholder = 'Select a folder or navigate into one';
    quickPick.step = 1;
    quickPick.totalSteps = 2;
    quickPick.matchOnDescription = true;

    const loadFolders = async () => {
      quickPick.busy = true;
      const relative = getRelativePath(rootPath, currentPath);
      const items: FolderPickItem[] = [{
        label: '$(check) Select this folder',
        description: relative === '/' ? `${rootName} (root)` : relative,
        uri: currentPath,
        action: 'select'
      }];

      if (!isSameDir(currentPath, rootPath)) {
        items.push({
          label: '$(arrow-up) ..',
          description: 'Go to parent folder',
          uri: dirname(currentPath),
          action: 'navigate'
        });
      }

      for (const folder of await listSubfolders(currentPath)) {
        items.push({
          label: `$(folder) ${folder}`,
          uri: vscode.Uri.joinPath(currentPath, folder),
          action: 'navigate'
        });
      }

      quickPick.items = items;
      quickPick.busy = false;
    };

    quickPick.onDidAccept(() => {
      const selected = quickPick.activeItems[0];
      if (!selected) return;

      if (selected.action === 'select') {
        resolved = true;
        quickPick.hide();
        resolve(selected.uri);
        return;
      }

      // Never above the root.
      currentPath = isSameDir(selected.uri, rootPath) || isInside(selected.uri, rootPath) ? selected.uri : rootPath;
      void loadFolders();
    });

    quickPick.onDidHide(() => {
      quickPick.dispose();
      if (!resolved) resolve(undefined);
    });

    void loadFolders();
    quickPick.show();
  });
}

async function showNameStep(defaultName: string | undefined, folder: vscode.Uri, rootPath: vscode.Uri): Promise<string | undefined> {
  const relative = getRelativePath(rootPath, folder);
  const relFolder = relative === '/' ? basename(rootPath) : relative;

  return vscode.window.showInputBox({
    title: `Save request to ${relFolder}`,
    prompt: 'Enter a name for the request',
    value: defaultName || 'Untitled',
    validateInput: (value) => {
      if (!value?.trim()) return 'Name is required';
      if (/[<>:"/\\|?*]/.test(value)) return 'Name contains invalid characters';
      return null;
    }
  });
}
