import { describe, test, expect, vi } from 'vitest';

vi.mock('vscode', () => ({}));

const {
  default: collectionsReducer,
  responseReceived,
  clearRequestTimeline,
  clearTimeline,
  collectionAddOauth2CredentialsByUrl,
  runGrpcRequestEvent,
  grpcResponseReceived,
  runWsRequestEvent
} = await import('./index');

function makeState(items: any[], timeline?: any[]): any {
  return {
    collections: [{
      uid: 'col-1',
      name: 'Test',
      pathname: '/test',
      items,
      environments: [],
      brunoConfig: {},
      ...(timeline ? { timeline } : {})
    }],
    collectionSortOrder: 'default',
    activeConnections: {}
  };
}

const makeItem = (uid: string) => ({
  uid,
  name: uid,
  type: 'http-request',
  request: { url: 'http://example.com', method: 'GET' }
});

const response = { status: 200, statusText: 'OK', headers: {}, data: { ok: true }, duration: 12, size: 9 };

describe('responseReceived', () => {
  test('appends a request entry to the collection timeline', () => {
    const state = makeState([makeItem('req-1')]);
    const requestSent = { url: 'http://example.com', method: 'GET', headers: {}, timestamp: 1000 };

    const result = collectionsReducer(state, responseReceived({
      collectionUid: 'col-1',
      itemUid: 'req-1',
      response,
      requestSent
    }));

    const timeline = result.collections[0].timeline;
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      type: 'request',
      collectionUid: 'col-1',
      itemUid: 'req-1',
      timestamp: 1000,
      data: { request: requestSent, response, timestamp: 1000 }
    });
    expect(result.collections[0].items[0].requestSent).toEqual(requestSent);
  });

  test('falls back to the item request when no requestSent is supplied', () => {
    const state = makeState([makeItem('req-1')]);

    const result = collectionsReducer(state, responseReceived({
      collectionUid: 'col-1',
      itemUid: 'req-1',
      response
    }));

    expect(result.collections[0].timeline[0].data.request).toEqual({
      url: 'http://example.com',
      method: 'GET'
    });
  });

  test('accumulates entries across repeated sends', () => {
    let state: any = makeState([makeItem('req-1')]);

    state = collectionsReducer(state, responseReceived({ collectionUid: 'col-1', itemUid: 'req-1', response }));
    state = collectionsReducer(state, responseReceived({ collectionUid: 'col-1', itemUid: 'req-1', response }));

    expect(state.collections[0].timeline).toHaveLength(2);
  });

  test('does not add an entry for a cancelled request', () => {
    const state = makeState([makeItem('req-1')]);

    const result = collectionsReducer(state, responseReceived({
      collectionUid: 'col-1',
      itemUid: 'req-1',
      response: null
    }));

    expect(result.collections[0].timeline ?? []).toHaveLength(0);
    expect(result.collections[0].items[0].response).toBeNull();
  });
});

describe('clearRequestTimeline', () => {
  test('removes only the entries belonging to the given item', () => {
    const state = makeState(
      [makeItem('req-1'), makeItem('req-2')],
      [
        { type: 'request', itemUid: 'req-1', timestamp: 1, data: {} },
        { type: 'request', itemUid: 'req-2', timestamp: 2, data: {} },
        { type: 'oauth2', itemUid: 'req-1', timestamp: 3, data: {} }
      ]
    );

    const result = collectionsReducer(state, clearRequestTimeline({
      collectionUid: 'col-1',
      itemUid: 'req-1'
    }));

    expect(result.collections[0].timeline).toHaveLength(1);
    expect(result.collections[0].timeline[0].itemUid).toBe('req-2');
  });
});

describe('clearTimeline', () => {
  test('empties the whole collection timeline', () => {
    const state = makeState([makeItem('req-1')], [{ type: 'request', itemUid: 'req-1', timestamp: 1, data: {} }]);

    const result = collectionsReducer(state, clearTimeline({ collectionUid: 'col-1' }));

    expect(result.collections[0].timeline).toEqual([]);
  });
});

describe('streaming timelines', () => {
  const makeStreamingItem = (uid: string, type: string) => ({
    uid,
    name: uid,
    type,
    request: { url: 'grpc://localhost:50051', method: 'SayHello', methodType: 'server-streaming' }
  });

  test('gRPC records one entry per protocol event, tagged with the event type', () => {
    let state: any = makeState([makeStreamingItem('grpc-1', 'grpc-request')]);
    const payload = { collectionUid: 'col-1', itemUid: 'grpc-1' };

    state = collectionsReducer(state, runGrpcRequestEvent({
      ...payload,
      eventType: 'request',
      eventData: { url: 'grpc://localhost:50051', method: 'SayHello' }
    }));
    state = collectionsReducer(state, grpcResponseReceived({
      ...payload,
      eventType: 'metadata',
      eventData: { metadata: [{ name: 'x-trace', value: 'abc' }] }
    }));
    state = collectionsReducer(state, grpcResponseReceived({
      ...payload,
      eventType: 'response',
      eventData: { res: { greeting: 'hello' } }
    }));
    state = collectionsReducer(state, grpcResponseReceived({
      ...payload,
      eventType: 'status',
      eventData: { status: { code: 0 } }
    }));

    const timeline = state.collections[0].timeline;
    expect(timeline.map((e: any) => e.eventType)).toEqual(['request', 'metadata', 'response', 'status']);
    expect(timeline.every((e: any) => e.type === 'request' && e.itemUid === 'grpc-1')).toBe(true);
    expect(timeline[1].data.eventData).toEqual({ metadata: [{ name: 'x-trace', value: 'abc' }] });
  });

  test('each gRPC stream message adds its own entry rather than replacing the previous one', () => {
    let state: any = makeState([makeStreamingItem('grpc-1', 'grpc-request')]);

    for (const greeting of ['one', 'two', 'three']) {
      state = collectionsReducer(state, grpcResponseReceived({
        collectionUid: 'col-1',
        itemUid: 'grpc-1',
        eventType: 'response',
        eventData: { res: { greeting } }
      }));
    }

    expect(state.collections[0].timeline).toHaveLength(3);
    expect(state.collections[0].items[0].response.responses).toHaveLength(3);
  });

  test('WebSocket records the outbound connect event', () => {
    const state = makeState([makeStreamingItem('ws-1', 'ws-request')]);

    const result = collectionsReducer(state, runWsRequestEvent({
      collectionUid: 'col-1',
      itemUid: 'ws-1',
      eventType: 'request',
      eventData: { url: 'ws://localhost:8080' }
    }));

    expect(result.collections[0].timeline).toHaveLength(1);
    expect(result.collections[0].timeline[0]).toMatchObject({ type: 'request', eventType: 'request', itemUid: 'ws-1' });
  });

  test('clearing a streaming request drops all of its event entries', () => {
    let state: any = makeState([makeStreamingItem('grpc-1', 'grpc-request'), makeStreamingItem('grpc-2', 'grpc-request')]);

    state = collectionsReducer(state, runGrpcRequestEvent({
      collectionUid: 'col-1', itemUid: 'grpc-1', eventType: 'request', eventData: {}
    }));
    state = collectionsReducer(state, grpcResponseReceived({
      collectionUid: 'col-1', itemUid: 'grpc-1', eventType: 'status', eventData: { status: { code: 0 } }
    }));
    state = collectionsReducer(state, runGrpcRequestEvent({
      collectionUid: 'col-1', itemUid: 'grpc-2', eventType: 'request', eventData: {}
    }));

    const result = collectionsReducer(state, clearRequestTimeline({ collectionUid: 'col-1', itemUid: 'grpc-1' }));

    expect(result.collections[0].timeline).toHaveLength(1);
    expect(result.collections[0].timeline[0].itemUid).toBe('grpc-2');
  });
});

describe('collectionAddOauth2CredentialsByUrl', () => {
  test('adds an oauth2 entry when debug info is present', () => {
    const state = makeState([makeItem('req-1')]);
    const debugInfo = { data: [{ request: { url: 'http://token' }, response: { status: 200 } }] };

    const result = collectionsReducer(state, collectionAddOauth2CredentialsByUrl({
      collectionUid: 'col-1',
      itemUid: 'req-1',
      folderUid: null,
      url: 'http://token',
      credentialsId: 'default',
      credentials: { access_token: 'abc' },
      debugInfo
    }));

    expect(result.collections[0].timeline).toHaveLength(1);
    expect(result.collections[0].timeline[0]).toMatchObject({
      type: 'oauth2',
      itemUid: 'req-1',
      data: { debugInfo: debugInfo.data }
    });
  });

  test('adds no entry when there is no debug info', () => {
    const state = makeState([makeItem('req-1')]);

    const result = collectionsReducer(state, collectionAddOauth2CredentialsByUrl({
      collectionUid: 'col-1',
      itemUid: 'req-1',
      folderUid: null,
      url: 'http://token',
      credentialsId: 'default',
      credentials: { access_token: 'abc' }
    }));

    expect(result.collections[0].timeline ?? []).toHaveLength(0);
    expect(result.collections[0].oauth2Credentials).toHaveLength(1);
  });
});
