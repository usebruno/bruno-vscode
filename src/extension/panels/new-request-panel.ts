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

export async function openNewRequestPanel(
  context: vscode.ExtensionContext,
  collectionUid: string,
  collectionPath: string,
  itemUid?: string | null
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
    'bruno.newRequest',
    'New Request',
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
    viewType: 'new-request',
    collectionUid,
    collectionPath,
    itemUid: itemUid || null
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
          result = null;
        }

        panel.webview.postMessage({
          type: 'response',
          requestId,
          result
        });

        if (channel === 'renderer:ready') {
          // Re-send view data as fallback in case the proactive send was missed
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

        if (channel === 'new-request:close') {
          panel.dispose();
        }
      } finally {
        clearCurrentWebview();
      }
    }
  });

  // NewRequestView only needs collection metadata (uid, name, presets).
  // Load metadata only — no watcher, no tree scanning, no tree events.
  const webviewSender = (channel: string, ...args: unknown[]) => {
    stateManager.sendTo(panel.webview, channel, ...args);
  };
  loadCollectionMetadata(collectionPath, webviewSender);

  // Send view data immediately.
  stateManager.sendTo(panel.webview, 'main:set-view', viewData);
}

export function closeNewRequestPanel(): void {
  if (currentPanel) {
    currentPanel.dispose();
    currentPanel = null;
  }
}
