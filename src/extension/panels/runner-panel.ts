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
import { openCollection, loadCollectionMetadata, setMessageSender as setCollectionsMessageSender } from '../app/collections';
import { setMessageSender as setWatcherMessageSender } from '../app/collection-watcher';
import collectionWatcher from '../app/collection-watcher';
import UiStateSnapshot from '../store/ui-state-snapshot';
import { posixifyPath } from '../utils/filesystem';

interface IpcMessage {
  type: 'invoke' | 'send';
  channel: string;
  args?: unknown[];
  requestId?: string;
}

const activeRunnerPanels = new Map<string, vscode.WebviewPanel>();

function handleIpcSend(channel: string, args: unknown[]): void {
  switch (channel) {
    case 'open-external':
      if (typeof args[0] === 'string') {
        vscode.env.openExternal(vscode.Uri.parse(args[0]));
      }
      break;

    case 'sidebar:open-collection-runner':
      if (args[0] && typeof args[0] === 'object') {
        const { collectionPath, folderUid } = args[0] as { collectionPath?: string; folderUid?: string };
        if (collectionPath) {
          vscode.commands.executeCommand('bruno.runCollection', vscode.Uri.file(collectionPath), folderUid);
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

export async function openRunnerPanel(
  context: vscode.ExtensionContext,
  collectionRoot: string,
  _targetPath: string,
  folderUid?: string
): Promise<void> {
  const panelKey = folderUid ? `${collectionRoot}::${folderUid}` : collectionRoot;
  const existingPanel = activeRunnerPanels.get(panelKey);
  if (existingPanel) {
    existingPanel.reveal();
    return;
  }

  const collectionName = getCollectionName(collectionRoot);
  const panelTitle = folderUid ? `Folder Runner: ${collectionName}` : `Runner: ${collectionName}`;

  const panel = vscode.window.createWebviewPanel(
    'bruno.runnerPanel',
    panelTitle,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [context.extensionUri],
      retainContextWhenHidden: true
    }
  );

  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'bruno-icon.png');
  activeRunnerPanels.set(panelKey, panel);

  panel.onDidDispose(() => {
    activeRunnerPanels.delete(panelKey);
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

  const collectionUid = generateUidBasedOnHash(collectionRoot);

  const viewData = {
    viewType: 'collection-runner',
    collectionUid,
    collectionPath: collectionRoot,
    folderUid
  };

  let collectionLoaded = false;

  const loadCollection = async () => {
    if (collectionLoaded) return;
    collectionLoaded = true;

    // Show the runner UI immediately with just collection metadata. The full
    // tree scan + environment load happens in the background so the panel does
    // not feel like it hangs on cold open for large collections.
    try {
      await loadCollectionMetadata(collectionRoot, webviewSender);

      const uiStateSnapshotStore = new UiStateSnapshot();
      const collectionsSnapshotState = uiStateSnapshotStore.getCollections();
      const posixCollectionRoot = posixifyPath(collectionRoot);
      const collectionSnapshotState = collectionsSnapshotState?.find(
        (c: { pathname?: string }) => c?.pathname === collectionRoot || c?.pathname === posixCollectionRoot
      );
      if (collectionSnapshotState) {
        stateManager.sendTo(panel.webview, 'main:hydrate-app-with-ui-state-snapshot', collectionSnapshotState);
      }

      stateManager.sendTo(panel.webview, 'main:set-view', viewData);
    } catch (error) {
      console.error('RunnerPanel: Error loading collection metadata:', error);
    }

    // Background: full collection load (tree, watchers, envs).
    setCollectionsMessageSender(webviewSender);
    setWatcherMessageSender(webviewSender);

    try {
      const watcherExists = collectionWatcher.hasWatcher(collectionRoot);
      await openCollection(collectionWatcher, collectionRoot);
      await collectionWatcher.loadEnvironments(collectionRoot, collectionUid, webviewSender);

      // If a watcher already existed, openCollection won't trigger a scan so
      // this panel's webview needs the full item list loaded explicitly.
      if (watcherExists) {
        await collectionWatcher.loadFullCollection(collectionRoot, collectionUid, webviewSender);
      }
    } catch (error) {
      console.error('RunnerPanel: Error opening collection in background:', error);
    } finally {
      setCollectionsMessageSender(originalBroadcastSender);
      setWatcherMessageSender(originalBroadcastSender);
    }
  };

  panel.webview.onDidReceiveMessage(async (message: IpcMessage) => {
    if (message.type === 'invoke' && message.channel && message.requestId) {
      try {
        setCurrentWebview(panel.webview);

        const result = await handleInvoke(message.channel, message.args || []);

        panel.webview.postMessage({
          type: 'response',
          requestId: message.requestId,
          result
        });

        if (message.channel === 'renderer:ready') {
          // Re-send as fallback in case the proactive send was missed
          stateManager.sendTo(panel.webview, 'main:set-view', viewData);
          clearCurrentWebview();
          return;
        }

        clearCurrentWebview();
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

  // Start collection loading immediately in parallel with webview initialization.
  // Events are buffered by the IPC event queue and replayed when React mounts.
  loadCollection();
}

export function getActiveRunnerPanel(collectionRoot: string): vscode.WebviewPanel | undefined {
  return activeRunnerPanels.get(collectionRoot);
}
