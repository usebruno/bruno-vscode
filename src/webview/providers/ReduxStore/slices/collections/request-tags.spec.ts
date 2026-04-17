import { describe, test, expect, vi } from 'vitest';

// Mock vscode
vi.mock('vscode', () => ({}));

// Import the slice after mocking
const { default: collectionsReducer, addRequestTag, deleteRequestTag } = await import('./index');

// Helper to create a minimal collection state matching CollectionsState
function makeState(item: any): any {
  return {
    collections: [{
      uid: 'col-1',
      name: 'Test',
      pathname: '/test',
      items: [item],
      environments: [],
      brunoConfig: {}
    }],
    collectionSortOrder: 'default',
    activeConnections: {}
  };
}

describe('addRequestTag', () => {
  test('adds tag to item.tags', () => {
    const item = { uid: 'req-1', name: 'Test', type: 'http-request', tags: [], request: { url: '' } };
    const state = makeState(item);

    const result = collectionsReducer(state, addRequestTag({
      collectionUid: 'col-1',
      itemUid: 'req-1',
      tag: 'smoke'
    }));

    const updatedItem = result.collections[0].items[0];
    expect(updatedItem.tags).toContain('smoke');
  });

  test('adds tag to item.draft.tags when draft exists', () => {
    const item = {
      uid: 'req-1',
      name: 'Test',
      type: 'http-request',
      tags: ['existing'],
      request: { url: '' },
      draft: {
        uid: 'req-1',
        name: 'Test',
        type: 'http-request',
        tags: ['existing'],
        request: { url: 'http://edited.com' }
      }
    };
    const state = makeState(item);

    const result = collectionsReducer(state, addRequestTag({
      collectionUid: 'col-1',
      itemUid: 'req-1',
      tag: 'regression'
    }));

    const updatedItem = result.collections[0].items[0];
    expect(updatedItem.tags).toContain('regression');
    expect(updatedItem.draft.tags).toContain('regression');
  });

  test('initializes draft.tags if draft exists but tags is undefined', () => {
    const item = {
      uid: 'req-1',
      name: 'Test',
      type: 'http-request',
      tags: [],
      request: { url: '' },
      draft: {
        uid: 'req-1',
        name: 'Test',
        type: 'http-request',
        request: { url: 'http://edited.com' }
        // no tags field
      }
    };
    const state = makeState(item);

    const result = collectionsReducer(state, addRequestTag({
      collectionUid: 'col-1',
      itemUid: 'req-1',
      tag: 'api'
    }));

    const updatedItem = result.collections[0].items[0];
    expect(updatedItem.tags).toContain('api');
    expect(updatedItem.draft.tags).toContain('api');
  });

  test('does not add duplicate tags', () => {
    const item = {
      uid: 'req-1',
      name: 'Test',
      type: 'http-request',
      tags: ['smoke'],
      request: { url: '' },
      draft: { uid: 'req-1', tags: ['smoke'], request: { url: '' } }
    };
    const state = makeState(item);

    const result = collectionsReducer(state, addRequestTag({
      collectionUid: 'col-1',
      itemUid: 'req-1',
      tag: 'smoke'
    }));

    const updatedItem = result.collections[0].items[0];
    expect(updatedItem.tags).toEqual(['smoke']);
    expect(updatedItem.draft.tags).toEqual(['smoke']);
  });
});

describe('deleteRequestTag', () => {
  test('removes tag from item.tags', () => {
    const item = { uid: 'req-1', name: 'Test', type: 'http-request', tags: ['smoke', 'api'], request: { url: '' } };
    const state = makeState(item);

    const result = collectionsReducer(state, deleteRequestTag({
      collectionUid: 'col-1',
      itemUid: 'req-1',
      tag: 'smoke'
    }));

    const updatedItem = result.collections[0].items[0];
    expect(updatedItem.tags).toEqual(['api']);
  });

  test('removes tag from both item.tags and item.draft.tags', () => {
    const item = {
      uid: 'req-1',
      name: 'Test',
      type: 'http-request',
      tags: ['smoke', 'api'],
      request: { url: '' },
      draft: { uid: 'req-1', tags: ['smoke', 'api'], request: { url: 'http://edited.com' } }
    };
    const state = makeState(item);

    const result = collectionsReducer(state, deleteRequestTag({
      collectionUid: 'col-1',
      itemUid: 'req-1',
      tag: 'smoke'
    }));

    const updatedItem = result.collections[0].items[0];
    expect(updatedItem.tags).toEqual(['api']);
    expect(updatedItem.draft.tags).toEqual(['api']);
  });
});
