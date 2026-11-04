import { describe, test, expect, beforeEach, vi } from 'vitest';

vi.mock('../utils/encryption', () => ({
  encryptStringSafe: (str: string) => ({ success: true, value: str ? `encrypted:${str}` : '' }),
  decryptStringSafe: (str: string) => (str?.startsWith('encrypted:')
    ? { success: true, value: str.replace('encrypted:', '') }
    : { success: false, value: '' })
}));

import { GlobalEnvironmentsStore, setExtensionContext } from './global-environments';

const createMockContext = () => {
  const store = new Map<string, unknown>();
  return {
    globalState: {
      get<T>(key: string, defaultValue?: T): T {
        return (store.get(key) as T) ?? (defaultValue as T);
      },
      update(key: string, value: unknown) {
        store.set(key, value);
        return Promise.resolve();
      }
    }
  } as any;
};

const uid = (prefix: string) => prefix.padEnd(21, 'a');

describe('GlobalEnvironmentsStore data types', () => {
  let globalEnvironmentsStore: GlobalEnvironmentsStore;

  beforeEach(() => {
    globalEnvironmentsStore = new GlobalEnvironmentsStore();
    setExtensionContext(createMockContext());
  });

  const save = (variables: any[]) => {
    globalEnvironmentsStore.addGlobalEnvironment({ uid: uid('env'), name: 'Global', variables: [] });
    globalEnvironmentsStore.saveGlobalEnvironment({ environmentUid: uid('env'), variables });
    return globalEnvironmentsStore.getGlobalEnvironments()[0].variables;
  };

  test('coerces typed values on read — global envs never pass through the file layer', () => {
    const variables = save([
      { uid: uid('v1'), name: 'timeout', value: '30', type: 'text', enabled: true, secret: false, dataType: 'number' },
      { uid: uid('v2'), name: 'flag', value: 'true', type: 'text', enabled: true, secret: false, dataType: 'boolean' },
      { uid: uid('v3'), name: 'cfg', value: '{"host":"localhost"}', type: 'text', enabled: true, secret: false, dataType: 'object' },
      { uid: uid('v4'), name: 'token', value: 'abc', type: 'text', enabled: true, secret: false }
    ]);

    const byName = (name: string) => variables.find((v: any) => v.name === name);
    expect(byName('timeout')?.value).toBe(30);
    expect(byName('flag')?.value).toBe(true);
    expect(byName('cfg')?.value).toEqual({ host: 'localhost' });
    expect(byName('token')?.value).toBe('abc');
  });

  test('keeps native values written by a script unchanged', () => {
    const variables = save([
      { uid: uid('v1'), name: 'timeout', value: 30, type: 'text', enabled: true, secret: false, dataType: 'number' }
    ]);

    expect(variables[0].value).toBe(30);
  });

  test('coerces a secret after decrypting it', () => {
    const variables = save([
      { uid: uid('v1'), name: 'port', value: '4000', type: 'text', enabled: true, secret: true, dataType: 'number' }
    ]);

    expect(variables[0].value).toBe(4000);
  });
});
