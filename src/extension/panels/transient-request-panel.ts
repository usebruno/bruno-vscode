/**
 * Opens a WebviewPanel for a transient (in-memory) request.
 *
 * Unlike regular requests that open via the custom editor provider (requires a file on disk),
 * transient requests use a standalone WebviewPanel. The panel loads the same React app
 * and sends main:set-view to render the request from Redux state.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { WebviewHelper } from '../webview/helper';
import { showSaveRequestPicker } from '../utils/folder-picker';
import { stateManager } from '../webview/state-manager';
import {
  setCurrentWebview,
  clearCurrentWebview,
  handleInvoke,
  hasHandler
} from '../ipc/handlers';
import { openCollection, loadCollectionMetadata, setMessageSender as setCollectionsMessageSender } from '../app/collections';
import { setMessageSender as setWatcherMessageSender } from '../app/collection-watcher';
import collectionWatcher from '../app/collection-watcher';
import { AppItem } from '@bruno-types';

interface IpcMessage {
  type: 'invoke' | 'send';
  channel: string;
  args?: unknown[];
  requestId?: string;
}

// Track open transient panels by item uid
const transientPanels = new Map<string, vscode.WebviewPanel>();

// Store transient item data so we can forward it to new panels
const transientItems = new Map<string, Record<string, unknown>>();

export function storeTransientItem(itemUid: string, item: Record<string, unknown>): void {
  transientItems.set(itemUid, item);
}

export async function openTransientRequestPanel(
  context: vscode.ExtensionContext,
  itemUid: string,
  itemName: string,
  collectionUid: string,
  collectionPath: string,
  item?: AppItem
): Promise<void> {
  // If panel already exists for this item, reveal it
  const existing = transientPanels.get(itemUid);
  if (existing) {
    try {
      existing.reveal(vscode.ViewColumn.One);
      return;
    } catch {
      transientPanels.delete(itemUid);
    }
  }

  const panel = vscode.window.createWebviewPanel(
    'bruno.transientRequest',
    itemName,
    vscode.ViewColumn.One,
    {
      ...WebviewHelper.getWebviewOptions(context.extensionUri),
      retainContextWhenHidden: true
    }
  );

  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'bruno-icon.png');

  transientPanels.set(itemUid, panel);
  panel.webview.html = WebviewHelper.getHtmlForWebview(panel.webview, context.extensionUri);
  stateManager.addWebview(panel.webview);
  stateManager.setActiveEditorWebview(panel.webview);

  panel.onDidChangeViewState((e) => {
    if (e.webviewPanel.active) {
      stateManager.setActiveEditorWebview(panel.webview);
    }
  });

  panel.onDidDispose(() => {
    const GRACE_MS = 10_000;

    const timer = setTimeout(() => {
      stateManager.removeWebview(panel.webview);
      transientPanels.delete(itemUid);
      transientItems.delete(itemUid);
      stateManager.broadcast('main:transient-request-closed', { collectionUid, itemUid });
    }, GRACE_MS);

    vscode.window.showInformationMessage(
      `"${itemName}" closed. Click Undo to restore.`,
      'Undo'
    ).then((choice) => {
      if (choice === 'Undo') {
        clearTimeout(timer);
        vscode.commands.executeCommand(
          'bruno.openTransientRequest',
          itemUid,
          itemName,
          collectionUid,
          collectionPath
        );
      }
    });
  });

  const webviewSender = (channel: string, ...args: unknown[]) => {
    stateManager.sendTo(panel.webview, channel, ...args);
  };

  const originalBroadcastSender = (channel: string, ...args: unknown[]) => {
    stateManager.broadcast(channel, ...args);
  };

  let collectionLoaded = false;

  // Render the transient request as soon as the webview is ready. We send the
  // collection metadata + the transient item + the view type in a single
  // burst so the UI shows the request immediately. The full collection tree
  // (environments, siblings, watchers) is populated in the background via
  // openCollection so scripts/vars eventually resolve, but the user does not
  // wait for a full scan to see the request pane.
  const loadCollection = async () => {
    if (collectionLoaded) return;
    collectionLoaded = true;

    // 1) Seed collection metadata and the transient item in Redux immediately.
    await loadCollectionMetadata(collectionPath, webviewSender);

    const item = transientItems.get(itemUid);
    if (item) {
      stateManager.sendTo(panel.webview, 'main:add-transient-request', {
        collectionUid,
        item
      });

      // 2) Flip the view as soon as the item is in Redux. ViewContainer will
      // render the request pane; any missing data (e.g. environments) fills
      // in progressively as the background scan completes.
      stateManager.sendTo(panel.webview, 'main:set-view', {
        viewType: 'request',
        collectionUid,
        itemUid
      });
    }

    // 3) Kick off the full collection load in the background for env/tree.
    setCollectionsMessageSender(webviewSender);
    setWatcherMessageSender(webviewSender);
    try {
      await openCollection(collectionWatcher, collectionPath);
    } catch (error) {
      console.error('TransientRequestPanel: Error opening collection:', error);
    } finally {
      setCollectionsMessageSender(originalBroadcastSender);
      setWatcherMessageSender(originalBroadcastSender);
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
          result = null;
        }

        panel.webview.postMessage({
          type: 'response',
          requestId,
          result
        });

        if (channel === 'renderer:ready') {
          clearCurrentWebview();
          await loadCollection();
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
        // Handle save transient request — args[0] is the serialized item data
        if (channel === 'transient:save-request' && args?.[0]) {
          await saveTransientRequest(panel, itemUid, collectionPath, args[0] as Record<string, unknown>);
        }
        if (channel === 'transient:item-updated' && args?.[0]) {
          const { itemUid: updatedUid, item } = args[0] as { itemUid: string; item: Record<string, unknown> };
          if (updatedUid && item) {
            transientItems.set(updatedUid, item);
          }
        }
        if (channel === 'transient:item-ready' && args?.[0]) {
          const { itemUid: readyItemUid, collectionUid: readyCollUid } = args[0] as { itemUid: string; collectionUid: string };
          if (readyItemUid && readyCollUid) {
            stateManager.sendTo(panel.webview, 'main:set-view', {
              viewType: 'request',
              collectionUid: readyCollUid,
              itemUid: readyItemUid
            });
          }
        }
      } finally {
        clearCurrentWebview();
      }
    }
  });
  
}

export function closeTransientPanel(itemUid: string): void {
  const panel = transientPanels.get(itemUid);
  if (panel) {
    panel.dispose();
    transientPanels.delete(itemUid);
  }
}

/**
 * Save a transient request to disk.
 * Shows a folder picker, asks for a name, writes the file, closes the panel,
 * and opens the saved file in the regular editor.
 */
async function saveTransientRequest(
  panel: vscode.WebviewPanel,
  itemUid: string,
  collectionPath: string,
  itemData: Record<string, unknown>
): Promise<void> {
  // Step 1: Pick a folder and enter a name
  const item = transientItems.get(itemUid);
  const defaultName = (item?.name as string) || 'Untitled';

  const result = await showSaveRequestPicker(collectionPath, defaultName, {
    title: `Save request to ${path.basename(collectionPath)}`
  });

  if (!result) return;

  const { folder, name } = result;

  // Step 2: Determine format and write the file
  const format = fs.existsSync(path.join(collectionPath, 'opencollection.yml')) ? 'yml' : 'bru';
  const filename = `${name}.${format}`;
  const fullPath = path.join(folder, filename);

  if (fs.existsSync(fullPath)) {
    const overwrite = await vscode.window.showWarningMessage(
      `"${filename}" already exists in this folder. Overwrite?`,
      'Overwrite',
      'Cancel'
    );
    if (overwrite !== 'Overwrite') return;
  }

  try {
    // Write the file using the stringify worker (same as renderer:new-request)
    const { stringifyRequestViaWorker } = require('@usebruno/filestore');
    const content = await stringifyRequestViaWorker({ ...itemData, name, filename }, { format });
    fs.writeFileSync(fullPath, content, 'utf-8');

    // Close the transient panel
    panel.dispose();

    // Open the saved file in the regular editor
    await vscode.commands.executeCommand('vscode.openWith', vscode.Uri.file(fullPath), 'bruno.requestEditor');

    vscode.window.showInformationMessage(`Request saved as "${name}"`);
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to save request: ${err.message}`);
  }
}
