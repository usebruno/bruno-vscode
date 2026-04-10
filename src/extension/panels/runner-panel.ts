import * as vscode from 'vscode';
import { WebviewHelper } from '../webview/helper';
import { stateManager } from '../webview/state-manager';
import { getCollectionName } from '../utils/path';
import { generateUidBasedOnHash } from '../utils/common';
import {
  setCurrentWebview,
  clearCurrentWebview,
  handleInvoke
} from '../ipc/handlers';
import { openCollection, setMessageSender as setCollectionsMessageSender } from '../app/collections';
import { setMessageSender as setWatcherMessageSender } from '../app/collection-watcher';
import collectionWatcher from '../app/collection-watcher';
import UiStateSnapshot from '../store/ui-state-snapshot';

interface IpcMessage {
  type: 'invoke' | 'send';
  channel: string;
  args?: unknown[];
  requestId?: string;
}

const activeRunnerPanels = new Map<string, vscode.WebviewPanel>();

function handleIpcSend(channel: string, args: unknown[]): void {
  if (channel === 'open-external' && typeof args[0] === 'string') {
    vscode.env.openExternal(vscode.Uri.parse(args[0]));
  }
}

export async function openRunnerPanel(
  context: vscode.ExtensionContext,
  collectionRoot: string,
  _targetPath: string
): Promise<void> {
  const existingPanel = activeRunnerPanels.get(collectionRoot);
  if (existingPanel) {
    existingPanel.reveal();
    return;
  }

  const collectionName = getCollectionName(collectionRoot);

  const panel = vscode.window.createWebviewPanel(
    'bruno.runnerPanel',
    `Runner: ${collectionName}`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [context.extensionUri],
      retainContextWhenHidden: true
    }
  );

  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'bruno-icon.png');
  activeRunnerPanels.set(collectionRoot, panel);

  panel.onDidDispose(() => {
    activeRunnerPanels.delete(collectionRoot);
    stateManager.removeWebview(panel.webview);
  });

  panel.webview.html = WebviewHelper.getHtmlForWebview(panel.webview, context.extensionUri);
  stateManager.addWebview(panel.webview);

  const webviewSender = (channel: string, ...args: unknown[]) => {
    stateManager.sendTo(panel.webview, channel, ...args);
  };

  const originalBroadcastSender = (channel: string, ...args: unknown[]) => {
    stateManager.broadcast(channel, ...args);
  };

  let collectionLoaded = false;

  const loadCollection = async () => {
    if (collectionLoaded) return;
    collectionLoaded = true;

    setCollectionsMessageSender(webviewSender);
    setWatcherMessageSender(webviewSender);

    try {
      // Check if watcher already exists (collection already open elsewhere)
      const watcherExists = collectionWatcher.hasWatcher(collectionRoot);

      // Always call openCollection to send collection metadata
      await openCollection(collectionWatcher, collectionRoot);

      const collectionUid = generateUidBasedOnHash(collectionRoot);

      await new Promise(resolve => setTimeout(resolve, 300));
      await collectionWatcher.loadEnvironments(collectionRoot, collectionUid, webviewSender);

      // If watcher already existed, openCollection won't trigger a scan
      // so we need to manually load all items for this webview
      if (watcherExists) {
        await collectionWatcher.loadFullCollection(collectionRoot, collectionUid, webviewSender);
      }

      setCollectionsMessageSender(originalBroadcastSender);
      setWatcherMessageSender(originalBroadcastSender);

      const uiStateSnapshotStore = new UiStateSnapshot();
      const collectionsSnapshotState = uiStateSnapshotStore.getCollections();
      const collectionSnapshotState = collectionsSnapshotState?.find(
        (c: { pathname?: string }) => c?.pathname === collectionRoot
      );
      if (collectionSnapshotState) {
        stateManager.sendTo(panel.webview, 'main:hydrate-app-with-ui-state-snapshot', collectionSnapshotState);
      }

      setTimeout(() => {
        stateManager.sendTo(panel.webview, 'main:set-view', {
          viewType: 'collection-runner',
          collectionUid,
          collectionPath: collectionRoot
        });
      }, 500);
    } catch (error) {
      console.error('RunnerPanel: Error opening collection:', error);
      setCollectionsMessageSender(originalBroadcastSender);
      setWatcherMessageSender(originalBroadcastSender);
    }
  };

  panel.webview.onDidReceiveMessage(async (message: IpcMessage) => {
    if (message.type === 'invoke' && message.channel && message.requestId) {
      try {
        setCurrentWebview(panel.webview);

        if (message.channel === 'renderer:ready') {
          const result = await handleInvoke(message.channel, message.args || []);

          panel.webview.postMessage({
            type: 'response',
            requestId: message.requestId,
            result
          });

          clearCurrentWebview();
          await loadCollection();
          return;
        }

        const result = await handleInvoke(message.channel, message.args || []);
        clearCurrentWebview();

        panel.webview.postMessage({
          type: 'response',
          requestId: message.requestId,
          result
        });
      } catch (error) {
        clearCurrentWebview();
        panel.webview.postMessage({
          type: 'response',
          requestId: message.requestId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } else if (message.type === 'send' && message.channel) {
      handleIpcSend(message.channel, message.args || []);
    }
  });
}

export function getActiveRunnerPanel(collectionRoot: string): vscode.WebviewPanel | undefined {
  return activeRunnerPanels.get(collectionRoot);
}
