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

// The uid and name are the extension host's choice; the manager only uses them.
const metaDetails = { uid: 'item-1', name: 'Untitled 1' };

// ─── Common fields shared by all request types ──────────────────────────────

describe('common transient item fields', () => {
  test('every item has isTransient: true, seq: 0, draft: null', () => {
    const item = transientManager.create('http', bruCollection, metaDetails);
    expect(item.isTransient).toBe(true);
    expect(item.seq).toBe(0);
    expect(item.draft).toBeNull();
  });

  test('the item carries the uid and name it was given', () => {
    const item = transientManager.create('http', bruCollection, metaDetails);
    expect(item.uid).toBe('item-1');
    expect(item.name).toBe('Untitled 1');
  });
});

// ─── Auto-incrementing names ────────────────────────────────────────────────

describe('file extension and pathname', () => {
  test('bru format produces .bru extension', () => {
    const item = transientManager.create('http', bruCollection, metaDetails);
    expect(item.filename).toBe('Untitled 1.bru');
  });

  test('yml format produces .yml extension', () => {
    const item = transientManager.create('http', ymlCollection, metaDetails);
    expect(item.filename).toBe('Untitled 1.yml');
  });

  test('missing format defaults to .yml', () => {
    const item = transientManager.create('http', noFormatCollection, metaDetails);
    expect(item.filename).toBe('Untitled 1.yml');
  });

  test('pathname is under .bruno/transient/ with Unix separators', () => {
    const item = transientManager.create('http', bruCollection, metaDetails);
    expect(item.pathname).toBe('/Users/test/my-collection/.bruno/transient/Untitled 1.bru');
  });

  test('pathname uses backslash separators for Windows paths', () => {
    const item = transientManager.create('http', windowsCollection, metaDetails);
    expect(item.pathname).toBe('C:\\Users\\test\\my-collection\\.bruno\\transient\\Untitled 1.bru');
  });
});

// ─── HTTP request ───────────────────────────────────────────────────────────

describe("create('http')", () => {
  test('type is http-request', () => {
    const item = transientManager.create('http', bruCollection, metaDetails);
    expect(item.type).toBe('http-request');
  });

  test('method defaults to GET', () => {
    const item = transientManager.create('http', bruCollection, metaDetails);
    expect(item.request.method).toBe('GET');
  });

  test('body mode is none', () => {
    const item = transientManager.create('http', bruCollection, metaDetails);
    expect((item.request.body as any).mode).toBe('none');
  });

  test('settings has encodeUrl: true', () => {
    const item = transientManager.create('http', bruCollection, metaDetails);
    expect(item.settings).toEqual({ encodeUrl: true });
  });

  test('has empty url, headers, params, assertions, tests, docs', () => {
    const item = transientManager.create('http', bruCollection, metaDetails);
    expect(item.request.url).toBe('');
    expect(item.request.headers).toEqual([]);
    expect(item.request.params).toEqual([]);
    expect(item.request.assertions).toEqual([]);
    expect(item.request.tests).toBe('');
    expect(item.request.docs).toBe('');
  });
});

// ─── GraphQL request ────────────────────────────────────────────────────────

describe("create('graphql')", () => {
  test('type is graphql-request', () => {
    const item = transientManager.create('graphql', bruCollection, metaDetails);
    expect(item.type).toBe('graphql-request');
  });

  test('method defaults to POST', () => {
    const item = transientManager.create('graphql', bruCollection, metaDetails);
    expect(item.request.method).toBe('POST');
  });

  test('body mode is graphql with query and variables', () => {
    const item = transientManager.create('graphql', bruCollection, metaDetails);
    const body = item.request.body as any;
    expect(body.mode).toBe('graphql');
    expect(body.graphql).toEqual({ query: '', variables: '' });
  });
});

// ─── gRPC request ───────────────────────────────────────────────────────────

describe("create('grpc')", () => {
  test('type is grpc-request', () => {
    const item = transientManager.create('grpc', bruCollection, metaDetails);
    expect(item.type).toBe('grpc-request');
  });

  test('body mode is grpc with default message', () => {
    const item = transientManager.create('grpc', bruCollection, metaDetails);
    const body = item.request.body as any;
    expect(body.mode).toBe('grpc');
    expect(body.grpc).toEqual([{ name: 'message 1', content: '{}' }]);
  });

  test('method and methodType are empty strings', () => {
    const item = transientManager.create('grpc', bruCollection, metaDetails);
    expect(item.request.method).toBe('');
    expect(item.request.methodType).toBe('');
  });

  test('settings is empty object', () => {
    const item = transientManager.create('grpc', bruCollection, metaDetails);
    expect(item.settings).toEqual({});
  });
});

// ─── WebSocket request ──────────────────────────────────────────────────────

describe("create('ws')", () => {
  test('type is ws-request', () => {
    const item = transientManager.create('ws', bruCollection, metaDetails);
    expect(item.type).toBe('ws-request');
  });

  test('method defaults to GET', () => {
    const item = transientManager.create('ws', bruCollection, metaDetails);
    expect(item.request.method).toBe('GET');
  });

  test('body mode is ws with default message', () => {
    const item = transientManager.create('ws', bruCollection, metaDetails);
    const body = item.request.body as any;
    expect(body.mode).toBe('ws');
    expect(body.ws).toEqual([{ name: 'message 1', type: 'json', content: '{}' }]);
  });

  test('settings has timeout and keepAliveInterval', () => {
    const item = transientManager.create('ws', bruCollection, metaDetails);
    expect(item.settings).toEqual({ timeout: 0, keepAliveInterval: 0 });
  });
});

// ─── Collection-level inheritance ───────────────────────────────────────────

describe('collection presets', () => {
  const presetUrl = 'https://api.example.com';
  const draftPresetUrl = 'https://draft.example.com';

  const withPresets: CollectionInfo = {
    uid: 'col-5',
    pathname: '/Users/test/preset-collection',
    format: 'bru',
    brunoConfig: { presets: { requestType: 'http', requestUrl: presetUrl } }
  };

  const withDraftPresets: CollectionInfo = {
    ...withPresets,
    uid: 'col-6',
    draft: { brunoConfig: { presets: { requestUrl: draftPresetUrl } } }
  };

  test('base URL preset seeds the url of every request type', () => {
    expect(transientManager.create('http', withPresets, metaDetails).request.url).toBe(presetUrl);
    expect(transientManager.create('graphql', withPresets, metaDetails).request.url).toBe(presetUrl);
    expect(transientManager.create('grpc', withPresets, metaDetails).request.url).toBe(presetUrl);
    expect(transientManager.create('ws', withPresets, metaDetails).request.url).toBe(presetUrl);
  });

  test('unsaved preset edits on the draft win over the saved config', () => {
    const item = transientManager.create('http', withDraftPresets, metaDetails);
    expect(item.request.url).toBe(draftPresetUrl);
  });

  test('collections without presets still produce an empty url', () => {
    expect(transientManager.create('http', bruCollection, metaDetails).request.url).toBe('');
  });

  test('the requestType preset does not override the type picked from the menu', () => {
    const graphqlPreset: CollectionInfo = {
      uid: 'col-7',
      pathname: '/Users/test/graphql-preset',
      brunoConfig: { presets: { requestType: 'graphql' } }
    };
    expect(transientManager.create('http', graphqlPreset, metaDetails).type).toBe('http-request');
  });
});

describe('create from a curl command', () => {
  test('merges the parsed request and settings over the base of the picked type', () => {
    const item = transientManager.create('http', bruCollection, {
      uid: 'u1',
      name: 'Untitled 9',
      request: {
        url: 'https://example.com/users',
        method: 'POST',
        headers: [{ uid: 'h1', name: 'X-Trace', value: 'abc', enabled: true }],
        body: { mode: 'json', json: '{"name":"bruno"}' }
      },
      settings: { encodeUrl: false }
    });

    expect(item.uid).toBe('u1');
    expect(item.name).toBe('Untitled 9');
    expect(item.type).toBe('http-request');
    expect(item.request).toMatchObject({ url: 'https://example.com/users', method: 'POST', vars: { req: [], res: [] } });
    expect(item.request.headers).toHaveLength(1);
    // The body replaces the base one whole; the base's empty form modes do not leak in.
    expect(item.request.body).toEqual({ mode: 'json', json: '{"name":"bruno"}' });
    expect(item.settings).toEqual({ encodeUrl: false });
  });
});
