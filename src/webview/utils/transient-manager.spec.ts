import { describe, test, expect, beforeEach, vi } from 'vitest';
import { transientManager, type CollectionInfo } from './transient-manager';

vi.mock('utils/common/index', () => {
  let counter = 0;
  return {
    uuid: () => `mock-uid-${++counter}`,
    sortByNameThenSequence: vi.fn()
  };
});

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

beforeEach(() => {
  transientManager.resetCounter(bruCollection.uid);
  transientManager.resetCounter(ymlCollection.uid);
  transientManager.resetCounter(noFormatCollection.uid);
  transientManager.resetCounter(windowsCollection.uid);
});

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

describe('auto-incrementing names', () => {
  test('first item is named "Untitled 1"', () => {
    const item = transientManager.createHttpRequest(bruCollection);
    expect(item.name).toBe('Untitled 1');
  });

  test('sequential items increment the counter', () => {
    const first = transientManager.createHttpRequest(bruCollection);
    const second = transientManager.createGraphQLRequest(bruCollection);
    const third = transientManager.createGrpcRequest(bruCollection);
    expect(first.name).toBe('Untitled 1');
    expect(second.name).toBe('Untitled 2');
    expect(third.name).toBe('Untitled 3');
  });

  test('different collections have independent counters', () => {
    const a = transientManager.createHttpRequest(bruCollection);
    const b = transientManager.createHttpRequest(ymlCollection);
    expect(a.name).toBe('Untitled 1');
    expect(b.name).toBe('Untitled 1');
  });

  test('resetCounter resets the naming sequence', () => {
    transientManager.createHttpRequest(bruCollection);
    transientManager.createHttpRequest(bruCollection);
    transientManager.resetCounter(bruCollection.uid);
    const item = transientManager.createHttpRequest(bruCollection);
    expect(item.name).toBe('Untitled 1');
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
