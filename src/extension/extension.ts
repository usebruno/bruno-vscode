import * as vscode from 'vscode';
import path from 'path';

import {
  setMessageSender,
  setWebviewSender,
  getRegisteredChannels
} from './ipc/handlers';

import { setExtensionContext as setPreferencesContext } from './store/preferences';
import { setExtensionContext as setGlobalEnvContext } from './store/global-environments';
import LastOpenedCollections, { setExtensionContext as setLastCollectionsContext } from './store/last-opened-collections';
import { setExtensionContext as setLastWorkspacesContext } from './store/last-opened-workspaces';
import { setExtensionContext as setDefaultWorkspaceContext } from './store/default-workspace';
import { setExtensionContext as setEnvSecretsContext } from './store/env-secrets';
import { setExtensionContext as setCollectionSecurityContext } from './store/collection-security';
import { setExtensionContext as setUiStateContext } from './store/ui-state-snapshot';
import { setExtensionContext as setCookiesContext, cookiesStore } from './store/cookies';
import { setExtensionContext as setOAuth2Context } from './store/oauth2';

import registerPreferencesIpc from './ipc/preferences';
import registerCollectionIpc from './ipc/collection';
import registerFilesystemIpc from './ipc/filesystem';
import registerGlobalEnvironmentsIpc from './ipc/global-environments';
import registerNetworkIpc from './ipc/network/index';
import registerWorkspaceIpc from './ipc/workspace';
import registerSimplePanelIpc from './ipc/simple-panel';
import { registerCoreHandlers } from './ipc/handlers';

import collectionWatcher, { setMessageSender as setWatcherMessageSender } from './app/collection-watcher';
import { setMessageSender as setCollectionsMessageSender, setEventEmitter as setCollectionsEventEmitter } from './app/collections';

import { stateManager } from './webview/state-manager';
import { BrunoEditorProvider, registerScriptErrorSourceHandler } from './editors/bruno-editor-provider';
import { NativeSidebarViewProvider } from './views/NativeSidebarViewProvider';
import { SidebarDragAndDropController } from './views/SidebarDragAndDropController';
import { registerSidebarCommands } from './commands/sidebar-commands';
import { OpenedCollections } from './store/opened-collections';
import { WorkspaceCollectionsProvider } from './views/WorkspaceCollectionsProvider';
import { LogsViewProvider } from './views/LogsViewProvider';
import logsStore from './store/logs';
import { registerTreeCommands, registerMainCommands } from './commands';
import { registerDirtyStateHandlers, registerSaveHandler } from './editors/dirty-state-manager';
import { createOAuth2UriHandler } from './ipc/network/authorize-user-in-system-browser';
import { openTransientRequestPanel } from './panels/transient-request-panel';
import { AppItem } from '@bruno-types';

let extensionActivated = false;

function initializeStores(context: vscode.ExtensionContext): void {
  setPreferencesContext(context);
  setGlobalEnvContext(context);
  setLastCollectionsContext(context);
  setLastWorkspacesContext(context);
  setDefaultWorkspaceContext(context);
  setEnvSecretsContext(context);
  setCollectionSecurityContext(context);
  setUiStateContext(context);
  setCookiesContext(context);
  setOAuth2Context(context);
}

function registerIpcHandlers(): void {
  registerCoreHandlers();
  registerPreferencesIpc();
  registerCollectionIpc(collectionWatcher);
  registerFilesystemIpc();
  registerGlobalEnvironmentsIpc();
  registerNetworkIpc();
  registerDirtyStateHandlers();
  registerScriptErrorSourceHandler();

  registerWorkspaceIpc({
    addWatcher: (_workspacePath: string) => {},
    removeWatcher: (_workspacePath: string) => {}
  });

  registerSimplePanelIpc();
}

function setupMessageBroadcaster(): void {
  const { emit } = require('./ipc/handlers');

  setMessageSender((channel: string, ...args: unknown[]) => {
    stateManager.broadcast(channel, ...args);
  });

  setWebviewSender((webview: vscode.Webview, channel: string, ...args: unknown[]) => {
    stateManager.sendTo(webview, channel, ...args);
  });

  setWatcherMessageSender((channel: string, ...args: unknown[]) => {
    stateManager.broadcast(channel, ...args);
  });

  setCollectionsMessageSender((channel: string, ...args: unknown[]) => {
    stateManager.broadcast(channel, ...args);
  });

  setCollectionsEventEmitter((event: string, ...args: unknown[]) => {
    emit(event, ...args);
  });
}

export function activate(context: vscode.ExtensionContext): void {
  // Guard against multiple activations (can happen during hot reload in dev)
  if (extensionActivated) {
    return;
  }
  extensionActivated = true;

  initializeStores(context);
  cookiesStore.initializeCookies();
  setupMessageBroadcaster();
  registerIpcHandlers();

  // Register OAuth2 URI handler for authorization code callbacks
  context.subscriptions.push(vscode.window.registerUriHandler(createOAuth2UriHandler()));

  const brunoEditorProvider = new BrunoEditorProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      BrunoEditorProvider.viewType,
      brunoEditorProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        },
        supportsMultipleEditorsPerDocument: false
      }
    )
  );

  const workspaceCollectionsProvider = new WorkspaceCollectionsProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      'bruno.workspaceCollections',
      workspaceCollectionsProvider
    )
  );

  const logsViewProvider = new LogsViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      LogsViewProvider.viewType,
      logsViewProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.clearLogs', () => {
      logsStore.clearLogs();
    })
  );

  registerTreeCommands(context, workspaceCollectionsProvider);
  registerMainCommands(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.openTransientRequest',
      (itemUid: string, itemName: string, collectionUid: string, collectionPath: string, item?: AppItem) => {
        openTransientRequestPanel(context, itemUid, itemName, collectionUid, collectionPath, item);
      }
    )
  );

  registerSaveHandler(context);

  // Handle folder renames in the file tree
  context.subscriptions.push(
    vscode.workspace.onDidRenameFiles((event) => {
      for (const { oldUri, newUri } of event.files) {
        const oldPath = oldUri.fsPath;
        const newPath = newUri.fsPath;

        const watcherPaths = collectionWatcher.getAllWatcherPaths();
        for (const watchPath of watcherPaths) {
          if (path.normalize(watchPath) === path.normalize(oldPath) || path.normalize(watchPath).startsWith(path.normalize(oldPath) + path.sep)) {
            // Calculate the new watch path
            const relativePath = watchPath.substring(oldPath.length);
            const newWatchPath = newPath + relativePath;
            collectionWatcher.handleCollectionFolderRename(watchPath, newWatchPath);
          }
        }
      }
    })
  );

  context.subscriptions.push({
    dispose: () => {
      stateManager.dispose();
      collectionWatcher.dispose();
      workspaceCollectionsProvider.dispose();
    }
  });

  const openedCollections = new OpenedCollections(context.globalState);
  const nativeSidebarProvider = new NativeSidebarViewProvider(openedCollections);
  const nativeSidebarView = vscode.window.createTreeView(NativeSidebarViewProvider.viewType, {
    treeDataProvider: nativeSidebarProvider,
    dragAndDropController: new SidebarDragAndDropController(nativeSidebarProvider),
    showCollapseAll: true
  });
  context.subscriptions.push(nativeSidebarView, nativeSidebarProvider, openedCollections);
  registerSidebarCommands(context, nativeSidebarProvider, nativeSidebarView, openedCollections);
  carryOverLegacyOpenedCollections(context, openedCollections);
}

/**
 * Carry the collections the webview sidebar had open into the tree's own list,
 * once, so they are not lost when the tree takes over. The old list is still
 * written by flows that remain, so it is not read again after this.
 */
function carryOverLegacyOpenedCollections(context: vscode.ExtensionContext, openedCollections: OpenedCollections): void {
  const CARRIED_OVER_KEY = 'bruno.sidebar.carriedOverLastOpened';
  if (context.globalState.get<boolean>(CARRIED_OVER_KEY)) {
    return;
  }
  void (async () => {
    for (const collectionPath of new LastOpenedCollections().getAll()) {
      await openedCollections.add(vscode.Uri.file(collectionPath));
    }
    await context.globalState.update(CARRIED_OVER_KEY, true);
  })();
}

export function deactivate(): void {
  extensionActivated = false;
  stateManager.dispose();
  collectionWatcher.dispose();
}
