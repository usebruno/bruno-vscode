import * as vscode from 'vscode';
import { WebviewHelper } from '../webview/helper';
import { stateManager } from '../webview/state-manager';
import {
  setCurrentWebview,
  clearCurrentWebview,
  handleInvoke,
  hasHandler
} from '../ipc/handlers';
import { loadCollectionMetadata } from '../app/collections';

interface IpcMessage {
  type: 'invoke' | 'send';
  channel: string;
  args?: unknown[];
  requestId?: string;
}

let currentPanel: vscode.WebviewPanel | null = null;

export async function openCloneCollectionPanel(
  context: vscode.ExtensionContext,
  collectionUid: string,
  collectionPath: string
): Promise<void> {
  if (currentPanel) {
    try {
      currentPanel.reveal(vscode.ViewColumn.One);
      return;
    } catch {
      currentPanel = null;
    }
  }

  const panel = vscode.window.createWebviewPanel(
    'bruno.cloneCollection',
    'Clone Collection',
    vscode.ViewColumn.One,
    {
      ...WebviewHelper.getWebviewOptions(context.extensionUri),
      retainContextWhenHidden: true
    }
  );

  currentPanel = panel;

  panel.webview.html = WebviewHelper.getHtmlForWebview(panel.webview, context.extensionUri);
  stateManager.addWebview(panel.webview);

  panel.onDidDispose(() => {
    stateManager.removeWebview(panel.webview);
    if (currentPanel === panel) {
      currentPanel = null;
    }
  });

  const viewData = {
    viewType: 'clone-collection',
    collectionUid,
    collectionPath
  };

  const handleLocalInvoke = async (channel: string, _args: unknown[]): Promise<unknown> => {
    switch (channel) {
      case 'clone-collection:browse-location': {
        const folderUri = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false,
          openLabel: 'Select Location',
          title: 'Select location for cloned collection'
        });

        if (folderUri && folderUri.length > 0) {
          return folderUri[0].fsPath;
        }
        return null;
      }
      default:
        return null;
    }
  };

  panel.webview.onDidReceiveMessage(async (message: IpcMessage) => {
    const { type, channel, args, requestId } = message;

    if (type === 'invoke' && requestId) {
      setCurrentWebview(panel.webview);

      try {
        let result: unknown;

        if (hasHandler(channel)) {
          result = await handleInvoke(channel, args || []);
        } else {
          result = await handleLocalInvoke(channel, args || []);
        }

        panel.webview.postMessage({
          type: 'response',
          requestId,
          result
        });

        if (channel === 'renderer:ready') {
          stateManager.sendTo(panel.webview, 'main:set-view', viewData);
          clearCurrentWebview();
          return;
        }
      } catch (error) {
        panel.webview.postMessage({
          type: 'response',
          requestId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      } finally {
        clearCurrentWebview();
      }
    } else if (type === 'send') {
      setCurrentWebview(panel.webview);
      try {
        if (channel === 'open-external' && typeof args?.[0] === 'string') {
          vscode.env.openExternal(vscode.Uri.parse(args[0]));
        }

        if (channel === 'clone-collection:close') {
          panel.dispose();
        }
      } finally {
        clearCurrentWebview();
      }
    }
  });

  // CloneCollectionView only needs collection name and pathname.
  // Load metadata only - no watcher, no tree scanning.
  const webviewSender = (channel: string, ...args: unknown[]) => {
    stateManager.sendTo(panel.webview, channel, ...args);
  };
  loadCollectionMetadata(collectionPath, webviewSender);

  stateManager.sendTo(panel.webview, 'main:set-view', viewData);
}

export function closeCloneCollectionPanel(): void {
  if (currentPanel) {
    currentPanel.dispose();
    currentPanel = null;
  }
}
