import { describe, test, expect, vi } from 'vitest';

// Mock vscode
vi.mock('vscode', () => ({}));

// Import the slice after mocking
const { default: collectionsReducer, setRequestVars, setFolderVars, setCollectionVars, scriptEnvironmentUpdateEvent } = await import('./index');

function makeState(item: any): any {
  return {
    collections: [{
      uid: 'col-1',
      name: 'Test',
      pathname: '/test',
      items: [item],
      environments: [],
      brunoConfig: {},
      root: { request: { vars: { req: [], res: [] } } }
    }],
    collectionSortOrder: 'default',
    activeConnections: {}
  };
}

describe('setRequestVars preserves dataType', () => {
  test('carries dataType through both req and res vars on save', () => {
    const item = { uid: 'req-1', name: 'Test', type: 'http-request', request: { url: '', vars: { req: [], res: [] } } };
    const state = makeState(item);

    const result = collectionsReducer(state, setRequestVars({
      collectionUid: 'col-1',
      itemUid: 'req-1',
      vars: {
        req: [{ uid: 'v1', name: 'timeout', value: '30', enabled: true, dataType: 'number' }],
        res: [{ uid: 'v2', name: 'config', value: '{"host":"localhost"}', enabled: true, dataType: 'object' }]
      }
    } as any));

    const vars = result.collections[0].items[0].draft.request.vars;
    expect(vars.req[0].dataType).toBe('number');
    expect(vars.res[0].dataType).toBe('object');
  });

  test('leaves dataType undefined for plain string vars', () => {
    const item = { uid: 'req-1', name: 'Test', type: 'http-request', request: { url: '', vars: { req: [], res: [] } } };
    const state = makeState(item);

    const result = collectionsReducer(state, setRequestVars({
      collectionUid: 'col-1',
      itemUid: 'req-1',
      vars: {
        req: [{ uid: 'v1', name: 'token', value: 'abc', enabled: true }],
        res: []
      }
    } as any));

    expect(result.collections[0].items[0].draft.request.vars.req[0].dataType).toBeUndefined();
  });
});

describe('scriptEnvironmentUpdateEvent applies script-written env vars to the active environment', () => {
  function makeEnvState(variables: any[]): any {
    return {
      collections: [{
        uid: 'col-1',
        name: 'Test',
        pathname: '/test',
        items: [],
        activeEnvironmentUid: 'env-1',
        environments: [{ uid: 'env-1', name: 'Dev', variables }],
        brunoConfig: {}
      }],
      collectionSortOrder: 'default',
      activeConnections: {}
    };
  }

  test('adds a new env var set by a script (bru.setEnvVar) with its data type', () => {
    const state = makeEnvState([]);
    const result = collectionsReducer(state, scriptEnvironmentUpdateEvent({
      collectionUid: 'col-1',
      envVariables: { brunoSite: 'www.usebruno.com', timeout: 30, __name__: 'Dev' },
      runtimeVariables: {}
    } as any));

    const vars = result.collections[0].environments[0].variables;
    expect(vars.find((v: any) => v.name === 'brunoSite')).toMatchObject({ value: 'www.usebruno.com', enabled: true });
    expect(vars.find((v: any) => v.name === 'timeout')).toMatchObject({ value: 30, dataType: 'number' });
    // __name__ is metadata, never materialized as a variable.
    expect(vars.find((v: any) => v.name === '__name__')).toBeUndefined();
  });

  test('updates an existing enabled env var value in place', () => {
    const state = makeEnvState([{ uid: 'v1', name: 'brunoSite', value: 'old', type: 'text', enabled: true, secret: false }]);
    const result = collectionsReducer(state, scriptEnvironmentUpdateEvent({
      collectionUid: 'col-1',
      envVariables: { brunoSite: 'www.usebruno.com', __name__: 'Dev' },
      runtimeVariables: {}
    } as any));

    const vars = result.collections[0].environments[0].variables;
    expect(vars).toHaveLength(1);
    expect(vars[0].value).toBe('www.usebruno.com');
  });

  test('leaves the environment untouched when the script did not write env vars (null)', () => {
    const state = makeEnvState([{ uid: 'v1', name: 'keep', value: 'x', type: 'text', enabled: true, secret: false }]);
    const result = collectionsReducer(state, scriptEnvironmentUpdateEvent({
      collectionUid: 'col-1',
      envVariables: null,
      runtimeVariables: { r: '1' }
    } as any));

    expect(result.collections[0].environments[0].variables).toHaveLength(1);
    expect(result.collections[0].runtimeVariables).toEqual({ r: '1' });
  });
});

describe('setCollectionVars preserves dataType', () => {
  test('carries dataType through collection request vars', () => {
    const item = { uid: 'req-1', name: 'Test', type: 'http-request', request: { url: '' } };
    const state = makeState(item);

    const result = collectionsReducer(state, setCollectionVars({
      collectionUid: 'col-1',
      type: 'request',
      vars: [{ uid: 'v1', name: 'flag', value: 'true', enabled: true, dataType: 'boolean' }]
    } as any));

    expect(result.collections[0].draft.root.request.vars.req[0].dataType).toBe('boolean');
  });
});

describe('setFolderVars preserves dataType', () => {
  test('carries dataType through folder request vars', () => {
    const folder = {
      uid: 'fol-1',
      name: 'Folder',
      type: 'folder',
      root: { request: { vars: { req: [], res: [] } } }
    };
    const state = makeState(folder);

    const result = collectionsReducer(state, setFolderVars({
      collectionUid: 'col-1',
      folderUid: 'fol-1',
      type: 'request',
      vars: [{ uid: 'v1', name: 'retries', value: '3', enabled: true, dataType: 'number' }]
    } as any));

    expect(result.collections[0].items[0].draft.root.request.vars.req[0].dataType).toBe('number');
  });
});
