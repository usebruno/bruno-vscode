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
import { openCollection, setMessageSender as setCollectionsMessageSender } from '../app/collections';
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

  panel.onDidDispose(() => {
    // stateManager.removeWebview(panel.webview);
    // transientPanels.delete(itemUid);
    // transientItems.delete(itemU`id);
    
    // Close the tab but create a notification system with a timeout, if resurrected, bring back thr item. After the timer expires, remove from everywhere 
    // // Notify all webviews to clean up the transient item from Redux
    // stateManager.broadcast('main:transient-request-closed', { collectionUid, itemUid });
    
    vscode.window.withProgress<boolean>(                                                                                                                                                                             
    {                                                                                                                                                                                                     
      location: vscode.ProgressLocation.Notification,
      title: `"${itemName}" closed — discarding…`,                                                                                                                                                        
      cancellable: true                                                                                                                                                                                 
    },                                                                                                                                                                                                    
    (progress, token) => new Promise<boolean>((resolve) => {                                                                                                                                               
      const total = 10_000;                  
      const step = 100;       
      let elapsed = 0;                                                                                                                                                                                    
      const interval = setInterval(() => {                                                                                                                                                                
        elapsed += step;                                                                                                                                                                                  
        progress.report({ increment: (step / total) * 100 });                                                                                                                                             
        if (elapsed >= total) { clearInterval(interval); resolve(false); }                                                                                                                                     
      }, step);               
      token.onCancellationRequested(() => { clearInterval(interval); resolve(true); });                                                                                                                       
    })                                                                                                                                                                                                    
  ).then((wasCancelled) => {
    if (wasCancelled){
      vscode.commands.executeCommand(                                                                                                                                                                     
        'bruno.openTransientRequest',                                                                                                                                                                   
        itemUid,                             
        itemName,                                                                                                                                                                                         
        collectionUid,
        collectionPath,
        item
      );       
    } else{
    stateManager.removeWebview(panel.webview);
    transientPanels.delete(itemUid);
    transientItems.delete(itemUid);
    stateManager.broadcast('main:transient-request-closed', { collectionUid, itemUid });
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

  const loadCollection = async () => {
    if (collectionLoaded) return;
    collectionLoaded = true;

    setCollectionsMessageSender(webviewSender);
    setWatcherMessageSender(webviewSender);

    try {
      await openCollection(collectionWatcher, collectionPath);

      setCollectionsMessageSender(originalBroadcastSender);
      setWatcherMessageSender(originalBroadcastSender);

      setTimeout(() => {
        // Forward the transient item data to this panel's Redux store
        const item = transientItems.get(itemUid);
        if (item) {
          stateManager.sendTo(panel.webview, 'main:add-transient-request', {
            collectionUid,
            item
          });
        }

        // Then tell the panel to render this request
        setTimeout(() => {
          stateManager.sendTo(panel.webview, 'main:set-view', {
            viewType: 'request',
            collectionUid,
            itemUid
          });
        }, 200);
      }, 500);
    } catch (error) {
      console.error('TransientRequestPanel: Error opening collection:', error);
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
