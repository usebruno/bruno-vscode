import * as vscode from 'vscode';

interface CollectionSnapshot {
  pathname: string;
  selectedEnvironment?: string;
  [key: string]: unknown;
}

interface UpdateData {
  collectionPath: string;
  environmentName: string;
}

let extensionContext: vscode.ExtensionContext | null = null;

export const normalizeSnapshotPath = (p: string): string => {
  if (!p) {
    return p;
  }

  // Convert backslashes to forward slashes and strip trailing slashes
  const normalized = p.replace(/\\/g, '/').replace(/\/+$/, '');

  // Lowercase the Windows drive letter so "C:/foo" and "c:/foo" match
  return /^[a-zA-Z]:/.test(normalized) ? normalized[0].toLowerCase() + normalized.slice(1) : normalized;
};

export function setExtensionContext(context: vscode.ExtensionContext): void {
  extensionContext = context;
}

class UiStateSnapshotStore {
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

  getCollections(): CollectionSnapshot[] {
    const byPathname = new Map<string, CollectionSnapshot>();

    // Dedupe by normalized pathname; later entries overwrite earlier ones
    for (const c of this.getFromStorage<CollectionSnapshot[]>('ui-state-snapshot.collections', [])) {
      if (!c?.pathname) {
        continue;
      }
      
      const pathname = normalizeSnapshotPath(c.pathname);
      byPathname.set(pathname, { ...c, pathname });
    }

    return [...byPathname.values()];
  }

  saveCollections(collections: CollectionSnapshot[]): void {
    this.setInStorage('ui-state-snapshot.collections', collections);
  }

  findByPathname(pathname: string): CollectionSnapshot | undefined {
    const normalizedPathname = normalizeSnapshotPath(pathname);
    return this.getCollections().find((c) => c.pathname === normalizedPathname);
  }

  getCollectionByPathname({ pathname }: { pathname: string }): CollectionSnapshot {
    const normalizedPathname = normalizeSnapshotPath(pathname);
    const collections = this.getCollections();

    let collection = collections.find((c) => c.pathname === normalizedPathname);
    if (!collection) {
      collection = { pathname: normalizedPathname };
      collections.push(collection);
      this.saveCollections(collections);
    }

    return collection;
  }

  setCollectionByPathname({ collection }: { collection: CollectionSnapshot }): CollectionSnapshot {
    const normalizedCollection = { ...collection, pathname: normalizeSnapshotPath(collection.pathname) };
    const collections = this.getCollections().filter((c) => c.pathname !== normalizedCollection.pathname);
    collections.push(normalizedCollection);
    this.saveCollections(collections);

    return normalizedCollection;
  }

  updateCollectionEnvironment({ collectionPath, environmentName }: { collectionPath: string; environmentName: string }): void {
    const collection = this.getCollectionByPathname({ pathname: collectionPath });
    collection.selectedEnvironment = environmentName;
    this.setCollectionByPathname({ collection });
  }

  update({ type, data }: { type: string; data: UpdateData }): void {
    switch (type) {
      case 'COLLECTION_ENVIRONMENT':
        const { collectionPath, environmentName } = data;
        this.updateCollectionEnvironment({ collectionPath, environmentName });
        break;
      default:
        break;
    }
  }

  saveUiStateSnapshot(collections: unknown[]): void {
    const validCollections = (collections || [])
      .filter((c): c is CollectionSnapshot => {
        return c !== null && typeof c === 'object' && 'pathname' in c;
      });
    this.saveCollections(validCollections);
  }
}

export default UiStateSnapshotStore;
export { UiStateSnapshotStore };
