import path from 'path';
import type { FolderRoot } from '@bruno-types';

type RootScope = 'collection' | 'folder';

interface ParkedRoot {
  sourceFile: string;
  root: FolderRoot;
}

const unsavedRoots = new Map<string, ParkedRoot>();

const keyFor = (scope: RootScope, dirPath: string): string => `${scope}:${path.normalize(dirPath)}`;

export const setUnsavedRoot = (scope: RootScope, filePath: string, root: FolderRoot): void => {
  unsavedRoots.set(keyFor(scope, path.dirname(filePath)), { sourceFile: path.normalize(filePath), root });
};

export const clearUnsavedRootForFile = (filePath: string): void => {
  const sourceFile = path.normalize(filePath);
  for (const [key, parked] of unsavedRoots) {
    if (parked.sourceFile === sourceFile) {
      unsavedRoots.delete(key);
    }
  }
};

export const getUnsavedRoot = (scope: RootScope, dirPath?: string): FolderRoot | undefined =>
  dirPath ? unsavedRoots.get(keyFor(scope, dirPath))?.root : undefined;
