import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BrunoEditorProvider, setPendingVariablesMode } from '../editors/bruno-editor-provider';
import { SidebarViewProvider } from '../views/SidebarViewProvider';
import { findCollectionRoot, isCollectionRoot } from '../utils/path';
import { openRunnerPanel } from '../panels/runner-panel';
import { openGlobalEnvironmentsPanel } from '../panels/global-environments-panel';
import { openEnvironmentSettingsPanel } from '../panels/environment-settings-panel';
import { openCreateCollectionPanel } from '../panels/create-collection-panel';
import { openImportCollectionPanel } from '../panels/import-collection-panel';
import { openNewRequestPanel } from '../panels/new-request-panel';
import { openExportCollectionPanel } from '../panels/export-collection-panel';
import { openCloneCollectionPanel } from '../panels/clone-collection-panel';
import { handleInvoke } from '../ipc/handlers';
import { openCollectionDialog } from '../app/collections';
import collectionWatcher from '../app/collection-watcher';
import { getCollectionFormat } from '../utils/filesystem';
import { stateManager } from '../webview/state-manager';

const { stringifyCollection } = require('@usebruno/filestore');

/**
 * Ensure the collection root file (collection.bru or opencollection.yml) exists.
 * If it doesn't, create a default one. Returns the path to the root file.
 */
const ensureCollectionRootFile = async (collectionRoot: string): Promise<string> => {
  try {
    const format = getCollectionFormat(collectionRoot);
    if (format === 'yml') {
      // For yml format, the root config is in opencollection.yml which must already exist
      // (getCollectionFormat would have thrown if it didn't)
      return path.join(collectionRoot, 'opencollection.yml');
    }
    // For bru format, check if collection.bru exists
    const collectionBruPath = path.join(collectionRoot, 'collection.bru');
    if (!fs.existsSync(collectionBruPath)) {
      const brunoJsonPath = path.join(collectionRoot, 'bruno.json');
      let collectionName = path.basename(collectionRoot);
      if (fs.existsSync(brunoJsonPath)) {
        try {
          const brunoConfig = JSON.parse(fs.readFileSync(brunoJsonPath, 'utf8'));
          collectionName = brunoConfig.name || collectionName;
        } catch (_) { /* use folder name */ }
      }
      const collectionRoot_ = { meta: { name: collectionName } };
      const brunoConfig = { version: '1', name: collectionName, type: 'collection' };
      const content = await stringifyCollection(collectionRoot_, brunoConfig, { format: 'bru' });
      fs.writeFileSync(collectionBruPath, content, 'utf8');
    }
    return collectionBruPath;
  } catch (_) {
    // Fallback: just return the collection.bru path (will be created with minimal content)
    const collectionBruPath = path.join(collectionRoot, 'collection.bru');
    if (!fs.existsSync(collectionBruPath)) {
      fs.writeFileSync(collectionBruPath, 'meta {\n  name: ' + path.basename(collectionRoot) + '\n}\n', 'utf8');
    }
    return collectionBruPath;
  }
};

export function registerMainCommands(
  context: vscode.ExtensionContext,
  sidebarProvider: SidebarViewProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.switchFileEditor', async () => {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && (activeEditor.document.uri.fsPath.endsWith('.bru') || activeEditor.document.uri.fsPath.endsWith('.yml'))) {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        await vscode.commands.executeCommand(
          'vscode.openWith',
          activeEditor.document.uri,
          BrunoEditorProvider.viewType
        );
      }
    })
  );

  // Switch from Bruno editor to text editor
  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.switchToTextEditor', async () => {
      const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
      if (activeTab && activeTab.input instanceof vscode.TabInputCustom) {
        const uri = activeTab.input.uri;
        if (uri.fsPath.endsWith('.bru') || uri.fsPath.endsWith('.yml')) {
          await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
          await vscode.commands.executeCommand('vscode.openWith', uri, 'default');
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.runCollection', async (uri: vscode.Uri) => {
      if (!uri) {
        vscode.window.showWarningMessage('No folder selected');
        return;
      }

      const fsPath = uri.fsPath;
      let targetPath = fsPath;

      if (fsPath.endsWith('.bru') || fsPath.endsWith('.yml')) {
        targetPath = path.dirname(fsPath);
      }

      let collectionRoot = findCollectionRoot(targetPath);

      if (!collectionRoot && isCollectionRoot(targetPath)) {
        collectionRoot = targetPath;
      }

      if (!collectionRoot) {
        vscode.window.showWarningMessage('No Bruno collection found in this folder');
        return;
      }

      await openRunnerPanel(context, collectionRoot, targetPath);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.openSettings', async (uri: vscode.Uri) => {
      if (!uri) {
        vscode.window.showWarningMessage('No folder selected');
        return;
      }

      const fsPath = uri.fsPath;
      const collectionRoot = findCollectionRoot(fsPath) || fsPath;
      const collectionRootFile = await ensureCollectionRootFile(collectionRoot);

      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(collectionRootFile),
        BrunoEditorProvider.viewType
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.openVariables', async (uri: vscode.Uri) => {
      if (!uri) {
        vscode.window.showWarningMessage('No folder selected');
        return;
      }

      const fsPath = uri.fsPath;
      const collectionRoot = findCollectionRoot(fsPath) || fsPath;
      const collectionRootFile = await ensureCollectionRootFile(collectionRoot);

      setPendingVariablesMode(collectionRootFile, collectionRoot);

      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(collectionRootFile),
        BrunoEditorProvider.viewType
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.createCollection', async () => {
      await openCreateCollectionPanel(context);
    })
  );

  // Alias command for sidebar
  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.openCreateCollection', async () => {
      await openCreateCollectionPanel(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.openCollection', async () => {
      await openCollectionDialog(collectionWatcher);
      sidebarProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.importCollection', async () => {
      await openImportCollectionPanel(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.refreshSidebar', () => {
      sidebarProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.newRequest', async () => {
      await vscode.window.showQuickPick([
        { label: 'HTTP Request', value: 'http' },
        { label: 'GraphQL Request', value: 'graphql' },
        { label: 'gRPC Request', value: 'grpc' },
        { label: 'WebSocket', value: 'ws' }
      ], {
        placeHolder: 'Select request type'
      });

      vscode.window.showWarningMessage('Please right-click a collection or folder in the sidebar to create a request');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.openGlobalEnvironments', async () => {
      await openGlobalEnvironmentsPanel(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.openEnvironmentSettings', async (uri: vscode.Uri) => {
      if (!uri) {
        vscode.window.showWarningMessage('No folder selected');
        return;
      }

      const fsPath = uri.fsPath;
      let collectionRoot = findCollectionRoot(fsPath);

      if (!collectionRoot && isCollectionRoot(fsPath)) {
        collectionRoot = fsPath;
      }

      if (!collectionRoot) {
        vscode.window.showWarningMessage('No Bruno collection found');
        return;
      }

      await openEnvironmentSettingsPanel(context, collectionRoot);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.openNewRequest', async (
      collectionUid: string,
      collectionPath: string,
      itemUid?: string | null
    ) => {
      await openNewRequestPanel(context, collectionUid, collectionPath, itemUid);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.openExportCollection', async (
      collectionUid: string,
      collectionPath: string
    ) => {
      await openExportCollectionPanel(context, collectionUid, collectionPath);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.openCloneCollection', async (
      collectionUid: string,
      collectionPath: string
    ) => {
      await openCloneCollectionPanel(context, collectionUid, collectionPath);
    })
  );

  // which conflicts with Bruno's IPC-based save mechanism
  context.subscriptions.push(
    vscode.commands.registerCommand('bruno.saveFromEditor', () => {
      stateManager.broadcast('main:trigger-save');
    })
  );
}
