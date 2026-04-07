/**
 * Workspace environments manager
 */

import fs from 'fs';
import path from 'path';
import { filter, find, each } from 'lodash';
import yaml from 'js-yaml';
const { parseEnvironment, stringifyEnvironment } = require('@usebruno/filestore');
import { writeFile, createDirectory } from '../utils/filesystem';
import { generateUidBasedOnHash, uuid } from '../utils/common';
import { decryptStringSafe } from '../utils/encryption';
import EnvironmentSecretsStore from './env-secrets';

const environmentSecretsStore = new EnvironmentSecretsStore();

export const ENV_FILE_EXTENSION = '.yml';

interface EnvironmentVariable {
  uid?: string;
  name: string;
  value: string;
  secret?: boolean;
  type?: string;
}

interface Environment {
  uid?: string;
  name: string;
  variables: EnvironmentVariable[];
}

interface EnvFile {
  filePath: string;
  fileName: string;
  name: string;
}

class GlobalEnvironmentsManager {
  envHasSecrets(environment: Environment): boolean {
    const secrets = filter(environment.variables, (v) => v.secret === true);
    return secrets && secrets.length > 0;
  }

  getEnvironmentsDir(workspacePath: string): string {
    return path.join(workspacePath, 'environments');
  }

  getEnvironmentFilePath(workspacePath: string, environmentName: string): string {
    return path.join(this.getEnvironmentsDir(workspacePath), `${environmentName}${ENV_FILE_EXTENSION}`);
  }

  findEnvironmentFileByUid(workspacePath: string, environmentUid: string): EnvFile | null {
    const environmentsDir = this.getEnvironmentsDir(workspacePath);

    if (!fs.existsSync(environmentsDir)) {
      return null;
    }

    const files = fs.readdirSync(environmentsDir);

    for (const file of files) {
      if (file.endsWith(ENV_FILE_EXTENSION)) {
        const filePath = path.join(environmentsDir, file);
        const fileUid = generateUidBasedOnHash(filePath);
        if (fileUid === environmentUid) {
          return {
            filePath,
            fileName: file,
            name: file.slice(0, -ENV_FILE_EXTENSION.length)
          };
        }
      }
    }

    return null;
  }

  async getActiveGlobalEnvironmentUid(workspacePath: string): Promise<string | null> {
    try {
      if (!workspacePath) {
        return null;
      }

      const workspaceFilePath = path.join(workspacePath, 'workspace.yml');

      if (!fs.existsSync(workspaceFilePath)) {
        return null;
      }

      const yamlContent = fs.readFileSync(workspaceFilePath, 'utf8');
      const workspaceConfig = yaml.load(yamlContent) as { activeEnvironmentUid?: string };

      return workspaceConfig?.activeEnvironmentUid || null;
    } catch {
      return null;
    }
  }

}

export const globalEnvironmentsManager = new GlobalEnvironmentsManager();
export { GlobalEnvironmentsManager };
