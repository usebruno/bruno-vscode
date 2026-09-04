import { describe, test, expect, vi } from 'vitest';

// Stub vscode for the node test env; the real utils/collections helpers are used.
vi.mock('vscode', () => ({}));

import { transientManager, type CollectionInfo } from './transient-manager';

const bruCollection: CollectionInfo = {
  uid: 'col-1',
  pathname: '/Users/test/my-collection',
  format: 'bru'
};

const ymlCollection: CollectionInfo = {
  uid: 'col-2',
  pathname: '/Users/test/my-yml-collection',
  format: 'yml'
};

const noFormatCollection: CollectionInfo = {
  uid: 'col-3',
  pathname: '/Users/test/my-default-collection'
};

const windowsCollection: CollectionInfo = {
  uid: 'col-4',
  pathname: 'C:\\Users\\test\\my-collection',
  format: 'bru'
};

// An open transient request as it appears in collection.items.
const transientUntitled = (n: number) => ({
  name: `Untitled ${n}`,
  type: 'http-request',
  request: {},
  isTransient: true
});
// A saved (persisted) request — has no isTransient flag.
const savedRequest = (name: string) => ({ name, type: 'http-request', request: {} });

// ─── Common fields shared by all request types ──────────────────────────────

describe('common transient item fields', () => {
  test('every item has isTransient: true, seq: 0, draft: null', () => {
    const item = transientManager.createHttpRequest(bruCollection);
    expect(item.isTransient).toBe(true);
    expect(item.seq).toBe(0);
    expect(item.draft).toBeNull();
  });

  test('every item gets a unique uid', () => {
    const a = transientManager.createHttpRequest(bruCollection);
    const b = transientManager.createHttpRequest(bruCollection);
    expect(a.uid).not.toBe(b.uid);
  });
});

// ─── Auto-incrementing names ────────────────────────────────────────────────

describe('transient request names', () => {
  test('first item is named "Untitled 1" when the collection is empty', () => {
    const item = transientManager.createHttpRequest(bruCollection);
    expect(item.name).toBe('Untitled 1');
  });

  test('increments above the highest existing open transient', () => {
    const item = transientManager.createGraphQLRequest({ ...bruCollection, items: [transientUntitled(1)] });
    expect(item.name).toBe('Untitled 2');

    const item2 = transientManager.createGrpcRequest({
      ...bruCollection,
      items: [transientUntitled(1), transientUntitled(2)]
    });
    expect(item2.name).toBe('Untitled 3');
  });

  test('resets to "Untitled 1" once transients are saved/closed', () => {
    const item = transientManager.createHttpRequest({ ...bruCollection, items: [] });
    expect(item.name).toBe('Untitled 1');
  });

  test('ignores saved (non-transient) requests when numbering', () => {
    const item = transientManager.createHttpRequest({
      ...bruCollection,
      items: [savedRequest('Untitled 3'), transientUntitled(1)]
    });
    expect(item.name).toBe('Untitled 2');
  });

  test('counts transients nested inside folders (flattenItems)', () => {
    const items = [
      { name: 'My Folder', type: 'folder', items: [transientUntitled(1), transientUntitled(2)] }
    ];
    const item = transientManager.createHttpRequest({ ...bruCollection, items });
    expect(item.name).toBe('Untitled 3');
  });

  test('different collections are numbered independently', () => {
    const a = transientManager.createHttpRequest({ ...bruCollection, items: [] });
    const b = transientManager.createHttpRequest({ ...ymlCollection, items: [transientUntitled(1)] });
    expect(a.name).toBe('Untitled 1');
    expect(b.name).toBe('Untitled 2');
  });
});

// ─── File extension and pathname ────────────────────────────────────────────

describe('file extension and pathname', () => {
  test('bru format produces .bru extension', () => {
    const item = transientManager.createHttpRequest(bruCollection);
    expect(item.filename).toBe('Untitled 1.bru');
  });

  test('yml format produces .yml extension', () => {
    const item = transientManager.createHttpRequest(ymlCollection);
    expect(item.filename).toBe('Untitled 1.yml');
  });

  test('missing format defaults to .yml', () => {
    const item = transientManager.createHttpRequest(noFormatCollection);
    expect(item.filename).toBe('Untitled 1.yml');
  });

  test('pathname is under .bruno/transient/ with Unix separators', () => {
    const item = transientManager.createHttpRequest(bruCollection);
    expect(item.pathname).toBe('/Users/test/my-collection/.bruno/transient/Untitled 1.bru');
  });

  test('pathname uses backslash separators for Windows paths', () => {
    const item = transientManager.createHttpRequest(windowsCollection);
    expect(item.pathname).toBe('C:\\Users\\test\\my-collection\\.bruno\\transient\\Untitled 1.bru');
  });
});

// ─── HTTP request ───────────────────────────────────────────────────────────

describe('createHttpRequest', () => {
  test('type is http-request', () => {
    const item = transientManager.createHttpRequest(bruCollection);
    expect(item.type).toBe('http-request');
  });

  test('method defaults to GET', () => {
    const item = transientManager.createHttpRequest(bruCollection);
    expect(item.request.method).toBe('GET');
  });

  test('body mode is none', () => {
    const item = transientManager.createHttpRequest(bruCollection);
    expect((item.request.body as any).mode).toBe('none');
  });

  test('settings has encodeUrl: true', () => {
    const item = transientManager.createHttpRequest(bruCollection);
    expect(item.settings).toEqual({ encodeUrl: true });
  });

  test('has empty url, headers, params, assertions, tests, docs', () => {
    const item = transientManager.createHttpRequest(bruCollection);
    expect(item.request.url).toBe('');
    expect(item.request.headers).toEqual([]);
    expect(item.request.params).toEqual([]);
    expect(item.request.assertions).toEqual([]);
    expect(item.request.tests).toBe('');
    expect(item.request.docs).toBe('');
  });
});

// ─── GraphQL request ────────────────────────────────────────────────────────

describe('createGraphQLRequest', () => {
  test('type is graphql-request', () => {
    const item = transientManager.createGraphQLRequest(bruCollection);
    expect(item.type).toBe('graphql-request');
  });

  test('method defaults to POST', () => {
    const item = transientManager.createGraphQLRequest(bruCollection);
    expect(item.request.method).toBe('POST');
  });

  test('body mode is graphql with query and variables', () => {
    const item = transientManager.createGraphQLRequest(bruCollection);
    const body = item.request.body as any;
    expect(body.mode).toBe('graphql');
    expect(body.graphql).toEqual({ query: '', variables: '' });
  });
});

// ─── gRPC request ───────────────────────────────────────────────────────────

describe('createGrpcRequest', () => {
  test('type is grpc-request', () => {
    const item = transientManager.createGrpcRequest(bruCollection);
    expect(item.type).toBe('grpc-request');
  });

  test('body mode is grpc with default message', () => {
    const item = transientManager.createGrpcRequest(bruCollection);
    const body = item.request.body as any;
    expect(body.mode).toBe('grpc');
    expect(body.grpc).toEqual([{ name: 'message 1', content: '{}' }]);
  });

  test('method and methodType are empty strings', () => {
    const item = transientManager.createGrpcRequest(bruCollection);
    expect(item.request.method).toBe('');
    expect(item.request.methodType).toBe('');
  });

  test('settings is empty object', () => {
    const item = transientManager.createGrpcRequest(bruCollection);
    expect(item.settings).toEqual({});
  });
});

// ─── WebSocket request ──────────────────────────────────────────────────────

describe('createWebSocketRequest', () => {
  test('type is ws-request', () => {
    const item = transientManager.createWebSocketRequest(bruCollection);
    expect(item.type).toBe('ws-request');
  });

  test('method defaults to GET', () => {
    const item = transientManager.createWebSocketRequest(bruCollection);
    expect(item.request.method).toBe('GET');
  });

  test('body mode is ws with default message', () => {
    const item = transientManager.createWebSocketRequest(bruCollection);
    const body = item.request.body as any;
    expect(body.mode).toBe('ws');
    expect(body.ws).toEqual([{ name: 'message 1', type: 'json', content: '{}' }]);
  });

  test('settings has timeout and keepAliveInterval', () => {
    const item = transientManager.createWebSocketRequest(bruCollection);
    expect(item.settings).toEqual({ timeout: 0, keepAliveInterval: 0 });
  });
});

// ─── Collection-level inheritance ───────────────────────────────────────────

describe('collection presets', () => {
  const withPresets: CollectionInfo = {
    uid: 'col-5',
    pathname: '/Users/test/preset-collection',
    format: 'bru',
    brunoConfig: { presets: { requestType: 'http', requestUrl: 'https://api.example.com' } }
  };

  const withDraftPresets: CollectionInfo = {
    ...withPresets,
    uid: 'col-6',
    draft: { brunoConfig: { presets: { requestUrl: 'https://draft.example.com' } } }
  };

  beforeEach(() => {
    transientManager.resetCounter(withPresets.uid);
    transientManager.resetCounter(withDraftPresets.uid);
  });

  test('base URL preset seeds the url of every request type', () => {
    expect(transientManager.createHttpRequest(withPresets).request.url).toBe('https://api.example.com');
    expect(transientManager.createGraphQLRequest(withPresets).request.url).toBe('https://api.example.com');
    expect(transientManager.createGrpcRequest(withPresets).request.url).toBe('https://api.example.com');
    expect(transientManager.createWebSocketRequest(withPresets).request.url).toBe('https://api.example.com');
  });

  test('unsaved preset edits on the draft win over the saved config', () => {
    const item = transientManager.createHttpRequest(withDraftPresets);
    expect(item.request.url).toBe('https://draft.example.com');
  });

  test('collections without presets still produce an empty url', () => {
    expect(transientManager.createHttpRequest(bruCollection).request.url).toBe('');
  });

  test('the requestType preset does not override the type picked from the menu', () => {
    const graphqlPreset: CollectionInfo = {
      uid: 'col-7',
      pathname: '/Users/test/graphql-preset',
      brunoConfig: { presets: { requestType: 'graphql' } }
    };
    expect(transientManager.createHttpRequest(graphqlPreset).type).toBe('http-request');
  });
});
