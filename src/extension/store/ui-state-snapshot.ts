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
    return this.getFromStorage<CollectionSnapshot[]>('ui-state-snapshot.collections', []);
  }

  saveCollections(collections: CollectionSnapshot[]): void {
    this.setInStorage('ui-state-snapshot.collections', collections);
  }

  getCollectionByPathname({ pathname }: { pathname: string }): CollectionSnapshot {
    let collections = this.getCollections();

    let collection = collections.find((c) => c?.pathname === pathname);
    if (!collection) {
      collection = { pathname };
      collections.push(collection);
      this.saveCollections(collections);
    }

    return collection;
  }

  setCollectionByPathname({ collection }: { collection: CollectionSnapshot }): CollectionSnapshot {
    let collections = this.getCollections();

    collections = collections.filter((c) => c?.pathname !== collection.pathname);
    collections.push({ ...collection });
    this.saveCollections(collections);

    return collection;
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
