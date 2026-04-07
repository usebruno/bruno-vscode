import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BrunoEditorProvider } from '../editors/bruno-editor-provider';
import { BrunoTreeItem, WorkspaceCollectionsProvider } from '../views/WorkspaceCollectionsProvider';
import { openRunnerPanel } from '../panels/runner-panel';
import { getCollectionFormat } from '../utils/filesystem';

export function registerTreeCommands(
  context: vscode.ExtensionContext,
  workspaceCollectionsProvider: WorkspaceCollectionsProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.refreshWorkspaceCollections', () => {
      workspaceCollectionsProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.openRequestFromTree', async (filePath: string) => {
      if (filePath && (filePath.endsWith('.bru') || filePath.endsWith('.yml'))) {
        await vscode.commands.executeCommand(
          'vscode.openWith',
          vscode.Uri.file(filePath),
          BrunoEditorProvider.viewType
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.runCollectionFromTree', async (item: BrunoTreeItem) => {
      if (item && item.data) {
        await openRunnerPanel(context, item.data.collectionPath, item.data.path);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.runFolderFromTree', async (item: BrunoTreeItem) => {
      if (item && item.data) {
        await openRunnerPanel(context, item.data.collectionPath, item.data.path);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.openCollectionSettingsFromTree', async (item: BrunoTreeItem) => {
      if (item && item.data) {
        await vscode.commands.executeCommand('bruno.openSettings', vscode.Uri.file(item.data.path));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.newRequestInCollection', async (item: BrunoTreeItem) => {
      if (!item || !item.data) return;

      const requestType = await vscode.window.showQuickPick([
        { label: 'HTTP Request', value: 'http' },
        { label: 'GraphQL Request', value: 'graphql' },
        { label: 'gRPC Request', value: 'grpc' },
        { label: 'WebSocket', value: 'ws' }
      ], {
        placeHolder: 'Select request type'
      });

      if (!requestType) return;

      const name = await vscode.window.showInputBox({
        prompt: 'Enter request name',
        placeHolder: 'My Request'
      });

      if (!name) return;

      let format: 'bru' | 'yml' = 'bru';
      try {
        format = getCollectionFormat(item.data.collectionPath);
      } catch { /* default to bru */ }
      const ext = format === 'yml' ? '.yml' : '.bru';
      const fileName = name.replace(/[^a-zA-Z0-9-_]/g, '-') + ext;
      const filePath = path.join(item.data.path, fileName);

      let content = '';
      switch (requestType.value) {
        case 'graphql':
          content = `meta {
  name: ${name}
  type: graphql
  seq: 1
}

post {
  url: https://api.example.com/graphql
  body: graphql
  auth: none
}

body:graphql {
  query {

  }
}
`;
          break;
        case 'grpc':
          content = `meta {
  name: ${name}
  type: grpc
  seq: 1
}

grpc {
  url: localhost:50051
  body: json
}
`;
          break;
        case 'ws':
          content = `meta {
  name: ${name}
  type: ws
  seq: 1
}

ws {
  url: wss://echo.websocket.org
}
`;
          break;
        default:
          content = `meta {
  name: ${name}
  type: http
  seq: 1
}

get {
  url: https://api.example.com
  body: none
  auth: none
}
`;
      }

      try {
        fs.writeFileSync(filePath, content, 'utf8');
        workspaceCollectionsProvider.refresh();
        await vscode.commands.executeCommand(
          'vscode.openWith',
          vscode.Uri.file(filePath),
          BrunoEditorProvider.viewType
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to create request: ${error}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.newFolderInCollection', async (item: BrunoTreeItem) => {
      if (!item || !item.data) return;

      const name = await vscode.window.showInputBox({
        prompt: 'Enter folder name',
        placeHolder: 'My Folder'
      });

      if (!name) return;

      const folderPath = path.join(item.data.path, name);

      try {
        fs.mkdirSync(folderPath, { recursive: true });
        workspaceCollectionsProvider.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to create folder: ${error}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.revealInExplorer', async (item: BrunoTreeItem) => {
      if (item && item.data) {
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(item.data.path));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.deleteItemFromTree', async (item: BrunoTreeItem) => {
      if (!item || !item.data) return;

      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete "${item.data.name}"?`,
        { modal: true },
        'Delete'
      );

      if (confirm === 'Delete') {
        try {
          const itemPath = item.data.path;
          const stat = fs.statSync(itemPath);

          if (stat.isDirectory()) {
            fs.rmSync(itemPath, { recursive: true });
          } else {
            fs.unlinkSync(itemPath);
          }

          workspaceCollectionsProvider.refresh();
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to delete: ${error}`);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.renameItemFromTree', async (item: BrunoTreeItem) => {
      if (!item || !item.data) return;

      const newName = await vscode.window.showInputBox({
        prompt: 'Enter new name',
        value: item.data.name,
        placeHolder: 'New name'
      });

      if (!newName || newName === item.data.name) return;

      try {
        const oldPath = item.data.path;
        const parentDir = path.dirname(oldPath);
        const isDirectory = fs.statSync(oldPath).isDirectory();

        let newPath: string;
        if (isDirectory) {
          newPath = path.join(parentDir, newName);
        } else {
          const currentExt = path.extname(oldPath);
          const newFileName = newName.replace(/[^a-zA-Z0-9-_]/g, '-') + currentExt;
          newPath = path.join(parentDir, newFileName);

          const content = fs.readFileSync(oldPath, 'utf8');
          let updatedContent = content;
          if (currentExt === '.bru') {
            updatedContent = content.replace(
              /(meta\s*\{[^}]*name\s*:\s*)([^\n,}]+)/,
              `$1${newName}`
            );
          } else if (currentExt === '.yml') {
            updatedContent = content.replace(
              /^(\s*name\s*:\s*)(.+)$/m,
              `$1${newName}`
            );
          }
          fs.writeFileSync(oldPath, updatedContent, 'utf8');
        }

        fs.renameSync(oldPath, newPath);
        workspaceCollectionsProvider.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to rename: ${error}`);
      }
    })
  );
}
