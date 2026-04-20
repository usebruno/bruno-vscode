/**
 * Constrained folder picker with request name input using VS Code's QuickPick.
 * Only allows selecting folders within a given root path.
 * The user cannot navigate above the root.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface FolderPickItem extends vscode.QuickPickItem {
  fsPath: string;
  action: 'navigate' | 'select';
}

export interface SaveLocation {
  folder: string;
  name: string;
}

/**
 * Show a folder picker constrained to a root directory, followed by a name input.
 * Returns the selected folder path and request name, or undefined if cancelled.
 */
export async function showSaveRequestPicker(
  rootPath: string,
  defaultName?: string,
  options?: { title?: string }
): Promise<SaveLocation | undefined> {
  const rootName = path.basename(rootPath);

  // Step 1: Pick folder
  const folder = await showFolderStep(rootPath, rootName, options?.title);
  if (!folder) return undefined;

  // Step 2: Enter name
  const name = await showNameStep(defaultName, folder, rootPath);
  if (!name) return undefined;

  return { folder, name };
}

async function showFolderStep(rootPath: string, rootName: string, title?: string): Promise<string | undefined> {
  return new Promise<string | undefined>((resolve) => {
    const quickPick = vscode.window.createQuickPick<FolderPickItem>();
    let currentPath = rootPath;
    let resolved = false;

    quickPick.title = title || `Save request to ${rootName}`;
    quickPick.placeholder = 'Select a folder or navigate into one';
    quickPick.step = 1;
    quickPick.totalSteps = 2;
    quickPick.matchOnDescription = true;

    const getRelativePath = (fullPath: string): string => {
      const rel = path.relative(rootPath, fullPath);
      return rel || '/';
    };

    const loadFolders = () => {
      const items: FolderPickItem[] = [];

      // "Select this folder" option
      items.push({
        label: '$(check) Select this folder',
        description: getRelativePath(currentPath) === '/' ? `${rootName} (root)` : getRelativePath(currentPath),
        fsPath: currentPath,
        action: 'select'
      });

      // "Go up" option
      if (currentPath !== rootPath) {
        items.push({
          label: '$(arrow-up) ..',
          description: 'Go to parent folder',
          fsPath: path.dirname(currentPath),
          action: 'navigate'
        });
      }

      // List subdirectories
      try {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        const folders = entries
          .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'environments')
          .sort((a, b) => a.name.localeCompare(b.name));

        for (const folder of folders) {
          items.push({
            label: `$(folder) ${folder.name}`,
            fsPath: path.join(currentPath, folder.name),
            action: 'navigate'
          });
        }
      } catch {
        // Can't read directory
      }

      quickPick.items = items;
    };

    quickPick.onDidAccept(() => {
      const selected = quickPick.activeItems[0];
      if (!selected) return;

      if (selected.action === 'select') {
        resolved = true;
        quickPick.hide();
        resolve(selected.fsPath);
      } else {
        currentPath = selected.fsPath;
        if (!currentPath.startsWith(rootPath)) {
          currentPath = rootPath;
        }
        loadFolders();
      }
    });

    quickPick.onDidHide(() => {
      quickPick.dispose();
      if (!resolved) resolve(undefined);
    });

    loadFolders();
    quickPick.show();
  });
}

async function showNameStep(defaultName: string | undefined, folder: string, rootPath: string): Promise<string | undefined> {
  const relFolder = path.relative(rootPath, folder) || path.basename(rootPath);

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
