import { describe, test, expect } from 'vitest';
import { hasRequestChanges } from './index';

const itemWithDraft = (extra: Record<string, unknown> = {}) => ({
  uid: 'i1',
  type: 'http-request',
  name: 'Boom',
  request: { method: 'GET', url: 'http://x' },
  draft: { uid: 'i1', type: 'http-request', name: 'Boom', request: { method: 'GET', url: 'http://x' } },
  ...extra
}) as any;

describe('hasRequestChanges', () => {
  test('reports no changes when the draft matches the item', () => {
    expect(hasRequestChanges(itemWithDraft())).toBe(false);
  });

  test('a script error does not mark the request as unsaved', () => {
    const item = itemWithDraft({
      postResponseScriptErrorMessage: 'Variable name: "Bad Name" contains invalid characters!',
      postResponseScriptErrorContext: { errorType: 'Error', filePath: 'Boom.bru', errorLine: 2, lines: [] }
    });

    expect(hasRequestChanges(item)).toBe(false);
  });

  test('still reports a genuine edit', () => {
    const item = itemWithDraft();
    item.draft.request.url = 'http://y';

    expect(hasRequestChanges(item)).toBe(true);
  });
});
