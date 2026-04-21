import * as vscode from 'vscode';
import { WebviewHelper } from '../webview/helper';
import { stateManager } from '../webview/state-manager';
import { getCollectionName } from '../utils/path';
import { generateUidBasedOnHash } from '../utils/common';
import { posixifyPath } from '../utils/filesystem';
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
  loadCollectionMetadata,
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

  const collectionUid = generateUidBasedOnHash(collectionRoot);

  const viewData = {
    viewType: 'environment-settings',
    collectionUid,
    collectionPath: collectionRoot
  };

  let collectionLoaded = false;

  const panelSender = (channel: string, ...args: unknown[]) => {
    stateManager.sendTo(panel.webview, channel, ...args);
  };
  const broadcastSender = (channel: string, ...args: unknown[]) => {
    stateManager.broadcast(channel, ...args);
  };

  const loadCollection = async () => {
    if (collectionLoaded) return;
    collectionLoaded = true;

    // Surface the environment-settings UI immediately with just metadata.
    // Environments and any watcher scan then stream in from the background.
    try {
      await loadCollectionMetadata(collectionRoot, panelSender);
      stateManager.sendTo(panel.webview, 'main:set-view', viewData);
    } catch (error) {
      console.error('EnvironmentSettingsPanel: Error loading metadata:', error);
    }

    try {
      if (collectionWatcher.hasWatcher(collectionRoot)) {
        // Watcher already exists (collection open elsewhere). Only stream env
        // files to this panel — don't re-scan the full tree.
        await collectionWatcher.loadEnvironments(collectionRoot, collectionUid, panelSender);
      } else {
        setCollectionsMessageSender(panelSender);
        setWatcherMessageSender(panelSender);
        try {
          await openCollection(collectionWatcher, collectionRoot);
        } finally {
          setCollectionsMessageSender(broadcastSender);
          setWatcherMessageSender(broadcastSender);
        }
      }
    } catch (error) {
      console.error('EnvironmentSettingsPanel: Error populating environments:', error);
    }
  };

  panel.webview.onDidReceiveMessage(async (message: IpcMessage) => {
    if (message.type === 'invoke' && message.channel && message.requestId) {
      try {
        setCurrentWebview(panel.webview);

        let result: unknown;
        if (hasHandler(message.channel)) {
          result = await handleInvoke(message.channel, message.args || []);
        } else {
          result = null;
        }

        panel.webview.postMessage({
          type: 'response',
          requestId: message.requestId,
          result
        });

        if (message.channel === 'renderer:ready') {
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
  loadCollection();
}

export function getActiveEnvironmentPanel(collectionRoot: string): vscode.WebviewPanel | undefined {
  return activeEnvironmentPanels.get(collectionRoot);
}
