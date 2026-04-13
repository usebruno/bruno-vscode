/**
 * TransientManager — creates in-memory request items that are not persisted to disk.
 *
 * Transient requests live only in Redux state and are excluded from the sidebar.
 * They can be edited, executed, and later saved to a collection folder.
 *
 * Each transient item gets a virtual pathname under:
 *   {collectionPath}/.bruno/transient/{name}.{bru|yml}
 * This allows scripts to resolve relative paths against the collection root.
 */

import { uuid } from 'utils/common/index';

interface TransientItem {
  uid: string;
  name: string;
  type: string;
  isTransient: true;
  seq: number;
  draft: null;
  filename: string;
  pathname: string;
  request: Record<string, unknown>;
  settings: Record<string, unknown>;
}

interface CollectionInfo {
  uid: string;
  pathname: string;
  format?: string; // 'bru' or 'yml'
}

// Track the next number for auto-generated names per collection
const counters: Record<string, number> = {};

function getNextName(collectionUid: string): string {
  if (!counters[collectionUid]) {
    counters[collectionUid] = 0;
  }
  counters[collectionUid]++;
  return `Untitled ${counters[collectionUid]}`;
}

function getFileExtension(format?: string): string {
  return format === 'bru' ? 'bru' : 'yml';
}

function buildTransientPath(collectionPathname: string, filename: string): string {
  const separator = collectionPathname.includes('\\') ? '\\' : '/';
  return `${collectionPathname}${separator}.bruno${separator}transient${separator}${filename}`;
}

function generateItemMeta(collection: CollectionInfo): { name: string; filename: string; pathname: string } {
  const name = getNextName(collection.uid);
  const ext = getFileExtension(collection.format);
  const filename = `${name}.${ext}`;
  const pathname = buildTransientPath(collection.pathname, filename);
  return { name, filename, pathname };
}

function createBaseRequest(): Record<string, unknown> {
  return {
    url: '',
    method: 'GET',
    headers: [],
    params: [],
    body: { mode: 'none', formUrlEncoded: [], multipartForm: [], file: [] },
    auth: { mode: 'inherit' },
    vars: { req: [], res: [] },
    assertions: [],
    script: { req: '', res: '' },
    tests: '',
    docs: ''
  };
}

const transientManager = {
  createHttpRequest(collection: CollectionInfo): TransientItem {
    const { name, filename, pathname } = generateItemMeta(collection);
    return {
      uid: uuid(),
      name,
      type: 'http-request',
      isTransient: true,
      seq: 0,
      draft: null,
      filename,
      pathname,
      request: createBaseRequest(),
      settings: { encodeUrl: true }
    };
  },

  createGraphQLRequest(collection: CollectionInfo): TransientItem {
    const { name, filename, pathname } = generateItemMeta(collection);
    return {
      uid: uuid(),
      name,
      type: 'graphql-request',
      isTransient: true,
      seq: 0,
      draft: null,
      filename,
      pathname,
      request: {
        ...createBaseRequest(),
        method: 'POST',
        body: {
          mode: 'graphql',
          graphql: { query: '', variables: '' }
        }
      },
      settings: { encodeUrl: true }
    };
  },

  createGrpcRequest(collection: CollectionInfo): TransientItem {
    const { name, filename, pathname } = generateItemMeta(collection);
    return {
      uid: uuid(),
      name,
      type: 'grpc-request',
      isTransient: true,
      seq: 0,
      draft: null,
      filename,
      pathname,
      request: {
        url: '',
        method: '',
        methodType: '',
        headers: [],
        body: {
          mode: 'grpc',
          grpc: [{ name: 'message 1', content: '{}' }]
        },
        auth: { mode: 'inherit' },
        vars: { req: [], res: [] },
        script: { req: null, res: null },
        assertions: [],
        tests: null,
        docs: null
      },
      settings: {}
    };
  },

  createWebSocketRequest(collection: CollectionInfo): TransientItem {
    const { name, filename, pathname } = generateItemMeta(collection);
    return {
      uid: uuid(),
      name,
      type: 'ws-request',
      isTransient: true,
      seq: 0,
      draft: null,
      filename,
      pathname,
      request: {
        url: '',
        method: 'GET',
        headers: [],
        params: [],
        body: {
          mode: 'ws',
          ws: [{ name: 'message 1', type: 'json', content: '{}' }]
        },
        auth: { mode: 'inherit' },
        vars: { req: [], res: [] },
        script: { req: null, res: null },
        assertions: [],
        tests: null,
        docs: null
      },
      settings: { timeout: 0, keepAliveInterval: 0 }
    };
  },

  resetCounter(collectionUid: string): void {
    delete counters[collectionUid];
  }
};

export default transientManager;
export { transientManager, TransientItem, CollectionInfo };
