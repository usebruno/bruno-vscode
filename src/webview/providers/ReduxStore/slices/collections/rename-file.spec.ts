import { describe, test, expect, vi } from 'vitest';

vi.mock('vscode', () => ({}));

const {
  default: collectionsReducer,
  collectionAddFileEvent,
  collectionUnlinkFileEvent
} = await import('./index');

function makeState(items: any[]): any {
  return {
    collections: [{
      uid: 'col-1',
      name: 'Test',
      pathname: '/test',
      items,
      environments: [],
      brunoConfig: {}
    }],
    collectionSortOrder: 'default',
    activeConnections: {}
  };
}

function addFilePayload(pathname: string, uid: string, name: string): any {
  return {
    meta: { collectionUid: 'col-1', pathname, name: pathname.split('/').pop() },
    data: { uid, name, type: 'http-request', request: { url: '' } },
    partial: true,
    loading: false
  };
}

describe('renaming a request file on disk', () => {
  test('the renamed file is added even while the old item (same display name) is still present', () => {
    // A rename surfaces as addFile(new) + unlink(old); the internal meta.name is
    // unchanged, and VS Code offers no ordering guarantee — so the add must not
    // be deduped against the not-yet-removed old item.
    const oldItem = {
      uid: 'uid-old',
      name: 'My Request',
      type: 'http-request',
      filename: 'old.bru',
      pathname: '/test/old.bru',
      request: { url: '' }
    };

    let state = makeState([oldItem]);

    // addFile for the new path arrives while the old item is still in the tree
    state = collectionsReducer(state, collectionAddFileEvent(
      addFilePayload('/test/new.bru', 'uid-new', 'My Request')
    ));

    let items = state.collections[0].items;
    expect(items.find((i: any) => i.uid === 'uid-new')).toBeDefined();

    // the deferred unlink of the old path then removes the stale item
    state = collectionsReducer(state, collectionUnlinkFileEvent({
      meta: { collectionUid: 'col-1', pathname: '/test/old.bru' }
    } as any));

    items = state.collections[0].items;
    const surviving = items.filter((i: any) => i.type === 'http-request');
    expect(surviving).toHaveLength(1);
    expect(surviving[0].uid).toBe('uid-new');
    expect(surviving[0].pathname).toBe('/test/new.bru');
  });

  test('re-adding the same file updates in place rather than duplicating', () => {
    const item = {
      uid: 'uid-1',
      name: 'My Request',
      type: 'http-request',
      filename: 'req.bru',
      pathname: '/test/req.bru',
      request: { url: '' }
    };

    let state = makeState([item]);

    // Re-add the same path/uid with a new name — an in-place update must replace
    // the existing item rather than append a duplicate.
    state = collectionsReducer(state, collectionAddFileEvent(
      addFilePayload('/test/req.bru', 'uid-1', 'My Request (edited)')
    ));

    const requests = state.collections[0].items.filter((i: any) => i.type === 'http-request');
    expect(requests).toHaveLength(1);
    expect(requests[0].uid).toBe('uid-1');
    expect(requests[0].name).toBe('My Request (edited)');
    expect(requests[0].pathname).toBe('/test/req.bru');
  });
});
