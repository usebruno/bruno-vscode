import * as vscode from 'vscode';
import { WebviewHelper } from '../webview/helper';
import { stateManager } from '../webview/state-manager';
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

let currentPanel: vscode.WebviewPanel | null = null;

export async function openImportCollectionPanel(
  context: vscode.ExtensionContext
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
    'bruno.importCollection',
    'Import Collection',
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

  const sendView = () => {
    setTimeout(() => {
      stateManager.sendTo(panel.webview, 'main:set-view', {
        viewType: 'import-collection'
      });
    }, 100);
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
          clearCurrentWebview();
          sendView();
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

        if (channel === 'import-collection:close') {
          panel.dispose();
        }
      } finally {
        clearCurrentWebview();
      }
    }
  });
}

export function closeImportCollectionPanel(): void {
  if (currentPanel) {
    currentPanel.dispose();
    currentPanel = null;
  }
}
