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

let activeGlobalEnvPanel: vscode.WebviewPanel | undefined;

export async function openGlobalEnvironmentsPanel(
  context: vscode.ExtensionContext
): Promise<void> {
  if (activeGlobalEnvPanel) {
    activeGlobalEnvPanel.reveal();
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'bruno.globalEnvironments',
    'Global Environments',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [context.extensionUri],
      retainContextWhenHidden: true
    }
  );

  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'bruno-icon.png');
  activeGlobalEnvPanel = panel;

  panel.webview.html = WebviewHelper.getHtmlForWebview(panel.webview, context.extensionUri);
  stateManager.addWebview(panel.webview);

  panel.onDidDispose(() => {
    activeGlobalEnvPanel = undefined;
    stateManager.removeWebview(panel.webview);
  });

  let viewSent = false;

  const sendView = () => {
    if (viewSent) return;
    viewSent = true;

    setTimeout(() => {
      stateManager.sendTo(panel.webview, 'main:set-view', {
        viewType: 'global-environments'
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
      } finally {
        clearCurrentWebview();
      }
    }
  });
}

export function getActiveGlobalEnvironmentsPanel(): vscode.WebviewPanel | undefined {
  return activeGlobalEnvPanel;
}
