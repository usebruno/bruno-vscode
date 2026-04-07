
import * as _ from 'lodash';
import fs from 'fs';
import path from 'path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { generateUidBasedOnHash, uuid } from '../utils/common';
import { getWorkspaceUid } from '../utils/workspace-config';
const { parseEnvironment } = require('@usebruno/filestore');
import EnvironmentSecretsStore from '../store/env-secrets';
import { decryptStringSafe } from '../utils/encryption';

type MessageSender = (channel: string, data: unknown) => void;

const environmentSecretsStore = new EnvironmentSecretsStore();

const DEFAULT_WORKSPACE_NAME = 'My Workspace';

let messageSender: MessageSender | null = null;

export function setMessageSender(sender: MessageSender): void {
  messageSender = sender;
}

interface EnvironmentVariable {
  uid?: string;
  name: string;
  value: string;
  secret?: boolean;
}

interface Environment {
  uid?: string;
  name: string;
  variables: EnvironmentVariable[];
}

interface WorkspaceConfig {
  info?: {
    name?: string;
    type?: string;
  };
  name?: string;
  type?: string;
  collections?: string[];
  specs?: Array<{ name: string; path: string }>;
  apiSpecs?: Array<{ name: string; path: string }>;
  activeEnvironmentUid?: string;
}

interface EnvironmentFile {
  meta: {
    workspaceUid: string;
    pathname: string;
    name: string;
  };
  data?: Environment;
}

const envHasSecrets = (environment: Environment): boolean => {
  const secrets = _.filter(environment.variables, (v) => v.secret === true);
  return secrets && secrets.length > 0;
};

const normalizeWorkspaceConfig = (config: WorkspaceConfig): WorkspaceConfig => {
  return {
    ...config,
    name: config.info?.name,
    type: config.info?.type,
    collections: config.collections || [],
    apiSpecs: config.specs || []
  };
};

const handleWorkspaceFileChange = (workspacePath: string): void => {
  try {
    const workspaceFilePath = path.join(workspacePath, 'workspace.yml');

    if (!fs.existsSync(workspaceFilePath)) {
      return;
    }

    const yamlContent = fs.readFileSync(workspaceFilePath, 'utf8');
    const rawConfig = yaml.load(yamlContent) as WorkspaceConfig;
    const workspaceConfig = normalizeWorkspaceConfig(rawConfig);

    const type = workspaceConfig.info?.type || workspaceConfig.type;
    if (type !== 'workspace') {
      return;
    }

    const workspaceUid = getWorkspaceUid(workspacePath);
    const isDefault = workspaceUid === 'default';

    if (messageSender) {
      messageSender('main:workspace-config-updated', {
        workspacePath,
        workspaceUid,
        config: {
          ...workspaceConfig,
          name: isDefault ? DEFAULT_WORKSPACE_NAME : workspaceConfig.name,
          type: isDefault ? 'default' : workspaceConfig.type
        }
      });
    }
  } catch (error) {
    console.error('Error handling workspace file change:', error);
  }
};

const parseGlobalEnvironmentFile = async (
  pathname: string,
  workspacePath: string,
  workspaceUid: string
): Promise<EnvironmentFile> => {
  const basename = path.basename(pathname);
  const environmentName = basename.slice(0, -'.yml'.length);

  const file: EnvironmentFile = {
    meta: {
      workspaceUid,
      pathname,
      name: basename
    }
  };

  const content = fs.readFileSync(pathname, 'utf8');
  const envData = await parseEnvironment(content, { format: 'yml' });

  file.data = {
    ...envData,
    name: environmentName,
    uid: generateUidBasedOnHash(pathname)
  };

  _.each(_.get(file, 'data.variables', []), (variable: EnvironmentVariable) => {
    if (!variable.uid) {
      variable.uid = uuid();
    }
  });

  if (file.data && envHasSecrets(file.data)) {
    const envSecrets = environmentSecretsStore.getEnvSecrets(workspacePath, file.data);
    _.each(envSecrets, (secret: { name: string; value: string }) => {
      const variable = _.find(file.data!.variables, (v) => v.name === secret.name);
      if (variable && secret.value) {
        const decryptionResult = decryptStringSafe(secret.value);
        variable.value = decryptionResult.value;
      }
    });
  }

  return file;
};

const handleGlobalEnvironmentFileAdd = async (
  pathname: string,
  workspacePath: string,
  workspaceUid: string
): Promise<void> => {
  try {
    const file = await parseGlobalEnvironmentFile(pathname, workspacePath, workspaceUid);
    if (messageSender) {
      messageSender('main:global-environment-added', { workspaceUid, file });
    }
  } catch (error) {
    console.error('Error handling global environment file add:', error);
  }
};

const handleGlobalEnvironmentFileChange = async (
  pathname: string,
  workspacePath: string,
  workspaceUid: string
): Promise<void> => {
  try {
    const file = await parseGlobalEnvironmentFile(pathname, workspacePath, workspaceUid);
    if (messageSender) {
      messageSender('main:global-environment-changed', { workspaceUid, file });
    }
  } catch (error) {
    console.error('Error handling global environment file change:', error);
  }
};

const handleGlobalEnvironmentFileUnlink = async (
  pathname: string,
  workspaceUid: string
): Promise<void> => {
  try {
    const environmentUid = generateUidBasedOnHash(pathname);
    if (messageSender) {
      messageSender('main:global-environment-deleted', { workspaceUid, environmentUid });
    }
  } catch (error) {
    console.error('Error handling global environment file unlink:', error);
  }
};

class WorkspaceWatcher {
  private watchers: Map<string, vscode.FileSystemWatcher> = new Map();
  private environmentWatchers: Map<string, vscode.FileSystemWatcher> = new Map();

  addWatcher(workspacePath: string): void {
    const workspaceFilePath = path.join(workspacePath, 'workspace.yml');
    const environmentsDir = path.join(workspacePath, 'environments');
    const workspaceUid = getWorkspaceUid(workspacePath);

    this.removeWatcher(workspacePath);

    const workspacePattern = new vscode.RelativePattern(workspacePath, 'workspace.yml');
    const workspaceWatcher = vscode.workspace.createFileSystemWatcher(workspacePattern);

    workspaceWatcher.onDidChange(() => handleWorkspaceFileChange(workspacePath));
    workspaceWatcher.onDidCreate(() => handleWorkspaceFileChange(workspacePath));

    this.watchers.set(workspacePath, workspaceWatcher);

    if (fs.existsSync(workspaceFilePath)) {
      handleWorkspaceFileChange(workspacePath);
    }

    if (fs.existsSync(environmentsDir)) {
      const envPattern = new vscode.RelativePattern(environmentsDir, '*.yml');
      const envWatcher = vscode.workspace.createFileSystemWatcher(envPattern);

      envWatcher.onDidCreate(uri => {
        handleGlobalEnvironmentFileAdd(uri.fsPath, workspacePath, workspaceUid);
      });

      envWatcher.onDidChange(uri => {
        handleGlobalEnvironmentFileChange(uri.fsPath, workspacePath, workspaceUid);
      });

      envWatcher.onDidDelete(uri => {
        handleGlobalEnvironmentFileUnlink(uri.fsPath, workspaceUid);
      });

      this.environmentWatchers.set(workspacePath, envWatcher);

      this.loadExistingEnvironments(environmentsDir, workspacePath, workspaceUid);
    } else {
      const dirPattern = new vscode.RelativePattern(workspacePath, 'environments');
      const dirWatcher = vscode.workspace.createFileSystemWatcher(dirPattern);

      dirWatcher.onDidCreate(() => {
        dirWatcher.dispose();
        this.addWatcher(workspacePath);
      });

      this.environmentWatchers.set(workspacePath, dirWatcher);
    }
  }

  private async loadExistingEnvironments(
    environmentsDir: string,
    workspacePath: string,
    workspaceUid: string
  ): Promise<void> {
    try {
      const files = fs.readdirSync(environmentsDir);
      for (const file of files) {
        if (file.endsWith('.yml')) {
          const pathname = path.join(environmentsDir, file);
          await handleGlobalEnvironmentFileAdd(pathname, workspacePath, workspaceUid);
        }
      }
    } catch (error) {
      console.error('Error loading existing environments:', error);
    }
  }

  removeWatcher(workspacePath: string): void {
    try {
      if (this.watchers.has(workspacePath)) {
        this.watchers.get(workspacePath)!.dispose();
        this.watchers.delete(workspacePath);
      }
      if (this.environmentWatchers.has(workspacePath)) {
        this.environmentWatchers.get(workspacePath)!.dispose();
        this.environmentWatchers.delete(workspacePath);
      }
    } catch (error) {
      console.error('Error removing workspace watcher:', error);
    }
  }

  hasWatcher(workspacePath: string): boolean {
    return this.watchers.has(workspacePath);
  }

  dispose(): void {
    for (const watcher of this.watchers.values()) {
      watcher.dispose();
    }
    for (const watcher of this.environmentWatchers.values()) {
      watcher.dispose();
    }
    this.watchers.clear();
    this.environmentWatchers.clear();
  }
}

export default WorkspaceWatcher;
export { WorkspaceWatcher };
