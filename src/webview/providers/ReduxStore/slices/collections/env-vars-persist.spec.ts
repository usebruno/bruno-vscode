import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({}));

const { mergeAndPersistEnvironment } = await import('./actions');
const { uuid } = await import('../../../../utils/common/index');

const invoke = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  invoke.mockClear();
  (globalThis as any).window = { ipcRenderer: { invoke } };
});

const envVar = (name: string, value: unknown, extra: Record<string, unknown> = {}) => ({
  uid: uuid(),
  name,
  value,
  type: 'text',
  enabled: true,
  secret: false,
  ...extra
});

// environmentSchema validates the uid length, so use real uids.
const COLLECTION_UID = uuid();
const ENVIRONMENT_UID = uuid();

function makeState(variables: any[]): any {
  return {
    collections: {
      collections: [{
        uid: COLLECTION_UID,
        name: 'My Collection',
        pathname: '/collections/my-collection',
        items: [],
        activeEnvironmentUid: ENVIRONMENT_UID,
        environments: [{ uid: ENVIRONMENT_UID, name: 'Local', variables }],
        brunoConfig: {}
      }]
    }
  };
}

async function persist(variables: any[], persistentEnvVariables: Record<string, unknown>) {
  const getState = () => makeState(variables);
  await mergeAndPersistEnvironment({ persistentEnvVariables, collectionUid: COLLECTION_UID } as any)(vi.fn(), getState);

  const call = invoke.mock.calls.find(([channel]) => channel === 'renderer:save-environment');
  expect(call, 'expected the environment to be saved').toBeDefined();
  return call![2].variables as any[];
}

describe('script-written env vars are persisted without the __name__ metadata key', () => {
  test('a script that sets a var does not materialize __name__', async () => {
    const saved = await persist(
      [envVar('seed', 'SEED')],
      { seed: 'SEED', envTok: 'ENVVAL', __name__: 'Local' }
    );

    expect(saved.map((v) => v.name).sort()).toEqual(['envTok', 'seed']);
    expect(saved.find((v) => v.name === 'envTok')?.value).toBe('ENVVAL');
  });

  test('a script that deletes every env var leaves the file empty, not holding __name__', async () => {
    const saved = await persist([], { __name__: 'Local' });
    expect(saved).toEqual([]);
  });

  test('deletions still reach disk while other vars are written', async () => {
    const saved = await persist([], { envTok: 'ENVVAL', __name__: 'Local' });
    expect(saved.map((v) => v.name)).toEqual(['envTok']);
  });

  test('data types of script-written values still round-trip', async () => {
    const saved = await persist([], { timeout: 30, flag: true, __name__: 'Local' });

    expect(saved.find((v) => v.name === 'timeout')).toMatchObject({ value: 30, dataType: 'number' });
    expect(saved.find((v) => v.name === 'flag')).toMatchObject({ value: true, dataType: 'boolean' });
    expect(saved.find((v) => v.name === '__name__')).toBeUndefined();
  });
});
