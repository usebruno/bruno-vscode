import * as vscode from 'vscode';

import { BrunoEditorProvider } from '../editors/bruno-editor-provider';
import { isDocumentRegistered, writeFileViaVSCode } from '../editors/dirty-state-manager';

import { basename, isInside, writeText } from './file';

/**
 * Keeps open Bruno editors consistent with file operations made from the
 * native sidebar: closing tabs before a delete, reopening them after a move,
 * and writing through an open document instead of under it.
 */

export interface OpenBrunoEditor {
  uri: vscode.Uri;
  viewColumn: vscode.ViewColumn;
  isActive: boolean;
}

/** Close editors showing `uri` or anything under it, before it is deleted or moved. */
export async function closeTabsUnder(uri: vscode.Uri): Promise<void> {
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input;
      if (input && typeof input === 'object' && 'uri' in input) {
        const tabUri = (input as { uri: vscode.Uri }).uri;
        if (tabUri.toString() === uri.toString() || isInside(tabUri, uri)) {
          await vscode.window.tabGroups.close(tab);
        }
      }
    }
  }
}

/** Bruno editor tabs showing `uri` or anything under it, as they are before a move. */
export function brunoEditorTabsUnder(uri: vscode.Uri): OpenBrunoEditor[] {
  const found: OpenBrunoEditor[] = [];
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input;
      if (input instanceof vscode.TabInputCustom
        && input.viewType === BrunoEditorProvider.viewType
        && (input.uri.toString() === uri.toString() || isInside(input.uri, uri))) {
        found.push({ uri: input.uri, viewColumn: group.viewColumn, isActive: tab.isActive });
      }
    }
  }
  return found;
}

/**
 * Put the Bruno editor back on files that were open in it before `oldUri` moved to `newUri`.
 * VS Code re-resolves a moved custom editor and, because the Bruno editor is not the
 * default for these extensions, can land the file in the text editor instead.
 */
export async function restoreBrunoEditors(
  openEditors: OpenBrunoEditor[],
  oldUri: vscode.Uri,
  newUri: vscode.Uri
): Promise<void> {
  for (const { uri, viewColumn, isActive } of openEditors) {
    const movedUri = newUri.with({ path: newUri.path + uri.path.slice(oldUri.path.length) });
    const alreadyBrunoEditor = brunoEditorTabsUnder(movedUri).some((tab) => tab.uri.toString() === movedUri.toString());

    if (alreadyBrunoEditor) {
      continue;
    }

    await closeTabsUnder(movedUri); // Close the obsolete file
    // Open Bruno editor for the updated file
    await vscode.commands.executeCommand('vscode.openWith', movedUri, BrunoEditorProvider.viewType, {
      viewColumn,
      preserveFocus: !isActive
    });
  }
}

/**
 * Move `oldUri` to `newUri` as a workspace edit, so editors showing it follow,
 * then make sure those that were Bruno editors still are.
 */
export async function moveWithEditors(oldUri: vscode.Uri, newUri: vscode.Uri): Promise<void> {
  const openBefore = brunoEditorTabsUnder(oldUri);

  const edit = new vscode.WorkspaceEdit();
  edit.renameFile(oldUri, newUri, { overwrite: false });

  if (!(await vscode.workspace.applyEdit(edit))) {
    throw new Error(`Could not move "${oldUri.path}"`);
  }

  await restoreBrunoEditors(openBefore, oldUri, newUri);
}

/**
 * Throws when `uri` is open with unsaved changes. Writing it from the sidebar
 * would replace and save the open document, losing those changes.
 */
export function assertNoUnsavedChanges(uri: vscode.Uri): void {
  const document = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString());
  if (document?.isDirty) {
    throw new Error(`"${basename(uri)}" has unsaved changes. Save or revert it first.`);
  }
}

/**
 * Write a request, folder or collection file that may be open in a Bruno editor.
 * An open document is updated through VS Code's document model rather than on
 * disk underneath it; one with unsaved changes is refused, not overwritten.
 */
export async function writeThroughEditor(uri: vscode.Uri, content: string): Promise<void> {
  assertNoUnsavedChanges(uri);

  // The editor registers documents by fsPath, whatever the scheme; this is a lookup, not a disk access.
  if (isDocumentRegistered(uri.fsPath)) {
    await writeFileViaVSCode(uri.fsPath, content);
  } else {
    await writeText(uri, content);
  }
}
