import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import {
  isTokenExpired,
  applyAdditionalParameters,
  generateCodeVerifier,
  generateCodeChallenge,
  placeOAuth2Token,
  getOAuth2TokenUsingClientCredentials,
  getOAuth2TokenUsingPasswordCredentials
} from './oauth2';

/**
 * Creates a mock axios adapter that intercepts HTTP requests.
 *
 * Captures the request config for assertions and returns a controlled response.
 */
const createMockAdapter = (responseData: any = { access_token: 'test-token', expires_in: 3600 }) => {
  let capturedConfig: any = null;

  const adapter = async (config: any) => {
    capturedConfig = config;
    return {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      config,
      data: Buffer.from(JSON.stringify(responseData))
    };
  };

  return { adapter, getCapturedConfig: () => capturedConfig };
};

// ─── Client Credentials Grant ────────────────────────────────────────────────
//
// Tests verify how client credentials (clientId/clientSecret) are transmitted.
// OAuth2 spec (RFC 6749 Section 2.3.1) allows two methods:
//   1. HTTP Basic Authentication header
//   2. Request body parameters

describe('OAuth2 Helper - Client Credentials Grant', () => {
  let originalAdapter: any;

  beforeEach(() => {
    originalAdapter = axios.defaults.adapter;
  });

  afterEach(() => {
    axios.defaults.adapter = originalAdapter;
  });

  describe('when credentialsPlacement is basic_auth_header', () => {
    test('should send token request with Authorization header when clientSecret is undefined', async () => {
      const { adapter, getCapturedConfig } = createMockAdapter();
      axios.defaults.adapter = adapter;

      const result = await getOAuth2TokenUsingClientCredentials({
        request: {
          oauth2: {
            grantType: 'client_credentials',
            accessTokenUrl: 'https://auth.example.com/token',
            clientId: 'my-client-id',
            clientSecret: undefined,
            credentialsPlacement: 'basic_auth_header'
          }
        },
        collectionUid: 'test-collection',
        forceFetch: true
      });

      expect(result.credentials).not.toBeNull();
      expect((result.credentials as any)?.access_token).toBe('test-token');

      const capturedConfig = getCapturedConfig();
      expect(capturedConfig).not.toBeNull();

      // Authorization: Basic base64(clientId:) with empty secret
      const expectedAuth = `Basic ${Buffer.from('my-client-id:').toString('base64')}`;
      expect(capturedConfig.headers['Authorization']).toBe(expectedAuth);

      // grant_type must be in body
      expect(capturedConfig.data).toContain('grant_type=client_credentials');

      // client_id should NOT be duplicated in body when using basic_auth_header
      expect(capturedConfig.data).not.toContain('client_id=');
    });

    test('should send token request with Authorization header when clientSecret is empty string', async () => {
      const { adapter, getCapturedConfig } = createMockAdapter();
      axios.defaults.adapter = adapter;

      const result = await getOAuth2TokenUsingClientCredentials({
        request: {
          oauth2: {
            grantType: 'client_credentials',
            accessTokenUrl: 'https://auth.example.com/token',
            clientId: 'my-client-id',
            clientSecret: '',
            credentialsPlacement: 'basic_auth_header'
          }
        },
        collectionUid: 'test-collection',
        forceFetch: true
      });

      expect(result.credentials).not.toBeNull();

      const capturedConfig = getCapturedConfig();
      // Empty string treated same as undefined
      const expectedAuth = `Basic ${Buffer.from('my-client-id:').toString('base64')}`;
      expect(capturedConfig.headers['Authorization']).toBe(expectedAuth);
    });

    test('should send token request with Authorization header when clientSecret is present', async () => {
      const { adapter, getCapturedConfig } = createMockAdapter();
      axios.defaults.adapter = adapter;

      const result = await getOAuth2TokenUsingClientCredentials({
        request: {
          oauth2: {
            grantType: 'client_credentials',
            accessTokenUrl: 'https://auth.example.com/token',
            clientId: 'my-client-id',
            clientSecret: 'my-secret',
            credentialsPlacement: 'basic_auth_header'
          }
        },
        collectionUid: 'test-collection',
        forceFetch: true
      });

      expect(result.credentials).not.toBeNull();

      const capturedConfig = getCapturedConfig();
      const expectedAuth = `Basic ${Buffer.from('my-client-id:my-secret').toString('base64')}`;
      expect(capturedConfig.headers['Authorization']).toBe(expectedAuth);

      // client_secret should NOT be in body when using basic_auth_header
      expect(capturedConfig.data).not.toContain('client_secret=');
    });
  });

  describe('when credentialsPlacement is body', () => {
    test('should send client_id in body and no Authorization header when clientSecret is empty', async () => {
      const { adapter, getCapturedConfig } = createMockAdapter();
      axios.defaults.adapter = adapter;

      const result = await getOAuth2TokenUsingClientCredentials({
        request: {
          oauth2: {
            grantType: 'client_credentials',
            accessTokenUrl: 'https://auth.example.com/token',
            clientId: 'my-client-id',
            clientSecret: '',
            credentialsPlacement: 'body'
          }
        },
        collectionUid: 'test-collection',
        forceFetch: true
      });

      expect(result.credentials).not.toBeNull();

      const capturedConfig = getCapturedConfig();
      expect(capturedConfig.headers['Authorization']).toBeUndefined();
      expect(capturedConfig.data).toContain('client_id=my-client-id');
      // Empty client_secret should be omitted
      expect(capturedConfig.data).not.toContain('client_secret=');
    });

    test('should send both client_id and client_secret in body when clientSecret is present', async () => {
      const { adapter, getCapturedConfig } = createMockAdapter();
      axios.defaults.adapter = adapter;

      const result = await getOAuth2TokenUsingClientCredentials({
        request: {
          oauth2: {
            grantType: 'client_credentials',
            accessTokenUrl: 'https://auth.example.com/token',
            clientId: 'my-client-id',
            clientSecret: 'my-secret',
            credentialsPlacement: 'body'
          }
        },
        collectionUid: 'test-collection',
        forceFetch: true
      });

      expect(result.credentials).not.toBeNull();

      const capturedConfig = getCapturedConfig();
      expect(capturedConfig.headers['Authorization']).toBeUndefined();
      expect(capturedConfig.data).toContain('client_id=my-client-id');
      expect(capturedConfig.data).toContain('client_secret=my-secret');
    });
  });
});

// ─── Password Grant ──────────────────────────────────────────────────────────
//
// Password grant includes user credentials (username, password) always in body,
// plus client credentials placement is configurable.

describe('OAuth2 Helper - Password Grant', () => {
  let originalAdapter: any;

  beforeEach(() => {
    originalAdapter = axios.defaults.adapter;
  });

  afterEach(() => {
    axios.defaults.adapter = originalAdapter;
  });

  describe('when credentialsPlacement is basic_auth_header', () => {
    test('should send token request with Authorization header when clientSecret is undefined', async () => {
      const { adapter, getCapturedConfig } = createMockAdapter();
      axios.defaults.adapter = adapter;

      const result = await getOAuth2TokenUsingPasswordCredentials({
        request: {
          oauth2: {
            grantType: 'password',
            accessTokenUrl: 'https://auth.example.com/token',
            clientId: 'my-client-id',
            clientSecret: undefined,
            username: 'testuser',
            password: 'testpass',
            credentialsPlacement: 'basic_auth_header'
          }
        },
        collectionUid: 'test-collection',
        forceFetch: true
      });

      expect(result.credentials).not.toBeNull();

      const capturedConfig = getCapturedConfig();
      const expectedAuth = `Basic ${Buffer.from('my-client-id:').toString('base64')}`;
      expect(capturedConfig.headers['Authorization']).toBe(expectedAuth);

      expect(capturedConfig.data).toContain('grant_type=password');
      expect(capturedConfig.data).toContain('username=testuser');
      expect(capturedConfig.data).toContain('password=testpass');

      // client_id should NOT be in body when using basic_auth_header
      expect(capturedConfig.data).not.toContain('client_id=');
    });

    test('should send token request with Authorization header when clientSecret is empty string', async () => {
      const { adapter, getCapturedConfig } = createMockAdapter();
      axios.defaults.adapter = adapter;

      await getOAuth2TokenUsingPasswordCredentials({
        request: {
          oauth2: {
            grantType: 'password',
            accessTokenUrl: 'https://auth.example.com/token',
            clientId: 'my-client-id',
            clientSecret: '',
            username: 'testuser',
            password: 'testpass',
            credentialsPlacement: 'basic_auth_header'
          }
        },
        collectionUid: 'test-collection',
        forceFetch: true
      });

      const capturedConfig = getCapturedConfig();
      const expectedAuth = `Basic ${Buffer.from('my-client-id:').toString('base64')}`;
      expect(capturedConfig.headers['Authorization']).toBe(expectedAuth);
    });

    test('should send token request with Authorization header when clientSecret is present', async () => {
      const { adapter, getCapturedConfig } = createMockAdapter();
      axios.defaults.adapter = adapter;

      await getOAuth2TokenUsingPasswordCredentials({
        request: {
          oauth2: {
            grantType: 'password',
            accessTokenUrl: 'https://auth.example.com/token',
            clientId: 'my-client-id',
            clientSecret: 'my-secret',
            username: 'testuser',
            password: 'testpass',
            credentialsPlacement: 'basic_auth_header'
          }
        },
        collectionUid: 'test-collection',
        forceFetch: true
      });

      const capturedConfig = getCapturedConfig();
      const expectedAuth = `Basic ${Buffer.from('my-client-id:my-secret').toString('base64')}`;
      expect(capturedConfig.headers['Authorization']).toBe(expectedAuth);
      expect(capturedConfig.data).not.toContain('client_secret=');
    });
  });

  describe('when credentialsPlacement is body', () => {
    test('should send client_id in body and no Authorization header when clientSecret is empty', async () => {
      const { adapter, getCapturedConfig } = createMockAdapter();
      axios.defaults.adapter = adapter;

      await getOAuth2TokenUsingPasswordCredentials({
        request: {
          oauth2: {
            grantType: 'password',
            accessTokenUrl: 'https://auth.example.com/token',
            clientId: 'my-client-id',
            clientSecret: '',
            username: 'testuser',
            password: 'testpass',
            credentialsPlacement: 'body'
          }
        },
        collectionUid: 'test-collection',
        forceFetch: true
      });

      const capturedConfig = getCapturedConfig();
      expect(capturedConfig.headers['Authorization']).toBeUndefined();
      expect(capturedConfig.data).toContain('client_id=my-client-id');
      expect(capturedConfig.data).not.toContain('client_secret=');
    });

    test('should send both client_id and client_secret in body when clientSecret is present', async () => {
      const { adapter, getCapturedConfig } = createMockAdapter();
      axios.defaults.adapter = adapter;

      await getOAuth2TokenUsingPasswordCredentials({
        request: {
          oauth2: {
            grantType: 'password',
            accessTokenUrl: 'https://auth.example.com/token',
            clientId: 'my-client-id',
            clientSecret: 'my-secret',
            username: 'testuser',
            password: 'testpass',
            credentialsPlacement: 'body'
          }
        },
        collectionUid: 'test-collection',
        forceFetch: true
      });

      const capturedConfig = getCapturedConfig();
      expect(capturedConfig.headers['Authorization']).toBeUndefined();
      expect(capturedConfig.data).toContain('client_id=my-client-id');
      expect(capturedConfig.data).toContain('client_secret=my-secret');
    });
  });
});

// ─── Token Expiry ────────────────────────────────────────────────────────────

describe('OAuth2 Helper - Token Expiry', () => {
  test('should return true when access_token is missing', () => {
    expect(isTokenExpired(null)).toBe(true);
    expect(isTokenExpired({})).toBe(true);
    expect(isTokenExpired({ refresh_token: 'abc' })).toBe(true);
  });

  test('should return false when no expiration info', () => {
    expect(isTokenExpired({ access_token: 'token' })).toBe(false);
    expect(isTokenExpired({ access_token: 'token', expires_in: 3600 })).toBe(false);
    expect(isTokenExpired({ access_token: 'token', created_at: Date.now() })).toBe(false);
  });

  test('should return true when token is expired', () => {
    const credentials = {
      access_token: 'token',
      expires_in: 3600,
      created_at: Date.now() - 4000 * 1000 // created 4000 seconds ago, expires after 3600
    };
    expect(isTokenExpired(credentials)).toBe(true);
  });

  test('should return false when token is still valid', () => {
    const credentials = {
      access_token: 'token',
      expires_in: 3600,
      created_at: Date.now() - 1000 * 1000 // created 1000 seconds ago, expires after 3600
    };
    expect(isTokenExpired(credentials)).toBe(false);
  });
});

// ─── Additional Parameters ───────────────────────────────────────────────────

describe('OAuth2 Helper - Additional Parameters', () => {
  test('should apply header parameters', () => {
    const requestConfig = { url: 'https://auth.example.com/token', headers: {} as Record<string, string> };
    const data: Record<string, string> = {};

    applyAdditionalParameters(requestConfig, data, [
      { name: 'X-Custom-Header', value: 'custom-value', sendIn: 'headers', enabled: true }
    ]);

    expect(requestConfig.headers['X-Custom-Header']).toBe('custom-value');
  });

  test('should apply query parameters', () => {
    const requestConfig = { url: 'https://auth.example.com/token', headers: {} as Record<string, string> };
    const data: Record<string, string> = {};

    applyAdditionalParameters(requestConfig, data, [
      { name: 'audience', value: 'https://api.example.com', sendIn: 'queryparams', enabled: true }
    ]);

    expect(requestConfig.url).toContain('audience=');
    expect(requestConfig.url).toContain('https%3A%2F%2Fapi.example.com');
  });

  test('should apply body parameters', () => {
    const requestConfig = { url: 'https://auth.example.com/token', headers: {} as Record<string, string> };
    const data: Record<string, string> = {};

    applyAdditionalParameters(requestConfig, data, [
      { name: 'resource', value: 'https://api.example.com', sendIn: 'body', enabled: true }
    ]);

    expect(data['resource']).toBe('https://api.example.com');
  });

  test('should skip disabled parameters', () => {
    const requestConfig = { url: 'https://auth.example.com/token', headers: {} as Record<string, string> };
    const data: Record<string, string> = {};

    applyAdditionalParameters(requestConfig, data, [
      { name: 'X-Skip', value: 'skip-me', sendIn: 'headers', enabled: false }
    ]);

    expect(requestConfig.headers['X-Skip']).toBeUndefined();
  });

  test('should skip parameters without a name', () => {
    const requestConfig = { url: 'https://auth.example.com/token', headers: {} as Record<string, string> };
    const data: Record<string, string> = {};

    applyAdditionalParameters(requestConfig, data, [
      { name: '', value: 'no-name', sendIn: 'headers', enabled: true }
    ]);

    expect(Object.keys(requestConfig.headers)).toHaveLength(0);
  });
});

// ─── Token Placement ─────────────────────────────────────────────────────────

describe('OAuth2 Helper - Token Placement', () => {
  test('should place token in Authorization header with Bearer prefix by default', () => {
    const request: { headers: Record<string, string>; url: string } = { headers: {}, url: 'https://api.example.com/data' };
    placeOAuth2Token(request, { access_token: 'my-token' }, { grantType: 'client_credentials' });

    expect(request.headers['Authorization']).toBe('Bearer my-token');
  });

  test('should place token in Authorization header with custom prefix', () => {
    const request: { headers: Record<string, string>; url: string } = { headers: {}, url: 'https://api.example.com/data' };
    placeOAuth2Token(request, { access_token: 'my-token' }, {
      grantType: 'client_credentials',
      tokenPlacement: 'header',
      tokenHeaderPrefix: 'Token'
    });

    expect(request.headers['Authorization']).toBe('Token my-token');
  });

  test('should place token in query params', () => {
    const request: { headers: Record<string, string>; url: string } = { headers: {}, url: 'https://api.example.com/data' };
    placeOAuth2Token(request, { access_token: 'my-token' }, {
      grantType: 'client_credentials',
      tokenPlacement: 'queryparams',
      tokenQueryKey: 'token'
    });

    expect(request.url).toContain('token=my-token');
    expect(request.headers['Authorization']).toBeUndefined();
  });

  test('should use default query key access_token', () => {
    const request: { headers: Record<string, string>; url: string } = { headers: {}, url: 'https://api.example.com/data' };
    placeOAuth2Token(request, { access_token: 'my-token' }, {
      grantType: 'client_credentials',
      tokenPlacement: 'queryparams'
    });

    expect(request.url).toContain('access_token=my-token');
  });

  test('should use id_token when tokenSource is id_token', () => {
    const request: { headers: Record<string, string>; url: string } = { headers: {}, url: 'https://api.example.com/data' };
    placeOAuth2Token(request, { access_token: 'access', id_token: 'id-tok' }, {
      grantType: 'client_credentials',
      tokenSource: 'id_token' as any
    });

    expect(request.headers['Authorization']).toBe('Bearer id-tok');
  });

  test('should not modify request when token value is missing', () => {
    const request: { headers: Record<string, string>; url: string } = { headers: {}, url: 'https://api.example.com/data' };
    placeOAuth2Token(request, { refresh_token: 'refresh-only' }, { grantType: 'client_credentials' });

    expect(request.headers['Authorization']).toBeUndefined();
    expect(request.url).toBe('https://api.example.com/data');
  });
});

// ─── PKCE ────────────────────────────────────────────────────────────────────

describe('OAuth2 Helper - PKCE', () => {
  test('should generate a code verifier of expected length', () => {
    const verifier = generateCodeVerifier();
    // 22 random bytes → 44 hex characters
    expect(verifier).toHaveLength(44);
    expect(verifier).toMatch(/^[0-9a-f]+$/);
  });

  test('should generate different verifiers each time', () => {
    const v1 = generateCodeVerifier();
    const v2 = generateCodeVerifier();
    expect(v1).not.toBe(v2);
  });

  test('should generate a valid base64url-encoded code challenge', () => {
    const verifier = 'test-verifier-string';
    const challenge = generateCodeChallenge(verifier);

    // Should be base64url encoded (no +, /, or = characters)
    expect(challenge).not.toContain('+');
    expect(challenge).not.toContain('/');
    expect(challenge).not.toContain('=');
    expect(challenge.length).toBeGreaterThan(0);
  });

  test('should produce consistent challenge for same verifier', () => {
    const verifier = 'consistent-verifier';
    const c1 = generateCodeChallenge(verifier);
    const c2 = generateCodeChallenge(verifier);
    expect(c1).toBe(c2);
  });
});

// ─── Validation ──────────────────────────────────────────────────────────────

describe('OAuth2 Helper - Validation', () => {
  test('client_credentials should return error when accessTokenUrl is missing', async () => {
    const result = await getOAuth2TokenUsingClientCredentials({
      request: {
        oauth2: { grantType: 'client_credentials', clientId: 'id' }
      },
      collectionUid: 'test',
      forceFetch: true
    });

    expect(result.error).toContain('Access Token URL is required');
    expect(result.credentials).toBeNull();
  });

  test('client_credentials should return error when clientId is missing', async () => {
    const result = await getOAuth2TokenUsingClientCredentials({
      request: {
        oauth2: { grantType: 'client_credentials', accessTokenUrl: 'https://auth.example.com/token' }
      },
      collectionUid: 'test',
      forceFetch: true
    });

    expect(result.error).toContain('Client ID is required');
    expect(result.credentials).toBeNull();
  });

  test('password should return error when username is missing', async () => {
    const result = await getOAuth2TokenUsingPasswordCredentials({
      request: {
        oauth2: {
          grantType: 'password',
          accessTokenUrl: 'https://auth.example.com/token',
          clientId: 'id',
          password: 'pass'
        }
      },
      collectionUid: 'test',
      forceFetch: true
    });

    expect(result.error).toContain('Username is required');
  });

  test('password should return error when password is missing', async () => {
    const result = await getOAuth2TokenUsingPasswordCredentials({
      request: {
        oauth2: {
          grantType: 'password',
          accessTokenUrl: 'https://auth.example.com/token',
          clientId: 'id',
          username: 'user'
        }
      },
      collectionUid: 'test',
      forceFetch: true
    });

    expect(result.error).toContain('Password is required');
  });
});
