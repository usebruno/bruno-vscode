import * as vscode from 'vscode';
import { stringifyCollection } from '@usebruno/filestore';
import { stringifyJson } from './common';
import { writeText } from './file';
import { defaultBrunoConfig, defaultCollectionRoot, type CollectionFormat } from '../../utils/collection';

/** Collection or folder level settings, as stored in collection.bru / folder.bru. */
export interface CollectionRootFile {
  meta?: { name?: string; seq?: number };
}

/**
 * Write the config files that make `dir` a collection: opencollection.yml, or
 * bruno.json plus collection.bru. Goes through workspace.fs, so `dir` can be
 * on a remote. Create Collection passes no `root`, so its BRU collection has
 * no collection.bru, matching the Bruno app; imports pass the converted root.
 */
export async function writeCollectionConfig(
  dir: vscode.Uri,
  name: string,
  format: CollectionFormat,
  options: { root?: CollectionRootFile; brunoConfig?: Record<string, unknown> } = {}
): Promise<void> {
  const brunoConfig = options.brunoConfig ?? defaultBrunoConfig(name, format);
  const root: CollectionRootFile = options.root ?? defaultCollectionRoot(name);

  if (format === 'yml') {
    await writeText(vscode.Uri.joinPath(dir, 'opencollection.yml'), await stringifyCollection(root, brunoConfig, { format }));
    return;
  }

  await writeText(vscode.Uri.joinPath(dir, 'bruno.json'), await stringifyJson(brunoConfig));

  if (options.root) {
    await writeText(vscode.Uri.joinPath(dir, 'collection.bru'), await stringifyCollection(root, brunoConfig, { format }));
  }
}
