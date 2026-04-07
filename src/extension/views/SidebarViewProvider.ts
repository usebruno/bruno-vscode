import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  setCurrentWebview,
  clearCurrentWebview,
  handleInvoke,
  hasHandler
} from '../ipc/handlers';

interface IpcMessage {
  type: 'invoke' | 'send';
  channel: string;
  args?: unknown[];
  requestId?: string;
}

interface IpcResponse {
  type: 'response' | 'event';
  channel?: string;
  requestId?: string;
  result?: unknown;
  error?: string;
  args?: unknown[];
}

interface WebviewStateManager {
  addWebview(webview: vscode.Webview): void;
  removeWebview(webview: vscode.Webview): void;
  broadcast(channel: string, ...args: unknown[]): void;
  sendTo(webview: vscode.Webview, channel: string, ...args: unknown[]): void;
}

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'bruno.sidebarView';

  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _stateManager: WebviewStateManager
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    this._stateManager.addWebview(webviewView.webview);

    webviewView.onDidDispose(() => {
      this._stateManager.removeWebview(webviewView.webview);
      this._view = undefined;
    });

    webviewView.webview.onDidReceiveMessage(async (message: IpcMessage) => {
      await this._handleMessage(webviewView.webview, message);
    });

    setTimeout(() => {
      this._stateManager.sendTo(webviewView.webview, 'sidebar:ready');
    }, 100);
  }

  private async _handleMessage(
    webview: vscode.Webview,
    message: IpcMessage
  ): Promise<void> {
    const { type, channel, args, requestId } = message;

    if (type === 'invoke' && requestId) {
      setCurrentWebview(webview);

      try {
        let result: unknown;

        if (hasHandler(channel)) {
          result = await handleInvoke(channel, args || []);
        } else {
          result = await this._handleLocalInvoke(channel, args || []);
        }

        webview.postMessage({
          type: 'response',
          requestId,
          result
        } as IpcResponse);
      } catch (error) {
        webview.postMessage({
          type: 'response',
          requestId,
          error: error instanceof Error ? error.message : 'Unknown error'
        } as IpcResponse);
      } finally {
        clearCurrentWebview();
      }
    } else if (type === 'send') {
      setCurrentWebview(webview);
      try {
        await this._handleIpcSend(channel, args || []);
      } finally {
        clearCurrentWebview();
      }
    }
  }

  private async _handleLocalInvoke(channel: string, args: unknown[]): Promise<unknown> {
    switch (channel) {
      case 'sidebar:ping':
        return 'pong';

      case 'sidebar:prompt-rename': {
        const { currentName, itemType } = args[0] as { currentName: string; itemType: string };
        const newName = await vscode.window.showInputBox({
          prompt: `Enter new name for ${itemType}`,
          value: currentName,
          validateInput: (value) => {
            if (!value || !value.trim()) {
              return 'Name cannot be empty';
            }
            return null;
          }
        });
        return newName || null;
      }

      case 'sidebar:prompt-new-folder': {
        const folderName = await vscode.window.showInputBox({
          prompt: 'Enter folder name',
          validateInput: (value) => {
            if (!value || !value.trim()) {
              return 'Folder name cannot be empty';
            }
            if (value.toLowerCase() === 'environments') {
              return 'The folder name "environments" is reserved';
            }
            return null;
          }
        });
        return folderName || null;
      }

      case 'sidebar:prompt-new-request': {
        const requestTypes = [
          { label: 'HTTP Request', value: 'http-request' },
          { label: 'GraphQL Request', value: 'graphql-request' }
        ];
        const selectedType = await vscode.window.showQuickPick(requestTypes, {
          placeHolder: 'Select request type'
        });
        if (!selectedType) return null;

        const requestName = await vscode.window.showInputBox({
          prompt: 'Enter request name',
          validateInput: (value) => {
            if (!value || !value.trim()) {
              return 'Request name cannot be empty';
            }
            return null;
          }
        });
        if (!requestName) return null;

        return { name: requestName, type: selectedType.value };
      }

      case 'sidebar:confirm-remove': {
        const { collectionName } = args[0] as { collectionName: string };
        const result = await vscode.window.showWarningMessage(
          `Remove "${collectionName}" from workspace?`,
          { modal: true, detail: 'The collection will be removed from the workspace but files will remain on disk.' },
          'Remove'
        );
        return result === 'Remove';
      }

      case 'sidebar:confirm-delete': {
        const { itemName, itemType } = args[0] as { itemName: string; itemType: string };
        const result = await vscode.window.showWarningMessage(
          `Delete ${itemType} "${itemName}"?`,
          { modal: true, detail: 'This will permanently delete the file from disk.' },
          'Delete'
        );
        return result === 'Delete';
      }

      case 'sidebar:prompt-clone': {
        const { currentName } = args[0] as { currentName: string };

        // Ask for new name
        const newName = await vscode.window.showInputBox({
          prompt: 'Enter name for the cloned collection',
          value: `${currentName} copy`,
          validateInput: (value) => {
            if (!value || !value.trim()) {
              return 'Name cannot be empty';
            }
            return null;
          }
        });
        if (!newName) return null;

        const folderUri = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false,
          openLabel: 'Select Location',
          title: 'Select location for cloned collection'
        });
        if (!folderUri || folderUri.length === 0) return null;

        return { name: newName, location: folderUri[0].fsPath };
      }

      case 'sidebar:save-file': {
        const { defaultFileName, content, filters } = args[0] as {
          defaultFileName: string;
          content: string;
          filters?: { name: string; extensions: string[] }[];
        };

        const saveUri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(defaultFileName),
          filters: filters ? Object.fromEntries(filters.map(f => [f.name, f.extensions])) : { 'JSON Files': ['json'] }
        });

        if (saveUri) {
          await vscode.workspace.fs.writeFile(saveUri, Buffer.from(content, 'utf8'));
          return saveUri.fsPath;
        }
        return null;
      }

      case 'sidebar:show-in-folder': {
        const filePath = args[0] as string;
        if (filePath) {
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(filePath));
        }
        return null;
      }

      default:
        return null;
    }
  }

  private async _handleIpcSend(channel: string, args: unknown[]): Promise<void> {
    switch (channel) {
      case 'sidebar:open-request':
        if (typeof args[0] === 'string') {
          await vscode.commands.executeCommand(
            'vscode.openWith',
            vscode.Uri.file(args[0]),
            'bruno.requestEditor'
          );
        }
        break;

      case 'sidebar:open-folder':
        if (typeof args[0] === 'string') {
          await vscode.commands.executeCommand(
            'bruno.runCollection',
            vscode.Uri.file(args[0])
          );
        }
        break;

      case 'sidebar:show-in-explorer':
        if (typeof args[0] === 'string') {
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(args[0]));
        }
        break;

      case 'open-external':
        if (typeof args[0] === 'string') {
          await vscode.env.openExternal(vscode.Uri.parse(args[0]));
        }
        break;

      case 'sidebar:execute-command':
        if (typeof args[0] === 'string') {
          try {
            await vscode.commands.executeCommand(args[0], ...args.slice(1));
          } catch {
          }
        }
        break;

      case 'sidebar:open-global-environments':
        await vscode.commands.executeCommand('bruno.openGlobalEnvironments');
        break;

      case 'sidebar:open-environment-settings':
        if (args[0] && typeof args[0] === 'object') {
          const { collectionPath } = args[0] as { collectionPath?: string };
          if (collectionPath) {
            await vscode.commands.executeCommand('bruno.openEnvironmentSettings', vscode.Uri.file(collectionPath));
          }
        }
        break;

      case 'sidebar:open-create-collection':
        await vscode.commands.executeCommand('bruno.openCreateCollection');
        break;

      case 'sidebar:open-import-collection':
        await vscode.commands.executeCommand('bruno.importCollection');
        break;

      case 'sidebar:open-collection-runner':
        if (args[0] && typeof args[0] === 'object') {
          const { collectionPath } = args[0] as { collectionPath?: string };
          if (collectionPath) {
            await vscode.commands.executeCommand('bruno.runCollection', vscode.Uri.file(collectionPath));
          }
        }
        break;

      case 'sidebar:open-collection-settings':
        if (args[0] && typeof args[0] === 'object') {
          const { collectionPath } = args[0] as { collectionPath?: string };
          if (collectionPath) {
            await vscode.commands.executeCommand('bruno.openSettings', vscode.Uri.file(collectionPath));
          }
        }
        break;

      case 'sidebar:open-collection-variables':
        if (args[0] && typeof args[0] === 'object') {
          const { collectionPath } = args[0] as { collectionPath?: string };
          if (collectionPath) {
            await vscode.commands.executeCommand('bruno.openVariables', vscode.Uri.file(collectionPath));
          }
        }
        break;

      case 'sidebar:open-folder-settings':
        if (args[0] && typeof args[0] === 'object') {
          const { folderPath, collectionPath } = args[0] as { folderPath?: string; collectionPath?: string };
          if (folderPath) {
            const folderBruPath = path.join(folderPath, 'folder.bru');
            const folderYmlPath = path.join(folderPath, 'folder.yml');

            const ymlExists = fs.existsSync(folderYmlPath);
            const bruExists = fs.existsSync(folderBruPath);

            let folderFilePath: string;

            if (ymlExists) {
              folderFilePath = folderYmlPath;
            } else if (bruExists) {
              folderFilePath = folderBruPath;
            } else {
              // Neither file exists - create it based on collection format
              // Determine format from collection (check if opencollection.yml exists)
              let format = 'bru';
              if (collectionPath) {
                const openCollectionPath = path.join(collectionPath, 'opencollection.yml');
                if (fs.existsSync(openCollectionPath)) {
                  format = 'yml';
                }
              }

              folderFilePath = format === 'yml' ? folderYmlPath : folderBruPath;

              // Create minimal folder config file
              const folderName = path.basename(folderPath);
              let content: string;
              if (format === 'yml') {
                // yml format expects 'info' block with name and type
                content = `info:\n  name: ${folderName}\n  type: folder\n`;
              } else {
                // bru format uses 'meta' block
                content = `meta {\n  name: ${folderName}\n}\n`;
              }

              try {
                fs.writeFileSync(folderFilePath, content, 'utf8');
              } catch (err) {
                console.error('Failed to create folder config file:', err);
                await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(folderPath));
                break;
              }
            }

            try {
              await vscode.commands.executeCommand(
                'vscode.openWith',
                vscode.Uri.file(folderFilePath),
                'bruno.requestEditor'
              );
            } catch {
              // Fallback to revealing folder in OS file explorer
              await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(folderPath));
            }
          }
        }
        break;

      case 'sidebar:open-new-request':
        if (args[0] && typeof args[0] === 'object') {
          const { collectionUid, collectionPath, itemUid } = args[0] as {
            collectionUid?: string;
            collectionPath?: string;
            itemUid?: string | null;
          };
          if (collectionUid && collectionPath) {
            await vscode.commands.executeCommand('bruno.openNewRequest', collectionUid, collectionPath, itemUid);
          }
        }
        break;

      case 'sidebar:open-export-collection':
        if (args[0] && typeof args[0] === 'object') {
          const { collectionUid, collectionPath } = args[0] as {
            collectionUid?: string;
            collectionPath?: string;
          };
          if (collectionUid && collectionPath) {
            await vscode.commands.executeCommand('bruno.openExportCollection', collectionUid, collectionPath);
          }
        }
        break;

      case 'sidebar:open-clone-collection':
        if (args[0] && typeof args[0] === 'object') {
          const { collectionUid, collectionPath } = args[0] as {
            collectionUid?: string;
            collectionPath?: string;
          };
          if (collectionUid && collectionPath) {
            await vscode.commands.executeCommand('bruno.openCloneCollection', collectionUid, collectionPath);
          }
        }
        break;
    }
  }

  private _findWebviewAssets(): { jsFiles: string[]; cssFiles: string[] } {
    const jsDir = path.join(this._extensionUri.fsPath, 'dist', 'webview', 'static', 'js');
    const cssDir = path.join(this._extensionUri.fsPath, 'dist', 'webview', 'static', 'css');

    const jsFiles: string[] = [];
    const cssFiles: string[] = [];

    if (fs.existsSync(jsDir)) {
      const files = fs.readdirSync(jsDir);
      for (const file of files) {
        if (file.endsWith('.js')) {
          jsFiles.push(file);
        }
      }
    }

    if (fs.existsSync(cssDir)) {
      const files = fs.readdirSync(cssDir);
      for (const file of files) {
        if (file.endsWith('.css')) {
          cssFiles.push(file);
        }
      }
    }

    return { jsFiles, cssFiles };
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const { jsFiles, cssFiles } = this._findWebviewAssets();

    const webviewJsPath = path.join(this._extensionUri.fsPath, 'dist', 'webview', 'static', 'js', 'index.js');
    const webviewExists = fs.existsSync(webviewJsPath);

    if (!webviewExists) {
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bruno Sidebar</title>
  <style>
    body {
      background-color: var(--vscode-sideBar-background);
      color: var(--vscode-sideBar-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      padding: 12px;
      margin: 0;
    }
    .placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      text-align: center;
    }
    .placeholder p {
      margin: 8px 0;
      opacity: 0.8;
    }
    .placeholder code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="placeholder">
    <p>Bruno Sidebar is loading...</p>
    <p>If this persists, run:</p>
    <code>npm run build</code>
  </div>
</body>
</html>`;
    }

    const cssLinks = cssFiles.map(file => {
      const uri = webview.asWebviewUri(
        vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'static', 'css', file)
      );
      return `<link href="${uri}" rel="stylesheet">`;
    }).join('\n    ');

    const sortedJsFiles = jsFiles.sort((a, b) => {
      if (a.includes('vendor')) return -1;
      if (b.includes('vendor')) return 1;
      if (a === 'index.js') return 1;
      if (b === 'index.js') return -1;
      return 0;
    });

    const scriptTags = sortedJsFiles.map(file => {
      const uri = webview.asWebviewUri(
        vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'static', 'js', file)
      );
      return `<script defer src="${uri}"></script>`;
    }).join('\n    ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline' 'unsafe-eval'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource} https: data:; connect-src ${webview.cspSource} https:;">
  ${cssLinks}
  <title>Bruno Sidebar</title>
  <style>
    html, body, #root {
      height: 100%;
      width: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
    body {
      background-color: var(--vscode-sideBar-background);
      color: var(--vscode-sideBar-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    ::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background);
      border-radius: 5px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: var(--vscode-scrollbarSlider-hoverBackground);
    }
  </style>
  <script>
    window.BRUNO_WEBVIEW_MODE = 'sidebar';
  </script>
  ${scriptTags}
</head>
<body>
  <div id="root">
    <div style="padding: 12px; opacity: 0.7;">Loading...</div>
  </div>
</body>
</html>`;
  }

  public getWebview(): vscode.Webview | undefined {
    return this._view?.webview;
  }

  public sendEvent(channel: string, ...args: unknown[]): void {
    if (this._view) {
      this._stateManager.sendTo(this._view.webview, channel, ...args);
    }
  }

  public refresh(): void {
    this.sendEvent('sidebar:refresh');
  }
}
