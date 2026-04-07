/**
 * Migration for global environments from old bruno-vscode extension
 *
 * Old extension stored global environments in:
 * - globalState key: 'environments'
 * - Format: Array<{ uid, name, variables[] }>
 * - Active environment: globalState key: 'activeGlobalEnvironmentUid'
 *
 * New extension stores environments as YAML files:
 * - Located at: {workspace}/environments/{name}.yml
 * - Format: YAML with variables array
 * - Active environment stored in workspace.yml
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import { generateUidBasedOnHash } from '../utils/common';

interface OldEnvironmentVariable {
  uid: string;
  name: string;
  value: string;
  type?: string;
  secret?: boolean;
  enabled?: boolean;
}

interface OldGlobalEnvironment {
  uid: string;
  name: string;
  variables: OldEnvironmentVariable[];
}

interface NewEnvironmentVariable {
  name: string;
  value: string;
  type?: string;
  enabled?: boolean;
  secret?: boolean;
}

interface NewEnvironmentConfig {
  name: string;
  variables: NewEnvironmentVariable[];
}

interface WorkspaceConfig {
  info?: {
    name?: string;
    type?: string;
  };
  collections?: Array<{ name?: string; path: string }>;
  specs?: Array<{ name: string; path: string }>;
  docs?: string;
  activeEnvironmentUid?: string;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .trim() || 'environment';
}

function readWorkspaceConfig(workspacePath: string): WorkspaceConfig | null {
  const workspaceYmlPath = path.join(workspacePath, 'workspace.yml');

  if (!fs.existsSync(workspaceYmlPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(workspaceYmlPath, 'utf8');
    return yaml.load(content) as WorkspaceConfig;
  } catch (error) {
    console.error('[Migration] Error reading workspace.yml:', error);
    return null;
  }
}

function writeWorkspaceConfig(workspacePath: string, config: WorkspaceConfig): boolean {
  const workspaceYmlPath = path.join(workspacePath, 'workspace.yml');

  try {
    const content = yaml.dump(config, { lineWidth: -1 });
    fs.writeFileSync(workspaceYmlPath, content, 'utf8');
    return true;
  } catch (error) {
    console.error('[Migration] Error writing workspace.yml:', error);
    return false;
  }
}

function writeEnvironmentFile(
  environmentsPath: string,
  environment: OldGlobalEnvironment
): { success: boolean; filePath: string; uid: string } {
  const filename = sanitizeFilename(environment.name) + '.yml';
  const filePath = path.join(environmentsPath, filename);
  const uid = generateUidBasedOnHash(filePath);

  try {
    const variables: NewEnvironmentVariable[] = (environment.variables || []).map((v) => ({
      name: v.name,
      value: v.value,
      type: v.type || 'text',
      enabled: v.enabled !== false,
      secret: v.secret || false
    }));

    const config: NewEnvironmentConfig = {
      name: environment.name,
      variables
    };

    const content = yaml.dump(config, { lineWidth: -1 });
    fs.writeFileSync(filePath, content, 'utf8');

    return { success: true, filePath, uid };
  } catch (error) {
    console.error(`[Migration] Error writing environment file ${filename}:`, error);
    return { success: false, filePath, uid };
  }
}

/**
 * Migrate global environments from old extension to default workspace
 *
 * @param context VS Code extension context
 * @param defaultWorkspacePath Path to the default workspace
 * @returns Number of environments migrated
 */
export async function migrateGlobalEnvironments(
  context: vscode.ExtensionContext,
  defaultWorkspacePath: string
): Promise<number> {
  const globalEnvironments = context.globalState.get<OldGlobalEnvironment[]>(
    'environments',
    []
  );

  const activeEnvironmentUid = context.globalState.get<string | null>(
    'activeGlobalEnvironmentUid',
    null
  );

  if (!globalEnvironments || globalEnvironments.length === 0) {
    return 0;
  }

  const environmentsPath = path.join(defaultWorkspacePath, 'environments');
  if (!fs.existsSync(environmentsPath)) {
    try {
      fs.mkdirSync(environmentsPath, { recursive: true });
    } catch (error) {
      console.error('[Migration] Failed to create environments directory:', error);
      return 0;
    }
  }

  let existingFiles: Set<string>;
  try {
    const files = fs.readdirSync(environmentsPath);
    existingFiles = new Set(files.map((f) => f.toLowerCase()));
  } catch {
    existingFiles = new Set();
  }

  let migratedCount = 0;
  let newActiveEnvironmentUid: string | null = null;

  const uidMapping = new Map<string, string>();

  for (const environment of globalEnvironments) {
    const filename = sanitizeFilename(environment.name) + '.yml';

    // Skip if file already exists
    if (existingFiles.has(filename.toLowerCase())) {
      continue;
    }

    const result = writeEnvironmentFile(environmentsPath, environment);

    if (result.success) {
      migratedCount++;
      uidMapping.set(environment.uid, result.uid);

      // Track new active environment UID
      if (environment.uid === activeEnvironmentUid) {
        newActiveEnvironmentUid = result.uid;
      }
    }
  }

  if (newActiveEnvironmentUid) {
    const config = readWorkspaceConfig(defaultWorkspacePath);
    if (config) {
      config.activeEnvironmentUid = newActiveEnvironmentUid;
      writeWorkspaceConfig(defaultWorkspacePath, config);
    }
  }

  return migratedCount;
}
