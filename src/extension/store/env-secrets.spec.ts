import { describe, test, expect, beforeEach, vi } from 'vitest';

// Mock the encryption module to return predictable values
vi.mock('../utils/encryption', () => ({
  encryptStringSafe: (str: string) => ({
    success: true,
    value: str ? `encrypted:${str}` : ''
  }),
  decryptStringSafe: (str: string) => {
    if (str.startsWith('encrypted:')) {
      return { success: true, value: str.replace('encrypted:', '') };
    }
    return { success: false, value: '' };
  }
}));

import { EnvironmentSecretsStore, setExtensionContext } from './env-secrets';

/**
 * Creates a mock VS Code ExtensionContext with an in-memory globalState.
 */
function createMockContext() {
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
}

describe('EnvironmentSecretsStore', () => {
  let secretsStore: EnvironmentSecretsStore;

  beforeEach(() => {
    secretsStore = new EnvironmentSecretsStore();
    setExtensionContext(createMockContext());
  });

  test('stores and retrieves secret environment variables', () => {
    const collectionPath = '/Users/test/my-collection';
    const environment = {
      name: 'Development',
      variables: [
        { name: 'API_KEY', value: 'secret-key-123', secret: true },
        { name: 'BASE_URL', value: 'https://api.example.com', secret: false }
      ]
    };

    secretsStore.storeEnvSecrets(collectionPath, environment);
    const secrets = secretsStore.getEnvSecrets(collectionPath, { name: 'Development' });

    expect(secrets).toHaveLength(1);
    expect(secrets[0].name).toBe('API_KEY');
    expect(secrets[0].value).toBe('encrypted:secret-key-123');
  });

  test('serializes typed (non-string) secret values to a string before encryption', () => {
    // Regression guard: encryptStringSafe throws on a non-string, so a native number/object secret
    // must be stringified first (mirrored on read by parseValueByDataType) or it is lost as ''.
    secretsStore.storeEnvSecrets('/col', {
      name: 'Typed',
      variables: [
        { name: 'TIMEOUT', value: 30, secret: true, dataType: 'number' },
        { name: 'FLAG', value: true, secret: true, dataType: 'boolean' },
        { name: 'CONFIG', value: { host: 'localhost' }, secret: true, dataType: 'object' }
      ]
    });

    const secrets = secretsStore.getEnvSecrets('/col', { name: 'Typed' });
    const byName = (n: string) => secrets.find((s: { name: string; value: string }) => s.name === n);
    expect(byName('TIMEOUT')?.value).toBe('encrypted:30');
    expect(byName('FLAG')?.value).toBe('encrypted:true');
    expect(byName('CONFIG')?.value).toBe('encrypted:{"host":"localhost"}');
  });

  test('only stores variables marked as secret', () => {
    secretsStore.storeEnvSecrets('/col', {
      name: 'env',
      variables: [
        { name: 'PUBLIC', value: 'visible', secret: false },
        { name: 'PRIVATE', value: 'hidden', secret: true },
        { name: 'ALSO_PUBLIC', value: 'shown' }
      ]
    });

    const secrets = secretsStore.getEnvSecrets('/col', { name: 'env' });
    expect(secrets).toHaveLength(1);
    expect(secrets[0].name).toBe('PRIVATE');
  });

  // Test path normalization — path.resolve() on macOS normalizes these:
  // - trailing slashes
  // - double slashes
  // - relative segments (..)
  // This validates the fix even on macOS; on Windows path.resolve also normalizes / vs \

  test('retrieves secrets when stored path has trailing slash', () => {
    const storedPath = '/Users/test/my-collection/';
    const lookupPath = '/Users/test/my-collection';

    secretsStore.storeEnvSecrets(storedPath, {
      name: 'Dev',
      variables: [{ name: 'KEY', value: 'val', secret: true }]
    });

    const secrets = secretsStore.getEnvSecrets(lookupPath, { name: 'Dev' });
    expect(secrets).toHaveLength(1);
    expect(secrets[0].name).toBe('KEY');
  });

  test('retrieves secrets when paths differ by relative segments', () => {
    const storedPath = '/Users/test/../test/my-collection';
    const lookupPath = '/Users/test/my-collection';

    secretsStore.storeEnvSecrets(storedPath, {
      name: 'Staging',
      variables: [{ name: 'TOKEN', value: 'tok', secret: true }]
    });

    const secrets = secretsStore.getEnvSecrets(lookupPath, { name: 'Staging' });
    expect(secrets).toHaveLength(1);
    expect(secrets[0].name).toBe('TOKEN');
  });

  test('retrieves secrets when lookup path has double slashes', () => {
    const storedPath = '/Users/test/my-collection';
    const lookupPath = '/Users/test//my-collection';

    secretsStore.storeEnvSecrets(storedPath, {
      name: 'QA',
      variables: [{ name: 'SECRET', value: 's', secret: true }]
    });

    const secrets = secretsStore.getEnvSecrets(lookupPath, { name: 'QA' });
    expect(secrets).toHaveLength(1);
  });

  test('does not create duplicate entries for equivalent paths', () => {
    const path1 = '/Users/test/my-collection/';
    const path2 = '/Users/test/my-collection';

    secretsStore.storeEnvSecrets(path1, {
      name: 'Dev',
      variables: [{ name: 'A', value: 'first', secret: true }]
    });

    secretsStore.storeEnvSecrets(path2, {
      name: 'Dev',
      variables: [{ name: 'A', value: 'updated', secret: true }]
    });

    const secrets = secretsStore.getEnvSecrets(path2, { name: 'Dev' });
    expect(secrets).toHaveLength(1);
    expect(secrets[0].value).toBe('encrypted:updated');
  });

  test('rename works across equivalent paths', () => {
    const storedPath = '/Users/test/collection/';
    const renamePath = '/Users/test/collection';

    secretsStore.storeEnvSecrets(storedPath, {
      name: 'OldName',
      variables: [{ name: 'SECRET', value: 'val', secret: true }]
    });

    secretsStore.renameEnvironment(renamePath, 'OldName', 'NewName');

    const secrets = secretsStore.getEnvSecrets(renamePath, { name: 'NewName' });
    expect(secrets).toHaveLength(1);

    const oldSecrets = secretsStore.getEnvSecrets(storedPath, { name: 'OldName' });
    expect(oldSecrets).toHaveLength(0);
  });

  test('delete works across equivalent paths', () => {
    const storedPath = '/Users/test/collection';
    const deletePath = '/Users/test/../test/collection';

    secretsStore.storeEnvSecrets(storedPath, {
      name: 'ToDelete',
      variables: [{ name: 'KEY', value: 'val', secret: true }]
    });

    secretsStore.deleteEnvironment(deletePath, 'ToDelete');

    const secrets = secretsStore.getEnvSecrets(storedPath, { name: 'ToDelete' });
    expect(secrets).toHaveLength(0);
  });

  test('returns empty when collection not found', () => {
    const secrets = secretsStore.getEnvSecrets('/nonexistent', { name: 'Dev' });
    expect(secrets).toHaveLength(0);
  });

  test('returns empty when environment not found', () => {
    secretsStore.storeEnvSecrets('/col', {
      name: 'Dev',
      variables: [{ name: 'KEY', value: 'val', secret: true }]
    });

    const secrets = secretsStore.getEnvSecrets('/col', { name: 'Nonexistent' });
    expect(secrets).toHaveLength(0);
  });
});
