import * as vscode from 'vscode';

import {
  setMessageSender,
  setWebviewSender,
  getRegisteredChannels
} from './ipc/handlers';

import { setExtensionContext as setPreferencesContext } from './store/preferences';
import { setExtensionContext as setGlobalEnvContext } from './store/global-environments';
import { setExtensionContext as setLastCollectionsContext } from './store/last-opened-collections';
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
import { registerCoreHandlers } from './ipc/handlers';

import collectionWatcher, { setMessageSender as setWatcherMessageSender } from './app/collection-watcher';
import { setMessageSender as setCollectionsMessageSender, setEventEmitter as setCollectionsEventEmitter } from './app/collections';

import { stateManager } from './webview/state-manager';
import { BrunoEditorProvider } from './editors/bruno-editor-provider';
import { SidebarViewProvider } from './views/SidebarViewProvider';
import { WorkspaceCollectionsProvider } from './views/WorkspaceCollectionsProvider';
import { LogsViewProvider } from './views/LogsViewProvider';
import logsStore from './store/logs';
import { registerTreeCommands, registerMainCommands } from './commands';
import { registerDirtyStateHandlers, registerSaveHandler } from './editors/dirty-state-manager';

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

  registerWorkspaceIpc({
    addWatcher: (_workspacePath: string) => {},
    removeWatcher: (_workspacePath: string) => {}
  });
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

  const sidebarProvider = new SidebarViewProvider(context.extensionUri, stateManager);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarViewProvider.viewType,
      sidebarProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
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
  registerMainCommands(context, sidebarProvider);

  registerSaveHandler(context);

  // Handle folder renames in the file tree
  context.subscriptions.push(
    vscode.workspace.onDidRenameFiles((event) => {
      for (const { oldUri, newUri } of event.files) {
        const oldPath = oldUri.fsPath;
        const newPath = newUri.fsPath;

        const watcherPaths = collectionWatcher.getAllWatcherPaths();
        for (const watchPath of watcherPaths) {
          if (watchPath === oldPath || watchPath.startsWith(oldPath + '/') || watchPath.startsWith(oldPath + '\\')) {
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

}

export function deactivate(): void {
  extensionActivated = false;
  stateManager.dispose();
  collectionWatcher.dispose();
}
