import * as vscode from 'vscode';
import * as path from 'path';
import { WebviewHelper } from '../webview/helper';
import { stateManager } from '../webview/state-manager';
import { findCollectionRoot } from '../utils/path';
import { generateUidBasedOnHash } from '../utils/common';
import {
  setCurrentWebview,
  clearCurrentWebview,
  handleInvoke,
  hasHandler
} from '../ipc/handlers';
import {
  openCollection,
  openCollectionForSingleRequest,
  setMessageSender as setCollectionsMessageSender
} from '../app/collections';
import { setMessageSender as setWatcherMessageSender } from '../app/collection-watcher';
import collectionWatcher from '../app/collection-watcher';
import { defaultWorkspaceManager } from '../store/default-workspace';
import { registerDocument, unregisterDocument } from './dirty-state-manager';

interface IpcMessage {
  type: 'invoke' | 'send';
  channel: string;
  args?: unknown[];
  requestId?: string;
}

interface CollectionLoadParams {
  filePath: string;
  collectionRoot: string;
  isVariablesMode: boolean;
  webviewPanel: vscode.WebviewPanel;
}

const pendingVariablesModeRequests = new Map<string, { collectionRoot: string }>();
// Stores view data per webview so renderer:ready can re-send as fallback
const viewDataByWebview = new Map<vscode.Webview, Record<string, unknown>>();

export function setPendingVariablesMode(filePath: string, collectionRoot: string): void {
  pendingVariablesModeRequests.set(filePath, { collectionRoot });
}

export class BrunoEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'bruno.requestEditor';

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const filePath = document.uri.fsPath;
    const fileContent = document.getText().trim();

    if (!fileContent) {
      const fileName = path.basename(filePath);
      vscode.window.showErrorMessage(
        `Cannot open "${fileName}" in Bruno editor: file is empty. Please add content or open with a text editor.`
      );
      vscode.commands.executeCommand('workbench.action.closeActiveEditor').then(() => {
        vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
      });
      return;
    }

    webviewPanel.webview.options = WebviewHelper.getWebviewOptions(this.context.extensionUri);
    webviewPanel.webview.html = WebviewHelper.getHtmlForWebview(webviewPanel.webview, this.context.extensionUri);

    stateManager.addWebview(webviewPanel.webview);

    registerDocument(document);

    webviewPanel.onDidDispose(() => {
      stateManager.removeWebview(webviewPanel.webview);
      unregisterDocument(document.uri.fsPath);
      viewDataByWebview.delete(webviewPanel.webview);
    });

    const collectionRoot = findCollectionRoot(filePath);

    const pendingVariables = pendingVariablesModeRequests.get(filePath);
    if (pendingVariables) {
      pendingVariablesModeRequests.delete(filePath);
    }
    const isVariablesMode = !!pendingVariables;

    webviewPanel.webview.onDidReceiveMessage((message: IpcMessage) => {
      this._handleMessage(webviewPanel.webview, document, message);
    });

    // Start collection loading immediately in parallel with webview initialization.
    if (collectionRoot) {
      this._loadCollection({
        filePath,
        collectionRoot,
        isVariablesMode,
        webviewPanel
      });
    }
  }

  private async _loadCollection(pending: CollectionLoadParams): Promise<void> {
    const { filePath, collectionRoot, isVariablesMode, webviewPanel } = pending;

    const webviewSender = (channel: string, ...args: unknown[]) => {
      stateManager.sendTo(webviewPanel.webview, channel, ...args);
    };

    const originalBroadcastSender = (channel: string, ...args: unknown[]) => {
      stateManager.broadcast(channel, ...args);
    };

    try {
      let collectionUid: string | null = null;

      if (isVariablesMode) {
        setCollectionsMessageSender(webviewSender);
        setWatcherMessageSender(webviewSender);

        await openCollection(collectionWatcher, collectionRoot);

        setCollectionsMessageSender(originalBroadcastSender);
        setWatcherMessageSender(originalBroadcastSender);

        collectionUid = generateUidBasedOnHash(collectionRoot);
      } else {
        collectionUid = await openCollectionForSingleRequest(
          collectionWatcher,
          collectionRoot,
          filePath,
          {},
          webviewSender
        );
      }

      if (collectionUid) {
        await defaultWorkspaceManager.addCollectionToWorkspace(collectionRoot);

        const fileName = path.basename(filePath);
        const isCollectionFile = fileName === 'collection.bru' || fileName === 'opencollection.yml';
        const isFolderFile = fileName === 'folder.bru' || fileName === 'folder.yml';

        let viewData: {
          viewType: string;
          collectionUid: string;
          collectionPath: string;
          itemUid?: string;
          folderUid?: string;
        };

        if (isVariablesMode) {
          viewData = {
            viewType: 'variables',
            collectionUid,
            collectionPath: collectionRoot
          };
        } else if (isCollectionFile) {
          viewData = {
            viewType: 'collection-settings',
            collectionUid,
            collectionPath: collectionRoot
          };
        } else if (isFolderFile) {
          const folderPath = path.dirname(filePath);
          viewData = {
            viewType: 'folder-settings',
            collectionUid,
            collectionPath: collectionRoot,
            folderUid: generateUidBasedOnHash(folderPath)
          };
        } else {
          viewData = {
            viewType: 'request',
            collectionUid,
            collectionPath: collectionRoot,
            itemUid: generateUidBasedOnHash(filePath)
          };
        }

        viewDataByWebview.set(webviewPanel.webview, viewData);
        stateManager.sendTo(webviewPanel.webview, 'main:set-view', viewData);
      }
    } catch (error) {
      console.error('BrunoEditorProvider: Error opening collection:', error);
    }
  }

  private async _handleMessage(
    webview: vscode.Webview,
    document: vscode.TextDocument,
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
          result = await this._handleLocalInvoke(channel, args || [], document);
        }

        webview.postMessage({
          type: 'response',
          requestId,
          result
        });

        if (channel === 'renderer:ready') {
          // Collection loading already started in resolveCustomTextEditor.
          // The renderer:ready handler (preferences/global-envs) was invoked above.
          // Re-send view data as fallback in case the proactive send was missed.
          const storedViewData = viewDataByWebview.get(webview);
          if (storedViewData) {
            stateManager.sendTo(webview, 'main:set-view', storedViewData);
          }
          clearCurrentWebview();
          return;
        }
      } catch (error) {
        webview.postMessage({
          type: 'response',
          requestId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      } finally {
        clearCurrentWebview();
      }
    } else if (type === 'send') {
      setCurrentWebview(webview);
      try {
        this._handleIpcSend(channel, args || []);
      } finally {
        clearCurrentWebview();
      }
    }
  }

  private async _handleLocalInvoke(channel: string, _args: unknown[], document: vscode.TextDocument): Promise<unknown> {
    switch (channel) {
      case 'renderer:get-file-content':
        return {
          path: document.uri.fsPath,
          content: document.getText()
        };

      default:
        return null;
    }
  }

  private _handleIpcSend(channel: string, args: unknown[]): void {
    switch (channel) {
      case 'open-external':
        if (typeof args[0] === 'string') {
          vscode.env.openExternal(vscode.Uri.parse(args[0]));
        }
        break;

      case 'sidebar:open-collection-runner':
        if (args[0] && typeof args[0] === 'object') {
          const { collectionPath } = args[0] as { collectionPath?: string };
          if (collectionPath) {
            vscode.commands.executeCommand('bruno.runCollection', vscode.Uri.file(collectionPath));
          }
        }
        break;

      case 'sidebar:open-collection-settings':
        if (args[0] && typeof args[0] === 'object') {
          const { collectionPath } = args[0] as { collectionPath?: string };
          if (collectionPath) {
            vscode.commands.executeCommand('bruno.openSettings', vscode.Uri.file(collectionPath));
          }
        }
        break;

      case 'sidebar:open-collection-variables':
        if (args[0] && typeof args[0] === 'object') {
          const { collectionPath } = args[0] as { collectionPath?: string };
          if (collectionPath) {
            vscode.commands.executeCommand('bruno.openVariables', vscode.Uri.file(collectionPath));
          }
        }
        break;

      case 'sidebar:open-environment-settings':
        if (args[0] && typeof args[0] === 'object') {
          const { collectionPath } = args[0] as { collectionPath?: string };
          if (collectionPath) {
            vscode.commands.executeCommand('bruno.openEnvironmentSettings', vscode.Uri.file(collectionPath));
          }
        }
        break;

      case 'sidebar:open-global-environments':
        vscode.commands.executeCommand('bruno.openGlobalEnvironments');
        break;
    }
  }
}
