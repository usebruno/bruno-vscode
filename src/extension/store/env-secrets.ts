import * as vscode from 'vscode';
import { each, find, remove } from 'lodash';
import { encryptStringSafe } from '../utils/encryption';

interface Secret {
  name: string;
  value: string;
}

interface EnvironmentSecrets {
  name: string;
  secrets: Secret[];
}

interface CollectionSecrets {
  path: string;
  environments: EnvironmentSecrets[];
}

interface Environment {
  name: string;
  variables: Array<{
    name: string;
    value: string;
    secret?: boolean;
  }>;
}

let extensionContext: vscode.ExtensionContext | null = null;

export function setExtensionContext(context: vscode.ExtensionContext): void {
  extensionContext = context;
}

class EnvironmentSecretsStore {
  private getCollections(): CollectionSecrets[] {
    if (!extensionContext) {
      return [];
    }
    return extensionContext.globalState.get<CollectionSecrets[]>('secrets.collections', []);
  }

  private setCollections(collections: CollectionSecrets[]): void {
    if (!extensionContext) {
      console.error('Extension context not set');
      return;
    }
    extensionContext.globalState.update('secrets.collections', collections);
  }

  storeEnvSecrets(collectionPathname: string, environment: Environment): void {
    const envVars: Secret[] = [];
    each(environment.variables, (v) => {
      if (v.secret) {
        envVars.push({
          name: v.name,
          value: encryptStringSafe(v.value).value
        });
      }
    });

    const collections = this.getCollections();
    const collection = find(collections, (c) => c.path === collectionPathname);

    if (!collection) {
      collections.push({
        path: collectionPathname,
        environments: [
          {
            name: environment.name,
            secrets: envVars
          }
        ]
      });
      this.setCollections(collections);
      return;
    }

    collection.environments = collection.environments || [];
    const env = find(collection.environments, (e) => e.name === environment.name);
    if (!env) {
      collection.environments.push({
        name: environment.name,
        secrets: envVars
      });
      this.setCollections(collections);
      return;
    }

    env.secrets = envVars;
    this.setCollections(collections);
  }

  getEnvSecrets(collectionPathname: string, environment: { name?: string }): Secret[] {
    const collections = this.getCollections();
    const collection = find(collections, (c) => c.path === collectionPathname);
    if (!collection) {
      return [];
    }

    const env = find(collection.environments, (e) => e.name === environment.name);
    if (!env) {
      return [];
    }

    return env.secrets || [];
  }

  renameEnvironment(collectionPathname: string, oldName: string, newName: string): void {
    const collections = this.getCollections();
    const collection = find(collections, (c) => c.path === collectionPathname);
    if (!collection) {
      return;
    }

    const env = find(collection.environments, (e) => e.name === oldName);
    if (!env) {
      return;
    }

    env.name = newName;
    this.setCollections(collections);
  }

  deleteEnvironment(collectionPathname: string, environmentName: string): void {
    const collections = this.getCollections();
    const collection = find(collections, (c) => c.path === collectionPathname);
    if (!collection) {
      return;
    }

    remove(collection.environments, (e) => e.name === environmentName);
    this.setCollections(collections);
  }
}

export default EnvironmentSecretsStore;
export { EnvironmentSecretsStore };
