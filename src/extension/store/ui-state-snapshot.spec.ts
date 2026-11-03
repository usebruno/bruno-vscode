import { describe, test, expect, beforeEach } from 'vitest';
import UiStateSnapshotStore, { setExtensionContext, normalizeSnapshotPath } from './ui-state-snapshot';

const createContext = () => {
  const storage = new Map<string, unknown>();
  return {
    storage,
    globalState: {
      get: (key: string, defaultValue: unknown) => (storage.has(key) ? storage.get(key) : defaultValue),
      update: (key: string, value: unknown) => {
        storage.set(key, value);
        return Promise.resolve();
      }
    }
  };
};

describe('ui-state-snapshot store', () => {
  let context: ReturnType<typeof createContext>;

  beforeEach(() => {
    context = createContext();
    setExtensionContext(context as never);
  });

  test('normalizeSnapshotPath unifies separators, trailing slashes and drive letter case', () => {
    expect(normalizeSnapshotPath('C:\\Users\\me\\coll\\')).toBe('c:/Users/me/coll');
    expect(normalizeSnapshotPath('c:/Users/me/coll')).toBe('c:/Users/me/coll');
    expect(normalizeSnapshotPath('/home/me/coll/')).toBe('/home/me/coll');
  });

  test('environment selected under one path form is found under any other', () => {
    const store = new UiStateSnapshotStore();
    store.update({ type: 'COLLECTION_ENVIRONMENT', data: { collectionPath: 'C:/Users/me/coll', environmentName: 'dev' } });

    expect(store.findByPathname('c:\\Users\\me\\coll')?.selectedEnvironment).toBe('dev');
    expect(store.findByPathname('C:\\Users\\me\\coll')?.selectedEnvironment).toBe('dev');
  });

  test('legacy duplicate entries collapse with the most recent write winning', () => {
    context.storage.set('ui-state-snapshot.collections', [
      { pathname: 'c:/Users/me/coll', selectedEnvironment: 'stale' },
      { pathname: 'C:\\Users\\me\\coll', selectedEnvironment: 'fresh' }
    ]);
    const store = new UiStateSnapshotStore();

    expect(store.getCollections()).toEqual([{ pathname: 'c:/Users/me/coll', selectedEnvironment: 'fresh' }]);
    expect(store.findByPathname('c:\\Users\\me\\coll')?.selectedEnvironment).toBe('fresh');
  });

  test('updating an environment replaces the existing entry instead of adding a duplicate', () => {
    const store = new UiStateSnapshotStore();
    store.update({ type: 'COLLECTION_ENVIRONMENT', data: { collectionPath: 'c:\\Users\\me\\coll', environmentName: 'dev' } });
    store.update({ type: 'COLLECTION_ENVIRONMENT', data: { collectionPath: 'C:/Users/me/coll', environmentName: 'prod' } });

    expect(store.getCollections()).toEqual([{ pathname: 'c:/Users/me/coll', selectedEnvironment: 'prod' }]);
  });
});
