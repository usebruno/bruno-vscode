import * as vscode from 'vscode';
import { find } from 'lodash';

interface SecurityConfig {
  jsSandboxMode?: string;
  [key: string]: unknown;
}

interface CollectionSecurityEntry {
  path: string;
  securityConfig: SecurityConfig;
}

let extensionContext: vscode.ExtensionContext | null = null;

export function setExtensionContext(context: vscode.ExtensionContext): void {
  extensionContext = context;
}

class CollectionSecurityStore {
  private getCollections(): CollectionSecurityEntry[] {
    if (!extensionContext) {
      return [];
    }
    return extensionContext.globalState.get<CollectionSecurityEntry[]>('collection-security.collections', []);
  }

  private setCollections(collections: CollectionSecurityEntry[]): void {
    if (!extensionContext) {
      console.error('Extension context not set');
      return;
    }
    extensionContext.globalState.update('collection-security.collections', collections);
  }

  setSecurityConfigForCollection(collectionPathname: string, securityConfig: SecurityConfig): void {
    const collections = this.getCollections();
    const collection = find(collections, (c) => c.path === collectionPathname);

    if (!collection) {
      collections.push({
        path: collectionPathname,
        securityConfig: {
          jsSandboxMode: securityConfig.jsSandboxMode
        }
      });
      this.setCollections(collections);
      return;
    }

    collection.securityConfig = securityConfig || {};
    this.setCollections(collections);
  }

  getSecurityConfigForCollection(collectionPathname: string): SecurityConfig {
    const collections = this.getCollections();
    const collection = find(collections, (c) => c.path === collectionPathname);
    return collection?.securityConfig || {};
  }
}

export default CollectionSecurityStore;
export { CollectionSecurityStore };
