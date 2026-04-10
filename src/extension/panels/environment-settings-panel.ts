import * as vscode from 'vscode';
import { WebviewHelper } from '../webview/helper';
import { stateManager } from '../webview/state-manager';
import { getCollectionName } from '../utils/path';
import { generateUidBasedOnHash } from '../utils/common';
import { getCollectionStats, posixifyPath } from '../utils/filesystem';
import { transformBrunoConfigAfterRead } from '../utils/transformBrunoConfig';
import {
  setCurrentWebview,
  clearCurrentWebview,
  handleInvoke,
  hasHandler
} from '../ipc/handlers';
import {
  getCollectionConfigFile,
  openCollection,
  setMessageSender as setCollectionsMessageSender
} from '../app/collections';
import collectionWatcher, {
  setMessageSender as setWatcherMessageSender
} from '../app/collection-watcher';

interface IpcMessage {
  type: 'invoke' | 'send';
  channel: string;
  args?: unknown[];
  requestId?: string;
}

const activeEnvironmentPanels = new Map<string, vscode.WebviewPanel>();

function handleIpcSend(channel: string, args: unknown[]): void {
  if (channel === 'open-external' && typeof args[0] === 'string') {
    vscode.env.openExternal(vscode.Uri.parse(args[0]));
  }
}

export async function openEnvironmentSettingsPanel(
  context: vscode.ExtensionContext,
  collectionRoot: string
): Promise<void> {
  const existingPanel = activeEnvironmentPanels.get(collectionRoot);
  if (existingPanel) {
    existingPanel.reveal();
    return;
  }

  const collectionName = getCollectionName(collectionRoot);

  const panel = vscode.window.createWebviewPanel(
    'bruno.environmentSettings',
    `Environments: ${collectionName}`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [context.extensionUri],
      retainContextWhenHidden: true
    }
  );

  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'bruno-icon.png');
  activeEnvironmentPanels.set(collectionRoot, panel);

  panel.onDidDispose(() => {
    activeEnvironmentPanels.delete(collectionRoot);
    stateManager.removeWebview(panel.webview);
  });

  panel.webview.html = WebviewHelper.getHtmlForWebview(panel.webview, context.extensionUri);
  stateManager.addWebview(panel.webview);

  let collectionLoaded = false;

  const loadCollection = async () => {
    if (collectionLoaded) return;
    collectionLoaded = true;

    const collectionUid = generateUidBasedOnHash(collectionRoot);

    try {
      if (collectionWatcher.hasWatcher(collectionRoot)) {
        // Collection is already open in another webview (e.g., request tab).
        // Send collection data ONLY to this panel's webview — do NOT broadcast
        // and do NOT re-add the watcher (which would destroy existing watchers
        // and re-scan the entire collection, disrupting the request tab).
        let brunoConfig = await getCollectionConfigFile(collectionRoot) as any;

        const defaultIgnores = ['node_modules', '.git'];
        const userIgnores = brunoConfig.ignore || [];
        brunoConfig.ignore = [...new Set([...defaultIgnores, ...userIgnores])];

        brunoConfig = await transformBrunoConfigAfterRead(brunoConfig, collectionRoot);

        const { size, filesCount } = await getCollectionStats(collectionRoot);
        brunoConfig.size = size;
        brunoConfig.filesCount = filesCount;

        stateManager.sendTo(panel.webview, 'main:collection-opened', posixifyPath(collectionRoot), collectionUid, brunoConfig, false);

        // We need a small delay for the webview to process main:collection-opened first.
        const panelSender = (channel: string, ...args: unknown[]) => {
          stateManager.sendTo(panel.webview, channel, ...args);
        };
        await new Promise(resolve => setTimeout(resolve, 300));
        await collectionWatcher.loadEnvironments(collectionRoot, collectionUid, panelSender);

        // The panel is registered with stateManager so it will receive all future
        // broadcast events (tree updates, env changes, etc.) from the existing watcher.
      } else {
        // Collection not yet open — use targeted sender approach so only this
        // panel's webview receives the initial load events, then restore broadcast.
        const panelSender = (channel: string, ...args: unknown[]) => {
          stateManager.sendTo(panel.webview, channel, ...args);
        };
        const broadcastSender = (channel: string, ...args: unknown[]) => {
          stateManager.broadcast(channel, ...args);
        };

        setCollectionsMessageSender(panelSender);
        setWatcherMessageSender(panelSender);

        try {
          await openCollection(collectionWatcher, collectionRoot);
        } finally {
          setCollectionsMessageSender(broadcastSender);
          setWatcherMessageSender(broadcastSender);
        }
      }

      setTimeout(() => {
        stateManager.sendTo(panel.webview, 'main:set-view', {
          viewType: 'environment-settings',
          collectionUid,
          collectionPath: collectionRoot
        });
      }, 500);
    } catch (error) {
      console.error('EnvironmentSettingsPanel: Error opening collection:', error);
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

        let result: unknown;
        if (hasHandler(message.channel)) {
          result = await handleInvoke(message.channel, message.args || []);
        } else {
          result = null;
        }
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

export function getActiveEnvironmentPanel(collectionRoot: string): vscode.WebviewPanel | undefined {
  return activeEnvironmentPanels.get(collectionRoot);
}
