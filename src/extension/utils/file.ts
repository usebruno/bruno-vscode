import * as vscode from 'vscode';

/**
 * URI and file helpers that stay inside the VS Code API.
 *
 * Unlike ./filesystem (Node fs/path), nothing here touches the local disk
 * directly, so callers work on any scheme VS Code can open: file://,
 * vscode-remote://, vscode-vfs://, and so on.
 */

export type CollectionFormat = 'bru' | 'yml';

/** Per-format metadata files that live beside requests but are not requests. */
export const META_FILES: Record<CollectionFormat, string[]> = {
  bru: ['collection.bru', 'folder.bru', 'bruno.json'],
  yml: ['opencollection.yml', 'opencollection.yaml', 'folder.yml', 'bruno.json']
};

const textDecoder = new TextDecoder('utf-8');
const textEncoder = new TextEncoder();

export function basename(uri: vscode.Uri): string {
  return uri.path.split('/').filter(Boolean).pop() ?? '';
}

export function dirname(uri: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(uri, '..');
}

/** True when `uri` is strictly inside `root`, matching whole path segments. */
export function isInside(uri: vscode.Uri, root: vscode.Uri): boolean {
  return uri.scheme === root.scheme
    && uri.authority === root.authority
    // Makes sure `/ws/api` contains something like `/ws/api/v2` but not `/ws/api-tests`.
    && uri.path.startsWith(root.path.replace(/\/$/, '') + '/');
}

/** `uri` without a trailing slash, so two spellings of one directory compare equal. */
export function normalizeDir(uri: vscode.Uri): vscode.Uri {
  const path = uri.path.replace(/\/+$/, '');
  return path === uri.path ? uri : uri.with({ path: path || '/' });
}

/** True when both URIs name the same directory, ignoring a trailing slash. */
export function isSameDir(a: vscode.Uri, b: vscode.Uri): boolean {
  return normalizeDir(a).toString() === normalizeDir(b).toString();
}

export async function readText(uri: vscode.Uri): Promise<string> {
  return textDecoder.decode(await vscode.workspace.fs.readFile(uri));
}

export function writeText(uri: vscode.Uri, content: string): Thenable<void> {
  return vscode.workspace.fs.writeFile(uri, textEncoder.encode(content));
}

export async function doesItExist(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}
