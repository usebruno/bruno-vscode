import { describe, test, expect, vi } from 'vitest';

vi.mock('vscode', () => ({}));

const { default: collectionsReducer, runRequestEvent, initRunRequestEvent, runFolderEvent } = await import('./index');

const ERROR_CONTEXT = {
  errorType: 'Error',
  filePath: 'Ping.bru',
  errorLine: 2,
  lines: [{ lineNumber: 2, content: 'bru.setEnvVar("Bad Name", "x");', isError: true }],
  stack: '    at Ping.bru:13:5'
};

const makeState = (item: any = { uid: 'req-1', name: 'Ping', type: 'http-request', request: { url: '' } }): any => ({
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
  activeConnections: []
});

const itemOf = (state: any) => state.collections[0].items[0];

describe('script execution events record the failing phase', () => {
  test.each([
    ['pre-request-script-execution', 'preRequest'],
    ['post-response-script-execution', 'postResponse'],
    ['test-script-execution', 'test']
  ])('%s stores the message and context', (type, field) => {
    const result = collectionsReducer(makeState(), runRequestEvent({
      collectionUid: 'col-1',
      itemUid: 'req-1',
      type,
      errorMessage: 'Variable name: "Bad Name" contains invalid characters!',
      errorContext: ERROR_CONTEXT
    } as any));

    const item = itemOf(result);
    expect(item[`${field}ScriptErrorMessage`]).toContain('invalid characters');
    expect(item[`${field}ScriptErrorContext`]).toEqual(ERROR_CONTEXT);
  });

  test('a successful phase clears its previous error', () => {
    const state = makeState({
      uid: 'req-1',
      name: 'Ping',
      type: 'http-request',
      request: { url: '' },
      postResponseScriptErrorMessage: 'boom',
      postResponseScriptErrorContext: ERROR_CONTEXT
    });

    const result = collectionsReducer(state, runRequestEvent({
      collectionUid: 'col-1',
      itemUid: 'req-1',
      type: 'post-response-script-execution',
      errorMessage: null,
      errorContext: null
    } as any));

    expect(itemOf(result).postResponseScriptErrorMessage).toBeNull();
    expect(itemOf(result).postResponseScriptErrorContext).toBeNull();
  });

  test('reporting an error does not put the request back into the sending state', () => {
    const state = makeState({ uid: 'req-1', name: 'Ping', type: 'http-request', request: { url: '' }, requestState: null, testResults: [{ status: 'pass' }] });

    const result = collectionsReducer(state, runRequestEvent({
      collectionUid: 'col-1',
      itemUid: 'req-1',
      type: 'post-response-script-execution',
      errorMessage: 'boom',
      errorContext: ERROR_CONTEXT
    } as any));

    expect(itemOf(result).requestState).toBeNull();
    expect(itemOf(result).testResults).toEqual([{ status: 'pass' }]);
  });

  test('a new run starts with the previous run\'s script errors cleared', () => {
    const state = makeState({
      uid: 'req-1',
      name: 'Ping',
      type: 'http-request',
      request: { url: '' },
      preRequestScriptErrorMessage: 'boom',
      preRequestScriptErrorContext: ERROR_CONTEXT,
      testScriptErrorMessage: 'boom'
    });

    const result = collectionsReducer(state, initRunRequestEvent({
      collectionUid: 'col-1',
      itemUid: 'req-1',
      requestUid: 'run-2'
    } as any));

    const item = itemOf(result);
    expect(item.preRequestScriptErrorMessage).toBeNull();
    expect(item.preRequestScriptErrorContext).toBeNull();
    expect(item.testScriptErrorMessage).toBeNull();
    expect(item.requestState).toBe('queued');
  });
  test('a new run clears the previous run\'s test results', () => {
    const state = makeState({
      uid: 'req-1',
      name: 'Ping',
      type: 'http-request',
      request: { url: '' },
      preRequestTestResults: [{ uid: 'stale', description: 'old', passed: true }],
      testResults: [{ uid: 'stale', description: 'old', passed: true }]
    });

    const item = itemOf(collectionsReducer(state, initRunRequestEvent({
      collectionUid: 'col-1',
      itemUid: 'req-1',
      requestUid: 'run-2'
    } as any)));

    expect(item.preRequestTestResults).toEqual([]);
    expect(item.testResults).toEqual([]);
  });

  test('request-sent keeps test results a pre-request script already reported', () => {
    // The pre-request script reports its results before 'request-sent' arrives, so that event must
    // not clear the buckets or the Tests tab loses them.
    const state = makeState({
      uid: 'req-1',
      name: 'Ping',
      type: 'http-request',
      request: { url: '' },
      preRequestTestResults: [{ uid: 't1', description: 'ran before the throw', passed: true }]
    });

    const item = itemOf(collectionsReducer(state, runRequestEvent({
      collectionUid: 'col-1',
      itemUid: 'req-1',
      requestUid: 'run-1',
      type: 'request-sent',
      requestSent: { url: 'http://localhost' }
    } as any)));

    expect(item.preRequestTestResults).toEqual([
      { uid: 't1', description: 'ran before the throw', passed: true }
    ]);
    expect(item.requestSent).toEqual({ url: 'http://localhost' });
  });
  test('a runner pre-request failure is marked script-sourced, not a request failure', () => {
    // The runner reports a failed pre-request script on the same channel as a request failure, so
    // the marker is what lets the response pane still show the card for it.
    const state = {
      collections: [{
        uid: 'col-1',
        runnerResult: { items: [{ uid: 'req-1', status: 'running' }] },
        items: [{ uid: 'req-1', name: 'Ping', type: 'http-request', request: { url: '' } }]
      }]
    } as any;

    const result = collectionsReducer(state, runFolderEvent({
      collectionUid: 'col-1',
      type: 'error',
      error: 'Pre-request script error: boom',
      errorSource: 'script',
      responseReceived: {},
      itemUid: 'req-1'
    } as any));

    const item = result.collections[0].runnerResult.items[0] as any;
    expect(item.errorSource).toBe('script');
    expect(item.status).toBe('error');
  });
});
