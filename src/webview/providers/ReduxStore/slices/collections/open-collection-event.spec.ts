import { beforeEach, describe, expect, test, vi } from 'vitest';
import { openCollectionEvent } from './actions';

const invoke = vi.fn().mockResolvedValue(null);
const getState = () => ({
  collections: { collections: [] as unknown[] },
  workspaces: { activeWorkspaceUid: null as string | null, workspaces: [] as unknown[] }
});

const open = async (shouldPersist: boolean, sessionOnly: boolean) => {
  const dispatch = vi.fn();
  await openCollectionEvent('uid-1', '/repo/collections/One', { name: 'One' }, shouldPersist, sessionOnly)(dispatch, getState);
  return dispatch;
};

const persistedToLastOpened = () => invoke.mock.calls.some(([channel]) => channel === 'renderer:add-last-opened-collection');

beforeEach(() => {
  invoke.mockClear();
  (globalThis as any).window = { BRUNO_WEBVIEW_MODE: 'sidebar', ipcRenderer: { invoke } };
});

describe('openCollectionEvent in the sidebar', () => {
  test('shows and persists a manually opened collection', async () => {
    const dispatch = await open(true, false);
    expect(dispatch).toHaveBeenCalled();
    expect(persistedToLastOpened()).toBe(true);
  });

  test('skips a collection opened in the background', async () => {
    const dispatch = await open(false, false);
    expect(dispatch).not.toHaveBeenCalled();
    expect(persistedToLastOpened()).toBe(false);
  });

  test('shows a session-only collection without persisting it', async () => {
    const dispatch = await open(false, true);
    expect(dispatch).toHaveBeenCalled();
    expect(persistedToLastOpened()).toBe(false);
  });
});
