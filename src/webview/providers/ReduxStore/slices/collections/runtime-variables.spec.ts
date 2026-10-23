import { describe, test, expect, vi } from 'vitest';

// Mock vscode
vi.mock('vscode', () => ({}));

const { default: collectionsReducer, runtimeVariablesUpdateEvent } = await import('./index');

function makeState(runtimeVariables: Record<string, unknown> = {}) {
  return {
    collections: [
      {
        uid: 'col-1',
        name: 'Test',
        pathname: '/test',
        items: [],
        environments: [],
        brunoConfig: {},
        runtimeVariables
      }
    ],
    collectionSortOrder: 'default',
    activeConnections: {}
  } as any;
}

describe('runtimeVariablesUpdateEvent', () => {
  test('overwrites the stored map so extension-side deletions propagate', () => {
    const state = makeState({ oldKey: 'stale' });

    const result = collectionsReducer(
      state,
      runtimeVariablesUpdateEvent({
        collectionUid: 'col-1',
        runtimeVariables: { newKey: 'fresh' }
      } as any)
    );

    expect(result.collections[0].runtimeVariables).toEqual({ newKey: 'fresh' });
  });

  test('coerces missing payload to empty object', () => {
    const state = makeState({ a: '1' });
    const result = collectionsReducer(
      state,
      runtimeVariablesUpdateEvent({ collectionUid: 'col-1', runtimeVariables: null } as any)
    );
    expect(result.collections[0].runtimeVariables).toEqual({});
  });

  test('ignores updates for unknown collections', () => {
    const state = makeState({ a: '1' });
    const result = collectionsReducer(
      state,
      runtimeVariablesUpdateEvent({
        collectionUid: 'does-not-exist',
        runtimeVariables: { x: '9' }
      } as any)
    );
    expect(result.collections[0].runtimeVariables).toEqual({ a: '1' });
  });
});
