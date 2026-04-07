import * as vscode from 'vscode';
import { encryptStringSafe, decryptStringSafe } from '../utils/encryption';
const { environmentSchema } = require('@usebruno/schema');

interface EnvironmentVariable {
  name: string;
  value: string;
  secret?: boolean;
  type?: string;
}

interface GlobalEnvironment {
  uid: string;
  name: string;
  variables: EnvironmentVariable[];
}

let extensionContext: vscode.ExtensionContext | null = null;

export function setExtensionContext(context: vscode.ExtensionContext): void {
  extensionContext = context;
}

class GlobalEnvironmentsStore {
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

  filterValidEnvironments(environments: GlobalEnvironment[]): GlobalEnvironment[] {
    if (!Array.isArray(environments)) {
      return [];
    }

    return environments.filter((env) => {
      try {
        environmentSchema.validateSync(env);
        return true;
      } catch (error) {
        console.error('Invalid environment:', env);
        console.error(error);
        return false;
      }
    });
  }

  encryptGlobalEnvironmentVariables({ globalEnvironments }: { globalEnvironments: GlobalEnvironment[] }): GlobalEnvironment[] {
    return globalEnvironments?.map((env) => {
      const variables = env.variables?.map((v) => ({
        ...v,
        value: v?.secret ? encryptStringSafe(v.value).value : v?.value
      })) || [];

      return {
        ...env,
        variables
      };
    });
  }

  decryptGlobalEnvironmentVariables({ globalEnvironments }: { globalEnvironments: GlobalEnvironment[] }): GlobalEnvironment[] {
    return globalEnvironments?.map((env) => {
      const variables = env.variables?.map((v) => ({
        ...v,
        value: v?.secret ? decryptStringSafe(v.value).value : v?.value
      })) || [];

      return {
        ...env,
        variables
      };
    });
  }

  getGlobalEnvironments(): GlobalEnvironment[] {
    let globalEnvironments = this.getFromStorage<GlobalEnvironment[]>('global-environments.environments', []);

    globalEnvironments?.forEach((env) => {
      env?.variables?.forEach((v) => {
        if (!v.type) {
          v.type = 'text';
        }
      });
    });

    globalEnvironments = this.filterValidEnvironments(globalEnvironments);
    globalEnvironments = this.decryptGlobalEnvironmentVariables({ globalEnvironments });

    return globalEnvironments;
  }

  getActiveGlobalEnvironmentUid(): string | null {
    return this.getFromStorage<string | null>('global-environments.activeUid', null);
  }

  setGlobalEnvironments(globalEnvironments: GlobalEnvironment[]): void {
    globalEnvironments = this.filterValidEnvironments(globalEnvironments);
    globalEnvironments = this.encryptGlobalEnvironmentVariables({ globalEnvironments });
    this.setInStorage('global-environments.environments', globalEnvironments);
  }

  setActiveGlobalEnvironmentUid(uid: string | null): void {
    this.setInStorage('global-environments.activeUid', uid);
  }

  addGlobalEnvironment({ uid, name, variables = [] }: { uid: string; name: string; variables?: EnvironmentVariable[] }): void {
    const globalEnvironments = this.getGlobalEnvironments();
    const existingEnvironment = globalEnvironments.find((env) => env?.name === name);
    if (existingEnvironment) {
      throw new Error('Environment with the same name already exists');
    }
    globalEnvironments.push({ uid, name, variables });
    this.setGlobalEnvironments(globalEnvironments);
  }

  saveGlobalEnvironment({ environmentUid, variables }: { environmentUid: string; variables: EnvironmentVariable[] }): void {
    let globalEnvironments = this.getGlobalEnvironments();
    const environment = globalEnvironments.find((env) => env?.uid === environmentUid);
    globalEnvironments = globalEnvironments.filter((env) => env?.uid !== environmentUid);
    if (environment) {
      environment.variables = variables;
      globalEnvironments.push(environment);
    }
    this.setGlobalEnvironments(globalEnvironments);
  }

  renameGlobalEnvironment({ environmentUid, name }: { environmentUid: string; name: string }): void {
    let globalEnvironments = this.getGlobalEnvironments();
    const environment = globalEnvironments.find((env) => env?.uid === environmentUid);
    globalEnvironments = globalEnvironments.filter((env) => env?.uid !== environmentUid);
    if (environment) {
      environment.name = name;
      globalEnvironments.push(environment);
    }
    this.setGlobalEnvironments(globalEnvironments);
  }

  copyGlobalEnvironment({ uid, name, variables }: { uid: string; name: string; variables: EnvironmentVariable[] }): void {
    const globalEnvironments = this.getGlobalEnvironments();
    globalEnvironments.push({ uid, name, variables });
    this.setGlobalEnvironments(globalEnvironments);
  }

  selectGlobalEnvironment({ environmentUid }: { environmentUid: string }): void {
    const globalEnvironments = this.getGlobalEnvironments();
    const environment = globalEnvironments.find((env) => env?.uid === environmentUid);
    if (environment) {
      this.setActiveGlobalEnvironmentUid(environmentUid);
    } else {
      this.setActiveGlobalEnvironmentUid(null);
    }
  }

  deleteGlobalEnvironment({ environmentUid }: { environmentUid: string }): void {
    let globalEnvironments = this.getGlobalEnvironments();
    const activeGlobalEnvironmentUid = this.getActiveGlobalEnvironmentUid();
    globalEnvironments = globalEnvironments.filter((env) => env?.uid !== environmentUid);
    if (environmentUid === activeGlobalEnvironmentUid) {
      this.setActiveGlobalEnvironmentUid(null);
    }
    this.setGlobalEnvironments(globalEnvironments);
  }
}

export const globalEnvironmentsStore = new GlobalEnvironmentsStore();
export { GlobalEnvironmentsStore };
