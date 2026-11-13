import * as vscode from 'vscode';
import { normalizeDir } from '../utils/file';

/**
 * Collections the user opened from outside the workspace folders.
 *
 * Kept as URI strings in globalState, so they come back in every window and
 * session. URIs rather than file paths: on a remote or web host (Remote-SSH,
 * code-server, vscode.dev) the folder sits behind a scheme such as
 * vscode-remote://, and workspace.fs resolves it exactly as it does the
 * workspace itself.
 *
 * Deliberately not registered with globalState.setKeysForSync: the entries
 * name folders on this machine or host and mean nothing on another one.
 */
const STORAGE_KEY = 'bruno.sidebar.openedCollections';

export class OpenedCollections implements vscode.Disposable {
  private readonly storage: vscode.Memento;
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  /** Fires after the stored list changes, so the tree can rescan. */
  readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

  constructor(storage: vscode.Memento) {
    this.storage = storage;
  }

  list(): vscode.Uri[] {
    const stored = this.storage.get<unknown>(STORAGE_KEY, []);

    // Just to validate against changes from older versions or manual edits in editor state files
    if (!Array.isArray(stored)) {
      return [];
    }

    const uris: vscode.Uri[] = [];
    for (const value of stored) {
      if (typeof value !== 'string') {
        continue;
      }

      try {
        uris.push(vscode.Uri.parse(value, true));
      } catch {
        // A malformed entry is dropped rather than breaking the whole list.
      }
    }

    return uris;
  }

  has(uri: vscode.Uri): boolean {
    return this.list().some((entry) => entry.toString() === normalizeDir(uri).toString());
  }

  /** Adds `uri`; resolves false when it was already stored. */
  async add(uri: vscode.Uri): Promise<boolean> {
    if (this.has(uri)) {
      return false;
    }

    const keys = this.list().map((entry) => entry.toString());
    await this.storage.update(STORAGE_KEY, [...keys, normalizeDir(uri).toString()]);

    this._onDidChange.fire();

    return true;
  }


  /** Removes `uri`; resolves false when it was not stored. */
  async remove(uri: vscode.Uri): Promise<boolean> {
    const keys = this.list().map((entry) => entry.toString());
    const remaining = keys.filter((entry) => entry !== normalizeDir(uri).toString());

    if (remaining.length === keys.length) {
      return false;
    }

    // Memento values are serialised to JSON, so store strings, never Uri objects.
    await this.storage.update(STORAGE_KEY, remaining);
    this._onDidChange.fire();

    return true;
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
