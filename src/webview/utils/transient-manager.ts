/**
 * Builds the in-memory item behind an unsaved request.
 *
 * The extension host opens a request panel before any item exists and asks this
 * webview to build one (`main:new-transient-request`), passing the uid and name it
 * chose and, for a request filled from a curl command, the fields it parsed. The
 * item lives only in this panel's Redux store until the user saves it, when the
 * extension writes it into a collection the user picks and this panel closes.
 *
 * The collection it is built in is normally the hidden Scratch collection, which
 * exists so that the request runtime has a root to resolve against. The item's
 * pathname is a string, not a file: no folder is created and nothing is written.
 *   {collectionPath}/.bruno/transient/{name}.{bru|yml}
 * The collection prefix makes the item count as belonging to that collection, so
 * folder inheritance and relative paths behave as for a saved request.
 */

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

interface CollectionPresets {
  requestType?: string;
  requestUrl?: string;
}

/**
 * Set by the extension host when it opens the panel before the item exists: the uid both
 * sides will know the item by, the name it chose (it numbers "Untitled N" across all panels,
 * which no single store can see), and for a request filled from a curl command, the fields
 * that command gave.
 */
interface TransientOverrides {
  uid: string;
  name: string;
  request?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

type RequestKind = 'http' | 'graphql' | 'grpc' | 'ws';

interface CollectionInfo {
  uid: string;
  pathname: string;
  format?: string; // 'bru' or 'yml'
  brunoConfig?: { presets?: CollectionPresets };
  draft?: { brunoConfig?: { presets?: CollectionPresets } } | null;
}

function getFileExtension(format?: string): string {
  return format === 'bru' ? 'bru' : 'yml';
}

function buildTransientPath(collectionPathname: string, filename: string): string {
  const separator = collectionPathname.includes('\\') ? '\\' : '/';
  return `${collectionPathname}${separator}.bruno${separator}transient${separator}${filename}`;
}

function generateItemMeta(collection: CollectionInfo, name: string): { name: string; filename: string; pathname: string } {
  const ext = getFileExtension(collection.format);
  const filename = `${name}.${ext}`;
  const pathname = buildTransientPath(collection.pathname, filename);
  return { name, filename, pathname };
}

function getPresets(collection: CollectionInfo): CollectionPresets {
  return collection?.draft?.brunoConfig?.presets || collection?.brunoConfig?.presets || {};
}

function getPresetUrl(collection: CollectionInfo): string {
  return getPresets(collection).requestUrl || '';
}

function createBaseRequest(url = ''): Record<string, unknown> {
  return {
    url,
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

function createHttpRequest(collection: CollectionInfo, overrides: TransientOverrides): TransientItem {
  const { name, filename, pathname } = generateItemMeta(collection, overrides.name);

  return {
    uid: overrides.uid,
    name,
    type: 'http-request',
    isTransient: true,
    seq: 0,
    draft: null,
    filename,
    pathname,
    request: createBaseRequest(getPresetUrl(collection)),
    settings: { encodeUrl: true }
  };
}

function createGraphQLRequest(collection: CollectionInfo, overrides: TransientOverrides): TransientItem {
  const { name, filename, pathname } = generateItemMeta(collection, overrides.name);

  return {
    uid: overrides.uid,
    name,
    type: 'graphql-request',
    isTransient: true,
    seq: 0,
    draft: null,
    filename,
    pathname,
    request: {
      ...createBaseRequest(getPresetUrl(collection)),
      method: 'POST',
      body: {
        mode: 'graphql',
        graphql: { query: '', variables: '' }
      }
    },
    settings: { encodeUrl: true }
  };
}

function createGrpcRequest(collection: CollectionInfo, overrides: TransientOverrides): TransientItem {
  const { name, filename, pathname } = generateItemMeta(collection, overrides.name);

  return {
    uid: overrides.uid,
    name,
    type: 'grpc-request',
    isTransient: true,
    seq: 0,
    draft: null,
    filename,
    pathname,
    request: {
      url: getPresetUrl(collection),
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
}

function createWebSocketRequest(collection: CollectionInfo, overrides: TransientOverrides): TransientItem {
  const { name, filename, pathname } = generateItemMeta(collection, overrides.name);

  return {
    uid: overrides.uid,
    name,
    type: 'ws-request',
    isTransient: true,
    seq: 0,
    draft: null,
    filename,
    pathname,
    request: {
      url: getPresetUrl(collection),
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
}

function createByKind(type: RequestKind, collection: CollectionInfo, overrides: TransientOverrides): TransientItem {
  if (type === 'graphql') {
    return createGraphQLRequest(collection, overrides);
  }

  if (type === 'grpc') {
    return createGrpcRequest(collection, overrides);
  }

  if (type === 'ws') {
    return createWebSocketRequest(collection, overrides);
  }

  return createHttpRequest(collection, overrides);
}

/** The one way in: the kind's base request, with the extension host's overrides laid over it. */
const transientManager = {
  create(type: RequestKind, collection: CollectionInfo, overrides: TransientOverrides): TransientItem {
    const item = createByKind(type, collection, overrides);

    return {
      ...item,
      request: { ...item.request, ...overrides.request },
      settings: { ...item.settings, ...overrides.settings }
    };
  }
};

export default transientManager;
export { transientManager, TransientItem, CollectionInfo, TransientOverrides, RequestKind };
