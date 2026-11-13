/**
 * Custom editor for a transient (in-memory) request, opened as a virtual `bruno-transient:` document.
 * Being a custom document gives it the same dirty dot, save-on-close prompt and Save All as a saved
 * request. Renders the request from Redux state via main:set-view.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { WebviewHelper } from '../webview/helper';
import { showSaveRequestPicker } from '../utils/folder-picker';
import { posixifyPath } from '../utils/filesystem';
import { parseRequest } from '../utils/parse';
import { hydrateRequestWithUuid } from '../utils/collection';
import { stateManager } from '../webview/state-manager';
import {
  broadcastToAllWebviews,
  setCurrentWebview,
  clearCurrentWebview,
  handleInvoke,
  hasHandler
} from '../ipc/handlers';
import { loadCollectionMetadata } from '../app/collections';
import { notifyActiveItemToSidebar, clearActiveItemFromSidebar } from '../ipc/collection';
import collectionWatcher from '../app/collection-watcher';
import { AppItem } from '@bruno-types';

interface IpcMessage {
  type: 'invoke' | 'send';
  channel: string;
  args?: unknown[];
  requestId?: string;
}

interface TransientMeta {
  itemName: string;
  collectionUid: string;
  collectionPath: string;
}

const TRANSIENT_SCHEME = 'bruno-transient';

// Max wait for the webview to answer a VS Code initiated save.
const SAVE_HANDSHAKE_MS = 5_000;

// If the tab is still open this long after a VS Code initiated save, treat it as Save All.
const CLOSE_AFTER_SAVE_MS = 500;

// Track open transient panels by item uid
const transientPanels = new Map<string, vscode.WebviewPanel>();

// Store transient item data so we can forward it to new panels
const transientItems = new Map<string, Record<string, unknown>>();

// Needed when Undo reopens a closed panel
const transientMeta = new Map<string, TransientMeta>();

const savedPanels = new Set<string>();

// VS Code initiated saves awaiting the webview's transient:save-request
const pendingSaves = new Map<string, { resolve: (saved: boolean) => void; timer: ReturnType<typeof setTimeout> }>();

export function storeTransientItem(itemUid: string, item: Record<string, unknown>): void {
  transientItems.set(itemUid, item);
}

// The item name labels the tab; the uid keeps the URI unique.
function transientUri(itemUid: string, itemName: string): vscode.Uri {
  return vscode.Uri.from({ scheme: TRANSIENT_SCHEME, path: `/${itemUid}/${itemName}` });
}

function itemUidFromUri(uri: vscode.Uri): string {
  return uri.path.split('/')[1] ?? '';
}

class TransientRequestDocument implements vscode.CustomDocument {
  isDirty = false;

  constructor(readonly uri: vscode.Uri, readonly itemUid: string) {}

  dispose(): void {}
}

export class TransientRequestEditorProvider implements vscode.CustomEditorProvider<TransientRequestDocument> {
  public static readonly viewType = 'bruno.transientRequest';

  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.CustomDocumentContentChangeEvent<TransientRequestDocument>>();
  readonly onDidChangeCustomDocument = this.onDidChangeEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  openCustomDocument(uri: vscode.Uri): TransientRequestDocument {
    return new TransientRequestDocument(uri, itemUidFromUri(uri));
  }

  resolveCustomEditor(document: TransientRequestDocument, panel: vscode.WebviewPanel): void {
    const meta = transientMeta.get(document.itemUid);
    // In-memory only, so a tab restored after a reload has nothing to show.
    if (!meta || !transientItems.has(document.itemUid)) {
      panel.dispose();
      return;
    }
    setupTransientPanel(this.context, panel, document, meta, this);
  }

  markDirty(document: TransientRequestDocument): void {
    if (document.isDirty) return;
    document.isDirty = true;
    this.onDidChangeEmitter.fire({ document });
  }

  // A custom document only goes clean via save or revert, and revert acts on the active editor.
  async markClean(document: TransientRequestDocument, panel: vscode.WebviewPanel): Promise<void> {
    if (!document.isDirty) return;
    if (panel.active) {
      await vscode.commands.executeCommand('workbench.action.files.revert');
    }
  }

  async saveCustomDocument(document: TransientRequestDocument): Promise<void> {
    // Like a saved request, auto-save only clears the dirty marker (no folder picker while typing).
    const autoSave = vscode.workspace.getConfiguration('files', document.uri).get<string>('autoSave');
    if (autoSave && autoSave !== 'off') {
      document.isDirty = false;
      return;
    }

    const panel = transientPanels.get(document.itemUid);
    if (!panel) return;

    // The draft lives in the webview; ask it to send the item back.
    const saved = await new Promise<boolean>((resolve) => {
      pendingSaves.get(document.itemUid)?.resolve(false);
      const timer = setTimeout(() => settlePendingSave(document.itemUid, false), SAVE_HANDSHAKE_MS);
      pendingSaves.set(document.itemUid, { resolve, timer });
      stateManager.sendTo(panel.webview, 'main:trigger-save');
    });

    if (!saved) {
      // Keeps the tab open and dirty (e.g. folder picker dismissed).
      throw new vscode.CancellationError();
    }
    document.isDirty = false;
  }

  async saveCustomDocumentAs(): Promise<void> {
    throw new Error('Save As is not supported for transient requests');
  }

  async revertCustomDocument(document: TransientRequestDocument): Promise<void> {
    document.isDirty = false;
  }

  async backupCustomDocument(
    _document: TransientRequestDocument,
    context: vscode.CustomDocumentBackupContext
  ): Promise<vscode.CustomDocumentBackup> {
    // Not restored across reloads; nothing to write.
    return { id: context.destination.toString(), delete: () => {} };
  }
}

function settlePendingSave(itemUid: string, saved: boolean): void {
  const pending = pendingSaves.get(itemUid);
  if (!pending) {
    return;
  }
  clearTimeout(pending.timer);
  pendingSaves.delete(itemUid);
  pending.resolve(saved);
}

export async function openTransientRequestPanel(
  _context: vscode.ExtensionContext,
  itemUid: string,
  itemName: string,
  collectionUid: string,
  collectionPath: string,
  _item?: AppItem
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

  transientMeta.set(itemUid, { itemName, collectionUid, collectionPath });

  await vscode.commands.executeCommand(
    'vscode.openWith',
    transientUri(itemUid, itemName),
    TransientRequestEditorProvider.viewType,
    { viewColumn: vscode.ViewColumn.One, preview: false }
  );
}

function setupTransientPanel(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel,
  document: TransientRequestDocument,
  meta: TransientMeta,
  provider: TransientRequestEditorProvider
): void {
  const { itemUid } = document;
  const { itemName, collectionUid, collectionPath } = meta;
  // panel.webview throws inside onDidDispose, so capture it now.
  const webview = panel.webview;

  webview.options = WebviewHelper.getWebviewOptions(context.extensionUri);
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'bruno-icon.png');

  transientPanels.set(itemUid, panel);
  webview.html = WebviewHelper.getHtmlForWebview(webview, context.extensionUri);
  stateManager.addWebview(webview);
  stateManager.setActiveEditorWebview(webview);

  notifyActiveItemToSidebar(itemUid);
  panel.onDidChangeViewState((e) => {
    if (e.webviewPanel.active) {
      stateManager.setActiveEditorWebview(webview);
      notifyActiveItemToSidebar(itemUid);
    } else {
      clearActiveItemFromSidebar(itemUid);
    }
  });

  panel.onDidDispose(() => {
    stateManager.broadcast('main:transient-request-closed', { collectionUid, itemUid });
    settlePendingSave(itemUid, false);

    clearActiveItemFromSidebar(itemUid);
    if (transientPanels.get(itemUid) === panel) {
      transientPanels.delete(itemUid);
    }
    if (savedPanels.has(itemUid)) {
      savedPanels.delete(itemUid);
      stateManager.removeWebview(webview);
      transientItems.delete(itemUid);
      transientMeta.delete(itemUid);
      return;
    }

    const GRACE_MS = 10_000;

    const timer = setTimeout(() => {
      stateManager.removeWebview(webview);
      transientItems.delete(itemUid);
      transientMeta.delete(itemUid);
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
    stateManager.sendTo(webview, channel, ...args);
  };

  let collectionLoaded = false;

  // Render the transient request as soon as the webview is ready. We send the
  // collection metadata + the transient item + the view type in a single
  // burst so the UI shows the request immediately. The full collection tree
  // (environments, siblings, watchers) is populated in the background so
  // scripts/vars eventually resolve, but the user does not wait for a full
  // scan to see the request pane.
  const loadCollection = async () => {
    if (collectionLoaded) return;
    collectionLoaded = true;

    // 1) Seed collection metadata and the transient item in Redux immediately.
    const loadedUid = await loadCollectionMetadata(collectionPath, webviewSender);
    const uid = loadedUid || collectionUid;

    const item = transientItems.get(itemUid);
    if (item) {
      // Broadcast so the sidebar store also tracks the transient request.
      stateManager.broadcast('main:add-transient-request', {
        collectionUid,
        item
      });

      // 2) Flip the view as soon as the item is in Redux. ViewContainer will
      // render the request pane; any missing data (e.g. environments) fills
      // in progressively as the background scan completes.
      stateManager.sendTo(webview, 'main:set-view', {
        viewType: 'request',
        collectionUid,
        itemUid
      });
    }

    // 3) Stream the whole collection into THIS webview's store.
    try {
      // Register watcher if not already present.
      const nativePath = path.normalize(collectionPath);
      const posixPath = posixifyPath(collectionPath);
      if (!collectionWatcher.hasWatcher(nativePath) && !collectionWatcher.hasWatcher(posixPath)) {
        collectionWatcher.setupWatchersOnly(nativePath, uid);
      }
      await collectionWatcher.loadFullCollection(collectionPath, uid, webviewSender);
    } catch (error) {
      console.error('TransientRequestPanel: Error loading collection:', error);
    }
  };

  webview.onDidReceiveMessage(async (message: IpcMessage) => {
    const { type, channel, args, requestId } = message;

    if (type === 'invoke' && requestId) {
      setCurrentWebview(webview);

      try {
        let result: unknown;

        // No file to mark dirty, so the draft drives this document's dirty state.
        const dirtyPayload = channel === 'renderer:set-dirty-state'
          ? (args?.[0] as { itemUid?: string; isDirty?: boolean } | undefined)
          : undefined;

        if (dirtyPayload?.itemUid === itemUid) {
          if (dirtyPayload.isDirty) {
            provider.markDirty(document);
          } else {
            await provider.markClean(document, panel);
          }
          result = { success: true };
        } else if (hasHandler(channel)) {
          result = await handleInvoke(channel, args || []);
        } else {
          result = null;
        }

        webview.postMessage({
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
        webview.postMessage({
          type: 'response',
          requestId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      } finally {
        clearCurrentWebview();
      }
    } else if (type === 'send') {
      setCurrentWebview(webview);
      try {
        if (channel === 'open-external' && typeof args?.[0] === 'string') {
          vscode.env.openExternal(vscode.Uri.parse(args[0]));
        }
        if (channel === 'sidebar:open-collection-runner' && args?.[0] && typeof args[0] === 'object') {
          const { collectionPath, folderUid: fUid } = args[0] as { collectionPath?: string; folderUid?: string };
          if (collectionPath) {
            vscode.commands.executeCommand('bruno.runCollection', vscode.Uri.file(collectionPath), fUid);
          }
        }
        if (channel === 'sidebar:open-collection-settings' && args?.[0] && typeof args[0] === 'object') {
          const { collectionPath: cp } = args[0] as { collectionPath?: string };
          if (cp) {
            vscode.commands.executeCommand('bruno.openSettings', vscode.Uri.file(cp));
          }
        }
        if (channel === 'sidebar:open-collection-variables' && args?.[0] && typeof args[0] === 'object') {
          const { collectionPath: cp } = args[0] as { collectionPath?: string };
          if (cp) {
            vscode.commands.executeCommand('bruno.openVariables', vscode.Uri.file(cp));
          }
        }
        if (channel === 'sidebar:open-environment-settings' && args?.[0] && typeof args[0] === 'object') {
          const { collectionPath: cp } = args[0] as { collectionPath?: string };
          if (cp) {
            vscode.commands.executeCommand('bruno.openEnvironmentSettings', vscode.Uri.file(cp));
          }
        }
        if (channel === 'sidebar:open-global-environments') {
          vscode.commands.executeCommand('bruno.openGlobalEnvironments');
        }
        // Handle save transient request — args[0] is the serialized item data
        if (channel === 'transient:save-request' && args?.[0]) {
          await handleSaveRequest(panel, document, provider, collectionUid, collectionPath, args[0] as Record<string, unknown>);
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
            stateManager.sendTo(webview, 'main:set-view', {
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

// Handles transient:save-request, answering either a VS Code save (close prompt, Save All) or Bruno's own save.
async function handleSaveRequest(
  panel: vscode.WebviewPanel,
  document: TransientRequestDocument,
  provider: TransientRequestEditorProvider,
  collectionUid: string,
  collectionPath: string,
  itemData: Record<string, unknown>
): Promise<void> {
  const { itemUid } = document;
  const pending = pendingSaves.get(itemUid);
  if (pending) {
    // Webview answered; don't time out the folder picker.
    clearTimeout(pending.timer);
  }

  const savedPath = await saveTransientRequest(itemUid, collectionUid, collectionPath, itemData);

  if (savedPath) {
    savedPanels.add(itemUid);
  }

  if (pending) {
    const viewColumn = panel.viewColumn;
    let disposed = false;
    const disposeListener = panel.onDidDispose(() => { disposed = true; });
    settlePendingSave(itemUid, !!savedPath);
    if (savedPath) {
      // The close prompt closes the tab itself; swap in the saved file only if it stays open (Save All).
      setTimeout(() => {
        disposeListener.dispose();
        if (!disposed) {
          openSavedRequest(panel, savedPath, viewColumn);
        }
      }, CLOSE_AFTER_SAVE_MS);
    } else {
      disposeListener.dispose();
    }
    return;
  }

  if (savedPath) {
    // Clear the dot so closing the panel doesn't raise the save prompt.
    await provider.markClean(document, panel);
    await openSavedRequest(panel, savedPath, panel.viewColumn);
  }
}

async function openSavedRequest(
  panel: vscode.WebviewPanel,
  savedPath: string,
  viewColumn: vscode.ViewColumn | undefined
): Promise<void> {
  await vscode.commands.executeCommand(
    'vscode.openWith',
    vscode.Uri.file(savedPath),
    'bruno.requestEditor',
    { viewColumn: viewColumn ?? vscode.ViewColumn.Active, preview: false }
  );
  panel.dispose();

  vscode.window.showInformationMessage(`Request saved as "${path.parse(savedPath).name}"`);
}

// Picks a folder and name and writes the file. Returns its path, or undefined if cancelled or failed.
async function saveTransientRequest(
  itemUid: string,
  collectionUid: string,
  collectionPath: string,
  itemData: Record<string, unknown>
): Promise<string | undefined> {
  // Step 1: Pick a folder and enter a name
  const item = transientItems.get(itemUid);
  const defaultName = (item?.name as string) || 'Untitled';

  const result = await showSaveRequestPicker(collectionPath, defaultName, {
    title: `Save request to ${path.basename(collectionPath)}`
  });

  if (!result) return undefined;

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
    if (overwrite !== 'Overwrite') return undefined;
  }

  try {
    const { stringifyRequestViaWorker } = require('@usebruno/filestore');
    const content = await stringifyRequestViaWorker({ ...itemData, name, filename }, { format });
    fs.writeFileSync(fullPath, content, 'utf-8');

    const requestData = await parseRequest(content, { format });
    hydrateRequestWithUuid(requestData, fullPath);
    broadcastToAllWebviews('main:collection-tree-updated', 'addFile', {
      meta: {
        collectionUid,
        pathname: posixifyPath(fullPath),
        name: filename
      },
      data: requestData
    });

    return fullPath;
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to save request: ${err.message}`);
    return undefined;
  }
}
