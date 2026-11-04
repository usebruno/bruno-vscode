import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AxiosAdapter, AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import http from 'http';
import https from 'https';
import type { Readable } from 'stream';
import type { NetworkLogEntry } from '@bruno-types';
import { createAxiosInstance } from './axios-instance';
import { setExtensionContext as setPreferencesContext } from '../../store/preferences';
import { addCookieToJar, cookieJar } from '../../utils/cookies';

interface StubResponse {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  data?: unknown;
  httpVersion?: string;
}

/** Stands in for the http adapter, including its non-2xx rejection. */
const createStubAdapter = (responses: StubResponse[]): AxiosAdapter => {
  let call = 0;
  return (config: InternalAxiosRequestConfig) => {
    const stub = responses[Math.min(call++, responses.length - 1)];
    const request = { res: { httpVersion: stub.httpVersion || '1.1' } };
    const response = {
      data: stub.data ?? '',
      status: stub.status ?? 200,
      statusText: stub.statusText ?? 'OK',
      headers: stub.headers ?? {},
      config,
      request
    } as unknown as AxiosResponse;

    if (response.status >= 200 && response.status < 300) {
      return Promise.resolve(response);
    }
    return Promise.reject(
      new AxiosError(`Request failed with status code ${response.status}`, 'ERR_BAD_REQUEST', config, request, response)
    );
  };
};

const messagesOfType = (timeline: NetworkLogEntry[], type: NetworkLogEntry['type']): string[] =>
  timeline.filter((entry) => entry.type === type).map((entry) => entry.message as string);

const typesOf = (timeline: NetworkLogEntry[]): string[] => timeline.map((entry) => entry.type);

describe('axios-instance network log', () => {
  it('logs the request and the response like the desktop app', async () => {
    const timeline: NetworkLogEntry[] = [];
    const instance = createAxiosInstance({ timeline });

    await instance.request({
      url: 'https://api.example.com/breeds',
      method: 'get',
      adapter: createStubAdapter([{ headers: { 'content-type': 'application/json' } }])
    });

    // A stub adapter never builds a request, so the request headers are logged only against a real one.
    expect(typesOf(timeline)).toEqual([
      'separator',
      'info',
      'info',
      'request',
      'response',
      'responseHeader',
      'responseHeader',
      'info'
    ]);
    expect(messagesOfType(timeline, 'request')).toEqual(['GET https://api.example.com/breeds']);
    expect(messagesOfType(timeline, 'response')).toEqual(['HTTP/1.1 200 OK']);
    expect(messagesOfType(timeline, 'responseHeader')).toEqual([
      'content-type: application/json',
      expect.stringMatching(/^request-duration: \d+$/)
    ]);

    const infoMessages = messagesOfType(timeline, 'info');
    expect(infoMessages[0]).toBe('Preparing request to https://api.example.com/breeds');
    expect(infoMessages[1]).toMatch(/^Current time is \d{4}-\d{2}-\d{2}T/);
    expect(infoMessages[2]).toMatch(/^Request completed in \d+ ms$/);
  });

  it('logs the request body', async () => {
    const timeline: NetworkLogEntry[] = [];
    const instance = createAxiosInstance({ timeline });

    await instance.request({
      url: 'https://api.example.com/cats',
      method: 'post',
      data: '{"name":"tom"}',
      headers: { 'content-type': 'application/json' },
      adapter: createStubAdapter([{ status: 201, statusText: 'Created' }])
    });

    expect(messagesOfType(timeline, 'requestData')).toEqual(['{"name":"tom"}']);
    expect(messagesOfType(timeline, 'response')).toEqual(['HTTP/1.1 201 Created']);
  });

  it('redacts a file body instead of logging the whole file', async () => {
    const timeline: NetworkLogEntry[] = [];
    const instance = createAxiosInstance({ timeline });

    await instance.request({
      url: 'https://api.example.com/upload',
      method: 'post',
      data: Buffer.from('binary-file-contents'),
      adapter: createStubAdapter([{}])
    });

    expect(messagesOfType(timeline, 'requestData')).toEqual(['<request body redacted>']);
  });

  it('reports HTTP/2 multiplexing', async () => {
    const timeline: NetworkLogEntry[] = [];
    const instance = createAxiosInstance({ timeline });

    await instance.request({
      url: 'https://api.example.com/breeds',
      method: 'get',
      adapter: createStubAdapter([{ httpVersion: '2.0' }])
    });

    expect(messagesOfType(timeline, 'info')).toContain('Using HTTP/2, server supports multiplexing');
    expect(messagesOfType(timeline, 'response')).toEqual(['HTTP/2.0 200 OK']);
  });

  it('logs the status line and headers of an error response', async () => {
    const timeline: NetworkLogEntry[] = [];
    const instance = createAxiosInstance({ timeline });

    await expect(instance.request({
      url: 'https://api.example.com/missing',
      method: 'get',
      adapter: createStubAdapter([{ status: 404, statusText: 'Not Found', headers: { 'content-length': '9' } }])
    })).rejects.toThrow();

    expect(messagesOfType(timeline, 'error')).toEqual(['there was an error executing the request!']);
    expect(messagesOfType(timeline, 'response')).toEqual(['HTTP/1.1 404 Not Found']);
    expect(messagesOfType(timeline, 'responseHeader')).toEqual([
      'content-length: 9',
      expect.stringMatching(/^request-duration: \d+$/)
    ]);
  });

  it('logs the cause of a request that never got a response', async () => {
    const timeline: NetworkLogEntry[] = [];
    const instance = createAxiosInstance({ timeline });

    await expect(instance.request({
      url: 'https://api.example.com/breeds',
      method: 'get',
      adapter: () => Promise.reject(Object.assign(new AxiosError('connect ECONNREFUSED', 'ECONNREFUSED'), {
        cause: new Error('connect ECONNREFUSED 127.0.0.1:443')
      }))
    })).rejects.toThrow();

    const errors = messagesOfType(timeline, 'error');
    expect(errors[0]).toBe('there was an error executing the request!');
    expect(errors[1]).toContain('connect ECONNREFUSED');
    expect(messagesOfType(timeline, 'response')).toEqual([]);
  });

  it('logs every hop of a redirect chain', async () => {
    const timeline: NetworkLogEntry[] = [];
    const instance = createAxiosInstance({ timeline });

    await instance.request({
      url: 'https://api.example.com/old',
      method: 'post',
      data: '{"name":"tom"}',
      adapter: createStubAdapter([
        { status: 301, statusText: 'Moved Permanently', headers: { location: '/new' } },
        { status: 200 }
      ])
    });

    expect(typesOf(timeline).filter((type) => type === 'separator')).toHaveLength(2);
    expect(messagesOfType(timeline, 'request')).toEqual([
      'POST https://api.example.com/old',
      'GET https://api.example.com/new'
    ]);
    expect(messagesOfType(timeline, 'response')).toEqual(['HTTP/1.1 301 Moved Permanently', 'HTTP/1.1 200 OK']);
    expect(messagesOfType(timeline, 'info')).toContain('Resolving relative redirect URL: /new → https://api.example.com/new');
    expect(messagesOfType(timeline, 'info')).toContain(
      'Changed method from POST to GET for 301 redirect and removed request body'
    );
    expect(messagesOfType(timeline, 'responseHeader').filter((header) => header.startsWith('request-duration: '))).toHaveLength(2);
  });

  it('logs the method change of a redirect that was already a GET', async () => {
    const timeline: NetworkLogEntry[] = [];
    const instance = createAxiosInstance({ timeline });

    await instance.request({
      url: 'https://api.example.com/redirect',
      method: 'get',
      adapter: createStubAdapter([
        { status: 302, statusText: 'Found', headers: { location: '/target' } },
        { status: 200 }
      ])
    });

    expect(messagesOfType(timeline, 'info')).toEqual([
      'Preparing request to https://api.example.com/redirect',
      expect.stringMatching(/^Current time is /),
      expect.stringMatching(/^Request completed in \d+ ms$/),
      'Resolving relative redirect URL: /target → https://api.example.com/target',
      'Changed method from GET to GET for 302 redirect and removed request body',
      'Proxy mode: off',
      'SSL validation: enabled',
      'Preparing request to https://api.example.com/target',
      expect.stringMatching(/^Current time is /),
      expect.stringMatching(/^Request completed in \d+ ms$/)
    ]);
  });

  it('leaves the SSL line off a redirect to a plaintext target', async () => {
    const timeline: NetworkLogEntry[] = [];
    const instance = createAxiosInstance({ timeline });

    await instance.request({
      url: 'https://api.example.com/old',
      method: 'get',
      adapter: createStubAdapter([
        { status: 302, statusText: 'Found', headers: { location: 'http://api.example.com/new' } },
        { status: 200 }
      ])
    });

    expect(messagesOfType(timeline, 'info')).toContain('Proxy mode: off');
    expect(messagesOfType(timeline, 'info')).not.toContainEqual(expect.stringContaining('SSL validation'));
  });

  it('does not log when no timeline is passed', async () => {
    const instance = createAxiosInstance();

    const response = await instance.request({
      url: 'https://api.example.com/breeds',
      method: 'get',
      adapter: createStubAdapter([{}])
    });

    expect(response.status).toBe(200);
  });
});

describe('axios-instance TLS options', () => {
  // A stub adapter replaces axios's http adapter, which is the only caller of `transport`, so these tests
  // take the transport off `instance.defaults` and call it directly, with `https.request` mocked out.
  const sendThroughTransport = (options: Parameters<typeof createAxiosInstance>[0]) => {
    const requestSpy = vi.spyOn(https, 'request').mockImplementation(() => {
      throw new Error('not sent');
    });
    const transport = createAxiosInstance(options).defaults.transport as {
      request: (options: http.RequestOptions) => unknown;
    };
    expect(() => transport.request({ protocol: 'https:', hostname: 'api.example.com', path: '/' })).toThrow('not sent');
    return requestSpy.mock.calls[0][0] as https.RequestOptions;
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never sets NODE_TLS_REJECT_UNAUTHORIZED on the shared extension host', async () => {
    const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    try {
      await createAxiosInstance({ httpsAgentOptions: { rejectUnauthorized: false } }).request({
        url: 'https://api.example.com/breeds',
        method: 'get',
        adapter: createStubAdapter([{}])
      });

      expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
    } finally {
      if (previous !== undefined) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
      }
    }
  });

  it('verifies certificates by default', () => {
    expect(sendThroughTransport({}).rejectUnauthorized).toBe(true);
  });

  it('passes TLS options on the request itself, where VS Code\'s proxy agent keeps them', () => {
    const requestOptions = sendThroughTransport({
      httpsAgentOptions: { rejectUnauthorized: false, ca: 'custom-ca', passphrase: 'secret' }
    });

    expect(requestOptions).toMatchObject({ rejectUnauthorized: false, ca: 'custom-ca', passphrase: 'secret' });
  });

  it('logs SSL validation as disabled only when verification is turned off', async () => {
    const sslMessages = async (httpsAgentOptions?: https.AgentOptions) => {
      const timeline: NetworkLogEntry[] = [];
      await createAxiosInstance({ timeline, httpsAgentOptions }).request({
        url: 'https://api.example.com/redirect',
        method: 'get',
        adapter: createStubAdapter([
          { status: 302, statusText: 'Found', headers: { location: '/target' } },
          { status: 200 }
        ])
      });
      return messagesOfType(timeline, 'info').filter((message) => message.startsWith('SSL validation'));
    };

    expect(await sslMessages({ rejectUnauthorized: false })).toEqual(['SSL validation: disabled']);
    expect(await sslMessages()).toEqual(['SSL validation: enabled']);
  });
});

describe('axios-instance cookies', () => {
  const setSendCookiesPreference = (sendCookies: boolean) => {
    const state: Record<string, unknown> = { preferences: { request: { sendCookies } } };
    setPreferencesContext({
      globalState: {
        get: <T>(key: string, defaultValue?: T) => (key in state ? (state[key] as T) : defaultValue),
        update: (key: string, value: unknown) => {
          state[key] = value;
          return Promise.resolve();
        }
      }
    } as never);
  };

  const followRedirectWithCookie = async () => {
    cookieJar.removeAllCookies();
    addCookieToJar('session=abc; Path=/', 'http://api.example.com/old');

    const configs: InternalAxiosRequestConfig[] = [];
    const stub = createStubAdapter([
      { status: 301, statusText: 'Moved Permanently', headers: { location: '/new' } },
      { status: 200 }
    ]);

    await createAxiosInstance({}).request({
      url: 'http://api.example.com/old',
      method: 'get',
      adapter: (config: InternalAxiosRequestConfig) => {
        configs.push(config);
        return stub(config);
      }
    });
    return configs;
  };

  it('sends stored cookies on a redirect hop', async () => {
    setSendCookiesPreference(true);

    const configs = await followRedirectWithCookie();

    expect(configs[1].headers['cookie']).toBe('session=abc');
  });

  it('sends no cookies when the preference is off', async () => {
    setSendCookiesPreference(false);

    const configs = await followRedirectWithCookie();

    expect(configs[1].headers['cookie']).toBeUndefined();
  });
});

describe('axios-instance connection log', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      // Every case here asserts on connection lines, which a socket left in the pool would skip.
      res.setHeader('connection', 'close');
      if (req.url === '/never-responds') {
        return;
      }
      if (req.url === '/digest') {
        if (!req.headers.authorization) {
          res.writeHead(401, { 'www-authenticate': 'Digest realm="test", nonce="abc", qop="auth"' });
          res.end();
          return;
        }
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('authorized');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('pong');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  afterAll(() => {
    server.close();
    server.closeAllConnections?.();
  });

  it('still honours the request timeout while logging the connection', async () => {
    const timeline: NetworkLogEntry[] = [];
    const instance = createAxiosInstance({ timeline, timeout: 250 });

    const error = await instance.request({ url: `${baseUrl}/never-responds`, method: 'get' })
      .then(() => null, (err: AxiosError) => err);

    expect(error?.code).toBe(AxiosError.ECONNABORTED);
    expect(error?.message).toBe('timeout of 250ms exceeded');
  });

  it('still answers a digest challenge after the log interceptors run', async () => {
    const timeline: NetworkLogEntry[] = [];
    const instance = createAxiosInstance({
      timeline,
      digestConfig: { username: 'user', password: 'pass' }
    });

    const response = await instance.request({ url: `${baseUrl}/digest`, method: 'get' });
    (response.data as Readable).resume();

    expect(response.status).toBe(200);
    // The challenge is logged as its own hop, then the retry carries the credentials.
    expect(messagesOfType(timeline, 'response')).toEqual(['HTTP/1.1 401 Unauthorized', 'HTTP/1.1 200 OK']);
    expect(messagesOfType(timeline, 'requestHeader').filter((header) => header.startsWith('Authorization: Digest'))).toHaveLength(1);
  });

  it('logs the headers that went out, not the ones axios had before the adapter ran', async () => {
    const timeline: NetworkLogEntry[] = [];
    const instance = createAxiosInstance({ timeline });

    const response = await instance.request({
      url: `${baseUrl}/ping`,
      method: 'post',
      data: '{"name":"tom"}',
      headers: { 'Content-Type': 'application/json', 'x-dropped': false as unknown as string }
    });
    (response.data as Readable).resume();

    const headers = messagesOfType(timeline, 'requestHeader');
    expect(headers).toContain('Content-Type: application/json');
    expect(headers).toContain('User-Agent: bruno-runtime/1.0');
    expect(headers).toContain('Content-Length: 14');
    expect(headers).toContainEqual(expect.stringMatching(/^Accept-Encoding: gzip/));
    expect(headers).toContainEqual(expect.stringMatching(/^Host: 127\.0\.0\.1:\d+$/));
    expect(headers).toContain('Connection: keep-alive');
    expect(headers).toContainEqual(expect.stringMatching(/^request-start-time: \d+$/));
    expect(headers).not.toContainEqual(expect.stringContaining('x-dropped'));
  });

  it('names the proxy between the header block and the connection trace', async () => {
    const timeline: NetworkLogEntry[] = [];
    const proxyPort = (server.address() as { port: number }).port;
    const instance = createAxiosInstance({
      timeline,
      proxyMode: 'on',
      proxyConfig: { protocol: 'http', hostname: '127.0.0.1', port: proxyPort }
    });

    const response = await instance.request({ url: 'http://api.example.com/ping', method: 'get' });
    (response.data as Readable).resume();

    const messages = timeline.map((entry) => (entry.message as string) ?? '');
    const proxyLines = messages.filter((message) => message.startsWith('Proxy mode:'));
    const proxyLine = messages.indexOf(`Proxy mode: on | http://127.0.0.1:${proxyPort}`);

    expect(proxyLines).toEqual([`Proxy mode: on | http://127.0.0.1:${proxyPort}`]);
    expect(proxyLine).toBeGreaterThan(typesOf(timeline).lastIndexOf('requestHeader'));
    expect(proxyLine).toBeLessThan(messages.findIndex((message) => message.startsWith('Trying ')));
  });

  it('keeps the proxy password out of the log', async () => {
    const timeline: NetworkLogEntry[] = [];
    const instance = createAxiosInstance({
      timeline,
      proxyMode: 'on',
      proxyConfig: {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: (server.address() as { port: number }).port,
        auth: { username: 'proxyuser', password: 'sup3rs3cret' }
      }
    });

    // axios puts Proxy-Authorization on the request itself, so it reaches the log with every other header.
    const response = await instance.request({ url: 'http://api.example.com/ping', method: 'get' });
    (response.data as Readable).resume();

    const credential = `Basic ${Buffer.from('proxyuser:sup3rs3cret').toString('base64')}`;
    expect(messagesOfType(timeline, 'requestHeader')).toContain(`Proxy-Authorization: ${'*'.repeat(credential.length)}`);
    expect(timeline.map((entry) => entry.message).join('\n')).not.toContain('sup3rs3cret');
  });

  it('logs the connection the request was sent over', async () => {
    const timeline: NetworkLogEntry[] = [];
    const instance = createAxiosInstance({ timeline });

    const response = await instance.request({ url: `${baseUrl}/ping`, method: 'get' });
    (response.data as Readable).resume();

    const infoMessages = messagesOfType(timeline, 'info');
    expect(infoMessages).toContainEqual(expect.stringMatching(/^Trying 127\.0\.0\.1:\d+\.\.\.$/));
    expect(infoMessages).toContainEqual(expect.stringMatching(/^Connected to 127\.0\.0\.1 \(127\.0\.0\.1\) port \d+$/));
    // The connection is established after the request is described and before the response arrives.
    expect(typesOf(timeline).lastIndexOf('requestHeader')).toBeLessThan(
      timeline.findIndex((entry) => entry.message?.startsWith('Trying '))
    );
    expect(timeline.findIndex((entry) => entry.message?.startsWith('Connected to '))).toBeLessThan(
      typesOf(timeline).indexOf('response')
    );
  });
});
