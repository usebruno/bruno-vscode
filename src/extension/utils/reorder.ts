import * as vscode from 'vscode';
import { stringifyFolder, stringifyRequest } from '@usebruno/filestore';

import type { CollectionFormat } from '../../utils/collection';
import type { ChildEntry, CollectionRoot, Entity, NativeSidebarViewProvider } from '../views/NativeSidebarViewProvider';

import { closeTabsUnder, moveWithEditors, writeThroughEditor } from './editor';
import { basename, dirname, doesItExist, isInside, isSameDir, readText, writeText } from './file';
import { parseFolder, parseRequest } from './parse';

/**
 * Moving and reordering folders and requests from the native sidebar.
 *
 * Order lives in the files, as `seq` in each request and in each folder's
 * folder.bru / folder.yml. Folders and requests are shown as two groups, each
 * ordered on its own, so each group is numbered on its own as well: 1..n over
 * the folders of a directory, and 1..n over its requests. The Bruno app sorts
 * the two groups separately too, so it shows the same order.
 *
 * Every file goes through vscode.workspace.fs, and files open in a Bruno
 * editor are written through that editor, so this works on any scheme and
 * never overwrites unsaved work.
 */

type ItemKind = ChildEntry['params'][0];

/** A movable sidebar item: a folder or a request, never a collection. */
export type MovableEntity = Entity & { type: ItemKind };

export function isMovable(entity: Entity): entity is MovableEntity {
  return entity.type === 'folder' || entity.type === 'request';
}

export interface Placement {
  /** Directory the item ends up in: a collection root or a folder. */
  dir: vscode.Uri;
  collection: CollectionRoot;
  /** Sibling of the same kind the item goes in front of. Left out, the item goes last. */
  before?: vscode.Uri;
}

/**
 * Put `item` where `placement` says, moving its file when the directory
 * changes, and renumber whatever that displaces: the items left behind in the
 * old directory and the items of the same kind in the new one.
 */
export async function placeItem(provider: NativeSidebarViewProvider, item: MovableEntity, placement: Placement): Promise<void> {
  const sourceDir = dirname(item.uri);
  const sourceFormat = item.collection.format;
  const targetFormat = placement.collection.format;

  if (item.type === 'folder') {
    if (isSameDir(item.uri, placement.dir) || isInside(placement.dir, item.uri)) {
      throw new Error('A folder cannot be moved into itself');
    }

    if (sourceFormat !== targetFormat) {
      throw new Error('Folders cannot be moved between bru and yml collections');
    }
  }

  let uri = item.uri;
  if (!isSameDir(sourceDir, placement.dir)) {
    uri = await moveFile(item, placement.dir, targetFormat);
    // Close the gap the item left behind.
    await writeSequences(await getSiblings(provider, sourceDir, item.collection, item.type), sourceFormat);
  }

  const ordered = placeInOrder(
    await getSiblings(provider, placement.dir, placement.collection, item.type),
    uri,
    placement.before
  );
  await writeSequences(ordered, targetFormat);
}

/** Move `item` one place up or down among the items of its kind in its directory. */
export async function shiftItem(provider: NativeSidebarViewProvider, item: MovableEntity, direction: 'up' | 'down'): Promise<void> {
  const dir = dirname(item.uri);
  const items = await getSiblings(provider, dir, item.collection, item.type);
  const index = items.findIndex((f) => f.uri.toString() === item.uri.toString());

  const first = index === 0;
  const last = index === items.length - 1;
  if (index === -1 || (direction === 'up' && first) || (direction === 'down' && last)) {
    await vscode.window.showInformationMessage(`"${item.label}" cannot be moved ${direction} any further.`);
    return;
  }

  // Up: in front of the previous item. Down: in front of the one after next,
  // which is past the end for the second-to-last item, so it goes last.
  const before = direction === 'up' ? items.at(index - 1) : items.at(index + 2);
  await placeItem(provider, item, { dir, collection: item.collection, before: before?.uri });
}

/**
 * `items` in their shown order, with the one at `uri` moved in front of
 * `before`, or to the end when `before` is left out or not among them.
 */
export function placeInOrder<T extends { uri: vscode.Uri }>(items: T[], uri: vscode.Uri, before?: vscode.Uri): T[] {
  const movedItem = items.find((item) => item.uri.toString() === uri.toString());

  if (!movedItem || before?.toString() === uri.toString()) {
    return items;
  }

  const rest = items.filter((item) => item !== movedItem);
  const index = before ? rest.findIndex((item) => item.uri.toString() === before.toString()) : -1;

  if (index === -1) {
    return [...rest, movedItem];
  }

  rest.splice(index, 0, movedItem);

  return rest;
}

async function getSiblings(provider: NativeSidebarViewProvider, dir: vscode.Uri, collection: CollectionRoot, kind: ItemKind): Promise<ChildEntry[]> {
  const children = await provider.readChildren(dir, collection);
  return children.filter((child) => child.params[0] === kind);
}

async function moveFile(item: MovableEntity, dir: vscode.Uri, targetFormat: CollectionFormat): Promise<vscode.Uri> {
  const sourceFormat = item.collection.format;
  const name = basename(item.uri);
  const isCrossFormat = item.type === 'request' && sourceFormat !== targetFormat; // when moved between collections of different formats
  const newUri = vscode.Uri.joinPath(dir, isCrossFormat ? `${name.slice(0, -sourceFormat.length)}${targetFormat}` : name);

  if (await doesItExist(newUri)) {
    throw new Error(`"${basename(newUri)}" already exists in "${basename(dir)}"`);
  }

  if (!isCrossFormat) {
    await moveWithEditors(item.uri, newUri);
    return newUri;
  }

  // A different extension means a different serialiser, so a plain rename will not do.
  const request = parseRequest(await readText(item.uri), { format: sourceFormat });
  await closeTabsUnder(item.uri);
  await writeText(newUri, await stringifyRequest(request, { format: targetFormat }));
  await vscode.workspace.fs.delete(item.uri);

  return newUri;
}

/** Number `items` 1..n in the order given, writing only the ones whose seq changes. */
async function writeSequences(items: ChildEntry[], format: CollectionFormat): Promise<void> {
  for (const [index, item] of items.entries()) {
    const seq = index + 1;

    if (item.seq === seq) {
      continue;
    }

    if (item.params[0] === 'folder') {
      await writeFolderSequence(item.uri, seq, format);
    } else {
      await writeRequestSequence(item.uri, seq, format);
    }
  }
}

async function writeRequestSequence(uri: vscode.Uri, seq: number, format: CollectionFormat): Promise<void> {
  // Re-read rather than reuse what the tree parsed, so nothing but seq changes.
  const request = parseRequest(await readText(uri), { format });
  request.seq = seq;

  await writeThroughEditor(uri, await stringifyRequest(request, { format }));
}

async function writeFolderSequence(uri: vscode.Uri, seq: number, format: CollectionFormat): Promise<void> {
  const folderFile = vscode.Uri.joinPath(uri, `folder.${format}`);
  const folder = await doesItExist(folderFile) ? parseFolder(await readText(folderFile), { format }) : {};
  // No folder file yet, or a .bru one without a meta block.
  if (!folder.meta) {
    folder.meta = { name: basename(uri) };
  }
  folder.meta.seq = seq;

  await writeThroughEditor(folderFile, await stringifyFolder(folder, { format }));
}
