/**
 * Workspace configuration utilities for VS Code Extension
 * Converted from bruno-electron/src/utils/workspace-config.js
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import crypto from 'crypto';
import { writeFile, validateName, isValidCollectionDirectory, posixifyPath } from './filesystem';
import { generateUidBasedOnHash } from './common';
import { withLock, getWorkspaceLockKey } from './workspace-lock';

const WORKSPACE_TYPE = 'workspace';
const OPENCOLLECTION_VERSION = '1.0.0';

interface CollectionEntry {
  name: string;
  path: string;
  remote?: string;
}

interface WorkspaceConfig {
  opencollection?: string;
  info?: {
    name: string;
    type: string;
  };
  name?: string;
  type?: string;
  collections?: CollectionEntry[];
  specs?: Array<{ name: string; path: string }>;
  docs?: string;
  activeEnvironmentUid?: string;
}

const quoteYamlValue = (value: unknown): string => {
  if (typeof value !== 'string') {
    return `"${String(value)}"`;
  }

  if (value === '') {
    return '""';
  }

  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
};

const writeWorkspaceFileAtomic = async (workspacePath: string, content: string): Promise<void> => {
  const workspaceFilePath = path.join(workspacePath, 'workspace.yml');
  const tempFilePath = path.join(os.tmpdir(), `workspace-${Date.now()}-${crypto.randomBytes(16).toString('hex')}.yml`);

  try {
    await writeFile(tempFilePath, content);

    if (fs.existsSync(workspaceFilePath)) {
      fs.unlinkSync(workspaceFilePath);
    }

    fs.renameSync(tempFilePath, workspaceFilePath);
  } catch (error) {
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (_) {}
    }
    throw error;
  }
};

const isValidCollectionEntry = (collection: unknown): collection is CollectionEntry => {
  if (!collection || typeof collection !== 'object') {
    return false;
  }

  const c = collection as Record<string, unknown>;
  if (!c.name || typeof c.name !== 'string' || (c.name as string).trim() === '') {
    return false;
  }

  if (!c.path || typeof c.path !== 'string' || (c.path as string).trim() === '') {
    return false;
  }

  return true;
};

const sanitizeCollections = (collections: unknown[]): CollectionEntry[] => {
  if (!Array.isArray(collections)) {
    return [];
  }

  return collections
    .filter((collection): collection is CollectionEntry => {
      if (!isValidCollectionEntry(collection)) {
        console.error('Skipping invalid collection entry:', collection);
        return false;
      }
      return true;
    })
    .map((collection) => {
      const sanitized: CollectionEntry = {
        name: collection.name.trim(),
        path: collection.path.trim()
      };

      if (collection.remote && typeof collection.remote === 'string') {
        sanitized.remote = collection.remote.trim();
      }

      return sanitized;
    });
};

const makeRelativePath = (workspacePath: string, absolutePath: string): string => {
  if (!path.isAbsolute(absolutePath)) {
    return absolutePath;
  }

  try {
    const relativePath = path.relative(workspacePath, absolutePath);
    if (relativePath.startsWith('..') && relativePath.split(path.sep).filter((s) => s === '..').length > 2) {
      return absolutePath;
    }
    return relativePath;
  } catch (error) {
    return absolutePath;
  }
};

const normalizeCollectionEntry = (workspacePath: string, collection: CollectionEntry): CollectionEntry => {
  const relativePath = posixifyPath(makeRelativePath(workspacePath, collection.path.trim()));

  const normalizedCollection: CollectionEntry = {
    name: collection.name,
    path: relativePath
  };

  if (collection.remote) {
    normalizedCollection.remote = collection.remote;
  }

  return normalizedCollection;
};

const validateWorkspacePath = (workspacePath: string): boolean => {
  if (!workspacePath) {
    throw new Error('Workspace path is required');
  }

  if (!fs.existsSync(workspacePath)) {
    throw new Error(`Workspace path does not exist: ${workspacePath}`);
  }

  const workspaceFilePath = path.join(workspacePath, 'workspace.yml');
  if (!fs.existsSync(workspaceFilePath)) {
    throw new Error('Invalid workspace: workspace.yml not found');
  }

  return true;
};

const validateWorkspaceDirectory = (dirPath: string): boolean => {
  if (!validateName(path.basename(dirPath))) {
    throw new Error(`Invalid workspace directory name: ${dirPath}`);
  }
  return true;
};

const createWorkspaceConfig = (workspaceName: string): WorkspaceConfig => ({
  opencollection: OPENCOLLECTION_VERSION,
  info: {
    name: workspaceName,
    type: WORKSPACE_TYPE
  },
  collections: [],
  specs: [],
  docs: ''
});

const normalizeWorkspaceConfig = (config: WorkspaceConfig): WorkspaceConfig => {
  return {
    ...config,
    name: config.info?.name,
    type: config.info?.type,
    collections: config.collections || []
  };
};

const readWorkspaceConfig = (workspacePath: string): WorkspaceConfig => {
  const workspaceFilePath = path.join(workspacePath, 'workspace.yml');

  if (!fs.existsSync(workspaceFilePath)) {
    throw new Error('Invalid workspace: workspace.yml not found');
  }

  const yamlContent = fs.readFileSync(workspaceFilePath, 'utf8');
  const workspaceConfig = yaml.load(yamlContent) as WorkspaceConfig;

  if (!workspaceConfig || typeof workspaceConfig !== 'object') {
    throw new Error('Invalid workspace: workspace.yml is malformed');
  }

  return normalizeWorkspaceConfig(workspaceConfig);
};

const generateYamlContent = (config: WorkspaceConfig): string => {
  const yamlLines: string[] = [];
  const workspaceName = config.info?.name || config.name || 'Unnamed Workspace';
  const workspaceType = config.info?.type || config.type || WORKSPACE_TYPE;

  yamlLines.push(`opencollection: ${config.opencollection || OPENCOLLECTION_VERSION}`);
  yamlLines.push('info:');
  yamlLines.push(`  name: ${quoteYamlValue(workspaceName)}`);
  yamlLines.push(`  type: ${workspaceType}`);
  yamlLines.push('');

  const collections = sanitizeCollections(config.collections || []);
  if (collections.length > 0) {
    yamlLines.push('collections:');
    for (const collection of collections) {
      yamlLines.push(`  - name: ${quoteYamlValue(collection.name)}`);
      yamlLines.push(`    path: ${quoteYamlValue(collection.path)}`);
      if (collection.remote) {
        yamlLines.push(`    remote: ${quoteYamlValue(collection.remote)}`);
      }
    }
  } else {
    yamlLines.push('collections:');
  }
  yamlLines.push('');

  yamlLines.push('specs:');
  yamlLines.push('');

  const docs = config.docs || '';
  if (docs) {
    const escapedDocs = docs.includes('\n')
      ? `|-\n  ${docs.split('\n').join('\n  ')}`
      : quoteYamlValue(docs);
    yamlLines.push(`docs: ${escapedDocs}`);
  } else {
    yamlLines.push("docs: ''");
  }

  if (config.activeEnvironmentUid && typeof config.activeEnvironmentUid === 'string') {
    yamlLines.push('');
    yamlLines.push(`activeEnvironmentUid: ${config.activeEnvironmentUid}`);
  }

  yamlLines.push('');

  return yamlLines.join('\n');
};

const writeWorkspaceConfig = async (workspacePath: string, config: WorkspaceConfig): Promise<void> => {
  return withLock(getWorkspaceLockKey(workspacePath), async () => {
    const yamlContent = generateYamlContent(config);
    await writeWorkspaceFileAtomic(workspacePath, yamlContent);
  });
};

const validateWorkspaceConfig = (config: WorkspaceConfig): boolean => {
  if (!config || typeof config !== 'object') {
    throw new Error('Workspace configuration must be an object');
  }

  const type = config.info?.type || config.type;
  if (type !== WORKSPACE_TYPE) {
    throw new Error('Invalid workspace: not a bruno workspace');
  }

  const name = config.info?.name || config.name;
  if (!name || typeof name !== 'string') {
    throw new Error('Workspace must have a valid name');
  }

  return true;
};

const updateWorkspaceName = async (workspacePath: string, newName: string): Promise<WorkspaceConfig> => {
  return withLock(getWorkspaceLockKey(workspacePath), async () => {
    const config = readWorkspaceConfig(workspacePath);
    config.name = newName;
    if (config.info) {
      config.info.name = newName;
    }
    const yamlContent = generateYamlContent(config);
    await writeWorkspaceFileAtomic(workspacePath, yamlContent);
    return config;
  });
};

const updateWorkspaceDocs = async (workspacePath: string, docs: string): Promise<string> => {
  return withLock(getWorkspaceLockKey(workspacePath), async () => {
    const config = readWorkspaceConfig(workspacePath);
    config.docs = docs;
    const yamlContent = generateYamlContent(config);
    await writeWorkspaceFileAtomic(workspacePath, yamlContent);
    return docs;
  });
};

const addCollectionToWorkspace = async (
  workspacePath: string,
  collection: CollectionEntry
): Promise<CollectionEntry[]> => {
  if (!isValidCollectionEntry(collection)) {
    throw new Error('Invalid collection: name and path are required');
  }

  return withLock(getWorkspaceLockKey(workspacePath), async () => {
    const config = readWorkspaceConfig(workspacePath);

    if (!config.collections) {
      config.collections = [];
    }

    const normalizedCollection = normalizeCollectionEntry(workspacePath, collection);

    if (collection.remote && typeof collection.remote === 'string') {
      normalizedCollection.remote = collection.remote.trim();
    }

    // Compare normalized paths to avoid duplicates from absolute/relative mismatches
    const existingIndex = config.collections.findIndex((c) => {
      const existingNormalized = normalizeCollectionEntry(workspacePath, c);
      return existingNormalized.path === normalizedCollection.path;
    });

    if (existingIndex >= 0) {
      config.collections[existingIndex] = normalizedCollection;
    } else {
      config.collections.push(normalizedCollection);
    }

    const yamlContent = generateYamlContent(config);
    await writeWorkspaceFileAtomic(workspacePath, yamlContent);
    return config.collections;
  });
};

const removeCollectionFromWorkspace = async (
  workspacePath: string,
  collectionPath: string
): Promise<{ removedCollection: CollectionEntry | null; updatedConfig: WorkspaceConfig }> => {
  return withLock(getWorkspaceLockKey(workspacePath), async () => {
    const config = readWorkspaceConfig(workspacePath);

    let removedCollection: CollectionEntry | null = null;

    config.collections = (config.collections || []).filter((c) => {
      const collectionPathFromYml = c.path;

      if (!collectionPathFromYml) {
        return true;
      }

      const absoluteCollectionPath = path.isAbsolute(collectionPathFromYml)
        ? collectionPathFromYml
        : path.resolve(workspacePath, collectionPathFromYml);

      if (path.normalize(absoluteCollectionPath) === path.normalize(collectionPath)) {
        removedCollection = c;
        return false;
      }

      return true;
    });

    const yamlContent = generateYamlContent(config);
    await writeWorkspaceFileAtomic(workspacePath, yamlContent);

    return {
      removedCollection,
      updatedConfig: config
    };
  });
};

const getWorkspaceCollections = (workspacePath: string): CollectionEntry[] => {
  const config = readWorkspaceConfig(workspacePath);
  const collections = config.collections || [];

  const seenPaths = new Set<string>();
  return collections
    .map((collection) => {
      if (collection.path && !path.isAbsolute(collection.path)) {
        return {
          ...collection,
          path: path.resolve(workspacePath, collection.path)
        };
      }
      return collection;
    })
    .filter((collection) => {
      if (!collection.path) {
        return false;
      }
      const normalizedPath = path.normalize(collection.path);
      if (seenPaths.has(normalizedPath)) {
        return false;
      }
      seenPaths.add(normalizedPath);
      if (!isValidCollectionDirectory(collection.path)) {
        return false;
      }
      return true;
    });
};

const getWorkspaceUid = (workspacePath: string): string => {
  // TODO: Integrate with default workspace manager when available
  return generateUidBasedOnHash(workspacePath);
};

export {
  makeRelativePath,
  normalizeCollectionEntry,
  validateWorkspacePath,
  validateWorkspaceDirectory,
  createWorkspaceConfig,
  readWorkspaceConfig,
  writeWorkspaceConfig,
  validateWorkspaceConfig,
  updateWorkspaceName,
  updateWorkspaceDocs,
  addCollectionToWorkspace,
  removeCollectionFromWorkspace,
  getWorkspaceCollections,
  generateYamlContent,
  getWorkspaceUid,
  writeWorkspaceFileAtomic,
  isValidCollectionEntry,
  WorkspaceConfig,
  CollectionEntry
};
