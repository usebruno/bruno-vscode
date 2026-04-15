import * as vscode from 'vscode';
import { WebviewHelper } from '../webview/helper';
import { stateManager } from '../webview/state-manager';
import {
  setCurrentWebview,
  clearCurrentWebview,
  handleInvoke,
  hasHandler
} from '../ipc/handlers';
import { openCollection, setMessageSender as setCollectionsMessageSender } from '../app/collections';
import { setMessageSender as setWatcherMessageSender } from '../app/collection-watcher';
import collectionWatcher from '../app/collection-watcher';

interface IpcMessage {
  type: 'invoke' | 'send';
  channel: string;
  args?: unknown[];
  requestId?: string;
}

let currentPanel: vscode.WebviewPanel | null = null;

export async function openExportCollectionPanel(
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
    'bruno.exportCollection',
    'Export Collection',
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

  const webviewSender = (channel: string, ...args: unknown[]) => {
    stateManager.sendTo(panel.webview, channel, ...args);
  };

  const originalBroadcastSender = (channel: string, ...args: unknown[]) => {
    stateManager.broadcast(channel, ...args);
  };

  const viewData = {
    viewType: 'export-collection',
    collectionUid,
    collectionPath
  };

  let collectionLoaded = false;

  const loadCollection = async () => {
    if (collectionLoaded) return;
    collectionLoaded = true;

    setCollectionsMessageSender(webviewSender);
    setWatcherMessageSender(webviewSender);

    try {
      // Check if watcher already exists (collection already open elsewhere)
      const watcherExists = collectionWatcher.hasWatcher(collectionPath);

      // Always call openCollection to send collection metadata
      await openCollection(collectionWatcher, collectionPath);

      // If watcher already existed, openCollection won't trigger a scan
      // so we need to manually load all items for this webview
      if (watcherExists) {
        await collectionWatcher.loadFullCollection(collectionPath, collectionUid, webviewSender);
      }

      setCollectionsMessageSender(originalBroadcastSender);
      setWatcherMessageSender(originalBroadcastSender);

      stateManager.sendTo(panel.webview, 'main:set-view', viewData);
    } catch (error) {
      console.error('ExportCollectionPanel: Error opening collection:', error);
      setCollectionsMessageSender(originalBroadcastSender);
      setWatcherMessageSender(originalBroadcastSender);
    }
  };

  const handleLocalInvoke = async (channel: string, args: unknown[]): Promise<unknown> => {
    switch (channel) {
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

        if (channel === 'export-collection:close') {
          panel.dispose();
        }
      } finally {
        clearCurrentWebview();
      }
    }
  });

  // Start collection loading immediately in parallel with webview initialization.
  loadCollection();
}

export function closeExportCollectionPanel(): void {
  if (currentPanel) {
    currentPanel.dispose();
    currentPanel = null;
  }
}
