import path from 'node:path';
import * as vscode from 'vscode';
import { filter } from 'lodash';
import { isDirectory } from '../utils/filesystem';

let extensionContext: vscode.ExtensionContext | null = null;

export function setExtensionContext(context: vscode.ExtensionContext): void {
  extensionContext = context;
}

class LastOpenedCollections {
  private getFromStorage<T>(key: string, defaultValue: T): T {
    if (!extensionContext) {
      return defaultValue;
    }
    return extensionContext.globalState.get<T>(key, defaultValue);
  }

  private setInStorage<T>(key: string, value: T): void {
    if (!extensionContext) {
      console.error('Extension context not set');
      return;
    }
    extensionContext.globalState.update(key, value);
  }

  getAll(): string[] {
    let collections = this.getFromStorage<string[]>('lastOpenedCollections', []);
    collections = collections.map((collection) => path.resolve(collection));
    return collections;
  }

  add(collectionPath: string): void {
    const collections = this.getAll();

    if (isDirectory(collectionPath) && !collections.includes(collectionPath)) {
      collections.push(collectionPath);
      this.setInStorage('lastOpenedCollections', collections);
    }
  }

  update(collectionPaths: string[]): void {
    this.setInStorage('lastOpenedCollections', collectionPaths);
  }

  remove(collectionPath: string): void {
    let collections = this.getAll();

    if (collections.includes(collectionPath)) {
      collections = filter(collections, (c) => c !== collectionPath);
      this.setInStorage('lastOpenedCollections', collections);
    }
  }

  removeAll(): void {
    this.setInStorage('lastOpenedCollections', []);
  }
}

export default LastOpenedCollections;
export { LastOpenedCollections };
