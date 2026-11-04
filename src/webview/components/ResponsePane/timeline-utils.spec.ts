import { describe, test, expect, vi } from 'vitest';

vi.mock('vscode', () => ({}));

const { getTimelineEntries } = await import('./timeline-utils');

const inheritingItem = (uid: string) => ({
  uid,
  name: uid,
  type: 'http-request',
  request: { url: 'http://example.com', method: 'GET', auth: { mode: 'inherit' } }
});

const tokenCall = (url: string) => ({
  request: { url, method: 'POST' },
  response: { status: 200, statusText: 'OK' }
});

const makeCollection = (items: any[], timeline: any[]): any => ({
  uid: 'col-1',
  name: 'Test',
  pathname: '/test',
  items,
  timeline,
  root: { request: { auth: { mode: 'oauth2' } } }
});

describe('getTimelineEntries', () => {
  test('returns only entries for the given item, newest first', () => {
    const collection = makeCollection(
      [inheritingItem('req-1'), inheritingItem('req-2')],
      [
        { type: 'request', itemUid: 'req-1', folderUid: null, timestamp: 1, data: {} },
        { type: 'request', itemUid: 'req-2', folderUid: null, timestamp: 2, data: {} },
        { type: 'request', itemUid: 'req-1', folderUid: null, timestamp: 3, data: {} }
      ]
    );

    const result = getTimelineEntries(collection, inheritingItem('req-1') as any);

    expect(result.map((e) => e.timestamp)).toEqual([3, 1]);
  });

  test('includes a collection-level oauth2 entry recorded against a sibling request', () => {
    const collection = makeCollection(
      [inheritingItem('req-1'), inheritingItem('req-2')],
      [{ type: 'oauth2', itemUid: 'req-1', folderUid: null, timestamp: 1, data: { debugInfo: [tokenCall('/token')] } }]
    );

    const result = getTimelineEntries(collection, inheritingItem('req-2') as any);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('oauth2');
  });

  test('excludes an oauth2 entry when the item does not inherit auth', () => {
    const ownAuthItem = {
      uid: 'req-2',
      name: 'req-2',
      type: 'http-request',
      request: { url: 'http://example.com', method: 'GET', auth: { mode: 'basic' } }
    };
    const collection = makeCollection(
      [inheritingItem('req-1'), ownAuthItem],
      [{ type: 'oauth2', itemUid: 'req-1', folderUid: null, timestamp: 1, data: { debugInfo: [tokenCall('/token')] } }]
    );

    const result = getTimelineEntries(collection, ownAuthItem as any);

    expect(result).toHaveLength(0);
  });

  test('expands an oauth2 entry into one row per token call, ordered before the request it authorized', () => {
    const collection = makeCollection(
      [inheritingItem('req-1')],
      [
        {
          type: 'oauth2',
          itemUid: 'req-1',
          folderUid: null,
          timestamp: 1,
          data: { debugInfo: [tokenCall('/authorize'), tokenCall('/token')] }
        },
        { type: 'request', itemUid: 'req-1', folderUid: null, timestamp: 10, data: {} }
      ]
    );

    const result = getTimelineEntries(collection, inheritingItem('req-1') as any);

    expect(result.map((e) => e.type)).toEqual(['request', 'oauth2', 'oauth2']);
    expect(result.map((e) => (e as any)._oauth2Child?.request?.url)).toEqual([undefined, '/token', '/authorize']);
  });

  test('orders two token fetches that share a request anchor newest first', () => {
    const collection = makeCollection(
      [inheritingItem('req-1')],
      [
        { type: 'oauth2', itemUid: 'req-1', folderUid: null, timestamp: 1, data: { debugInfo: [tokenCall('/refresh')] } },
        { type: 'oauth2', itemUid: 'req-1', folderUid: null, timestamp: 2, data: { debugInfo: [tokenCall('/token')] } },
        { type: 'request', itemUid: 'req-1', folderUid: null, timestamp: 10, data: {} }
      ]
    );

    const result = getTimelineEntries(collection, inheritingItem('req-1') as any);

    expect(result.map((e) => (e as any)._oauth2Child?.request?.url)).toEqual([undefined, '/token', '/refresh']);
  });

  test('drops an oauth2 entry that recorded no token calls', () => {
    const collection = makeCollection(
      [inheritingItem('req-1')],
      [{ type: 'oauth2', itemUid: 'req-1', folderUid: null, timestamp: 1, data: { debugInfo: [] } }]
    );

    expect(getTimelineEntries(collection, inheritingItem('req-1') as any)).toHaveLength(0);
  });

  test('returns an empty array when the collection has no timeline', () => {
    expect(getTimelineEntries(undefined, inheritingItem('req-1') as any)).toEqual([]);
    expect(getTimelineEntries({ uid: 'col-1' } as any, inheritingItem('req-1') as any)).toEqual([]);
  });
});
