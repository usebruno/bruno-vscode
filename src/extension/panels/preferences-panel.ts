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

let activePreferencesPanel: vscode.WebviewPanel | undefined;

export async function openPreferencesPanel(
  context: vscode.ExtensionContext
): Promise<void> {
  if (activePreferencesPanel) {
    activePreferencesPanel.reveal();
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'bruno.preferences',
    'Bruno Preferences',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [context.extensionUri],
      retainContextWhenHidden: true
    }
  );

  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'bruno-icon.png');
  activePreferencesPanel = panel;

  panel.webview.html = WebviewHelper.getHtmlForWebview(panel.webview, context.extensionUri);
  stateManager.addWebview(panel.webview);

  panel.onDidDispose(() => {
    activePreferencesPanel = undefined;
    stateManager.removeWebview(panel.webview);
  });

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
          stateManager.sendTo(panel.webview, 'main:set-view', {
            viewType: 'preferences'
          });
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
      } finally {
        clearCurrentWebview();
      }
    }
  });

  // Send view data immediately — the IPC event queue buffers it until React mounts.
  stateManager.sendTo(panel.webview, 'main:set-view', {
    viewType: 'preferences'
  });
}

export function getActivePreferencesPanel(): vscode.WebviewPanel | undefined {
  return activePreferencesPanel;
}
