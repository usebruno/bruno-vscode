import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { EventEmitter } from 'events';
import http from 'http';
import https from 'https';
import type { ClientRequest } from 'http';
import type { NetworkLogEntry } from '@bruno-types';
import { AxiosError } from 'axios';
import { createConnectionLoggingTransport, logConnection, logRequestHeaders } from './connection-log';

const PROXY_MODE_MESSAGE = 'Proxy mode: off';

const createRecorder = () => {
  const entries: Array<{ type: NetworkLogEntry['type']; message: string }> = [];
  return {
    entries,
    log: (type: NetworkLogEntry['type'], message: string) => entries.push({ type, message }),
    messages: () => entries.map((entry) => entry.message)
  };
};

const createClientRequest = (headers: Record<string, string> = {}, overrides: Record<string, unknown> = {}) =>
  Object.assign(new EventEmitter(), {
    shouldKeepAlive: true,
    getRawHeaderNames: () => Object.keys(headers),
    getHeader: (name: string) => headers[name],
    ...overrides
  }) as unknown as ClientRequest;

const createConnectingSocket = (overrides: Record<string, unknown> = {}) =>
  Object.assign(new EventEmitter(), {
    connecting: true,
    remoteAddress: undefined as string | undefined,
    remotePort: undefined as number | undefined,
    ...overrides
  });

describe('logConnection', () => {
  it('logs the TLS parameters offered and the connection attempt', () => {
    const recorder = createRecorder();
    const request = new EventEmitter() as unknown as ClientRequest;

    logConnection(request, { host: 'catfact.ninja', port: 443, isHttps: true }, {
      log: recorder.log,
      proxyModeMessage: PROXY_MODE_MESSAGE,
      tlsOptions: { rejectUnauthorized: false },
      caCertificatesCount: { root: 2, system: 1 }
    });

    const socket = createConnectingSocket();
    request.emit('socket', socket);
    socket.emit('lookup', null, '172.67.188.187', 4, 'catfact.ninja');
    socket.remoteAddress = '172.67.188.187';
    socket.remotePort = 443;
    socket.emit('connect');

    expect(recorder.messages()).toEqual([
      'SSL validation: disabled',
      'ALPN: offers h2, http/1.1',
      'CA Certificates: 2 root, 1 system, 0 extra, 0 custom',
      'Trying catfact.ninja:443...',
      'DNS lookup: catfact.ninja -> 172.67.188.187',
      'Connected to catfact.ninja (172.67.188.187) port 443'
    ]);
  });

  it('logs the negotiated TLS session and the server certificate', () => {
    const recorder = createRecorder();
    const request = new EventEmitter() as unknown as ClientRequest;

    logConnection(request, { host: 'catfact.ninja', port: 443, isHttps: true }, { log: recorder.log, proxyModeMessage: PROXY_MODE_MESSAGE });

    const socket = createConnectingSocket({
      authorized: true,
      alpnProtocol: false,
      getProtocol: () => 'TLSv1.3',
      getCipher: () => ({ name: 'TLS_AES_128_GCM_SHA256', version: 'TLSv1/SSLv3' }),
      getPeerCertificate: () => ({
        subject: { CN: 'catfact.ninja' },
        issuer: { C: 'US', O: 'Google Trust Services', CN: 'WE1' },
        valid_from: 'Jul 16 18:35:13 2026 GMT',
        valid_to: 'Oct 14 19:33:44 2026 GMT',
        subjectaltname: 'DNS:catfact.ninja, DNS:*.catfact.ninja'
      })
    });
    request.emit('socket', socket);
    socket.emit('secureConnect');

    expect(recorder.messages()).toEqual([
      'SSL validation: enabled',
      'ALPN: offers h2, http/1.1',
      'CA Certificates: 0 root, 0 system, 0 extra, 0 custom',
      'Trying catfact.ninja:443...',
      'SSL connection using TLSv1.3 / TLS_AES_128_GCM_SHA256 (TLSv1/SSLv3)',
      'ALPN: server accepted None',
      'Server certificate:',
      ' subject: CN=catfact.ninja',
      ' start date: Jul 16 18:35:13 2026 GMT',
      ' expire date: Oct 14 19:33:44 2026 GMT',
      ' subjectAltName: DNS:catfact.ninja, DNS:*.catfact.ninja',
      ' issuer: C=US, O=Google Trust Services, CN=WE1',
      'SSL certificate verify ok.'
    ]);
    expect(recorder.entries.filter((entry) => entry.type === 'tls')).toHaveLength(11);
  });

  it('reports a certificate that failed verification as skipped', () => {
    const recorder = createRecorder();
    const request = new EventEmitter() as unknown as ClientRequest;

    logConnection(request, { host: 'self.signed', port: 443, isHttps: true }, { log: recorder.log, proxyModeMessage: PROXY_MODE_MESSAGE, tlsOptions: { rejectUnauthorized: false } });

    const socket = createConnectingSocket({
      authorized: false,
      getProtocol: () => 'TLSv1.2',
      getCipher: () => undefined,
      getPeerCertificate: () => ({ subject: { CN: 'self.signed' } })
    });
    request.emit('socket', socket);
    socket.emit('secureConnect');

    expect(recorder.messages()).toContain('SSL connection using TLSv1.2 / Unknown cipher');
    expect(recorder.messages()).toContain('SSL certificate verification skipped (rejectUnauthorized: false).');
  });

  it('logs only the connection for a plain http request', () => {
    const recorder = createRecorder();
    const request = new EventEmitter() as unknown as ClientRequest;

    logConnection(request, { host: '127.0.0.1', port: 8081, isHttps: false }, { log: recorder.log, proxyModeMessage: PROXY_MODE_MESSAGE });

    const socket = createConnectingSocket({ remoteAddress: '127.0.0.1', remotePort: 8081 });
    request.emit('socket', socket);
    socket.emit('connect');

    expect(recorder.messages()).toEqual([
      'Trying 127.0.0.1:8081...',
      'Connected to 127.0.0.1 (127.0.0.1) port 8081'
    ]);
  });

  it('stays quiet when the socket comes from the pool', () => {
    const recorder = createRecorder();
    const request = new EventEmitter() as unknown as ClientRequest;

    logConnection(request, { host: 'catfact.ninja', port: 443, isHttps: false }, { log: recorder.log, proxyModeMessage: PROXY_MODE_MESSAGE });

    request.emit('socket', Object.assign(new EventEmitter(), { connecting: false }));

    expect(recorder.messages()).toEqual([]);
  });

  it('sends over the module the request options ask for, not the one the URL implies', () => {
    const recorder = createRecorder();
    const transport = createConnectionLoggingTransport({ log: recorder.log, proxyModeMessage: PROXY_MODE_MESSAGE });
    const httpSpy = vi.spyOn(http, 'request').mockReturnValue(createClientRequest());
    const httpsSpy = vi.spyOn(https, 'request').mockReturnValue(createClientRequest());

    try {
      // What axios passes for an https request through an http proxy.
      transport.request({ protocol: 'http:', host: 'proxy.local', port: 8080, path: 'https://api.example.com/x' });
      expect(httpSpy).toHaveBeenCalledTimes(1);
      expect(httpsSpy).not.toHaveBeenCalled();
      expect(recorder.messages()).not.toContain('SSL validation: enabled');

      transport.request({ protocol: 'https:', host: 'api.example.com', port: 443, path: '/x' });
      expect(httpsSpy).toHaveBeenCalledTimes(1);
      expect(recorder.messages()).toContain('SSL validation: enabled');
    } finally {
      httpSpy.mockRestore();
      httpsSpy.mockRestore();
    }
  });

  it('stops logging once the request is over, so a kept-alive socket cannot write to it later', () => {
    const recorder = createRecorder();
    const request = new EventEmitter() as unknown as ClientRequest;

    logConnection(request, { host: 'catfact.ninja', port: 443, isHttps: false }, { log: recorder.log, proxyModeMessage: PROXY_MODE_MESSAGE });

    const socket = createConnectingSocket();
    // Without another listener, `emit('error')` would throw.
    socket.on('error', () => undefined);

    request.emit('socket', socket);
    expect(socket.listenerCount('error')).toBe(2);

    request.emit('close');
    socket.emit('error', new Error('connect ECONNRESET'));

    expect(recorder.messages()).toEqual(['Trying catfact.ninja:443...']);
    expect(socket.listenerCount('error')).toBe(1);
  });

  it('aborts a request whose connect phase outlives the timeout', async () => {
    vi.useFakeTimers();
    const recorder = createRecorder();
    const transport = createConnectionLoggingTransport({ log: recorder.log, proxyModeMessage: PROXY_MODE_MESSAGE, timeout: 1_000 });
    const stalled = createClientRequest({}, { destroy: vi.fn() }) as unknown as ClientRequest & { destroy: Mock };
    const httpSpy = vi.spyOn(http, 'request').mockReturnValue(stalled);

    try {
      transport.request({ protocol: 'http:', host: 'stalled.invalid', port: 80, path: '/' });
      vi.advanceTimersByTime(1_000);

      expect(stalled.destroy).toHaveBeenCalledTimes(1);
      const error = stalled.destroy.mock.calls[0][0] as AxiosError;
      expect(error.code).toBe(AxiosError.ECONNABORTED);
      expect(error.message).toBe('timeout of 1000ms exceeded');
    } finally {
      httpSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('does not abort once the response has started', () => {
    vi.useFakeTimers();
    const recorder = createRecorder();
    const transport = createConnectionLoggingTransport({ log: recorder.log, proxyModeMessage: PROXY_MODE_MESSAGE, timeout: 1_000 });
    const responded = createClientRequest({}, { destroy: vi.fn() });
    const httpSpy = vi.spyOn(http, 'request').mockImplementation(((_options: unknown, callback: () => void) => {
      setTimeout(callback, 10);
      return responded;
    }) as never);

    try {
      transport.request({ protocol: 'http:', host: 'slow.invalid', port: 80, path: '/' });
      vi.advanceTimersByTime(2_000);

      expect(responded.destroy).not.toHaveBeenCalled();
    } finally {
      httpSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('logs DNS and socket failures', () => {
    const recorder = createRecorder();
    const request = new EventEmitter() as unknown as ClientRequest;

    logConnection(request, { host: 'nope.invalid', port: 443, isHttps: false }, { log: recorder.log, proxyModeMessage: PROXY_MODE_MESSAGE });

    const socket = createConnectingSocket();
    request.emit('socket', socket);
    socket.emit('lookup', new Error('getaddrinfo ENOTFOUND nope.invalid'), undefined, undefined, 'nope.invalid');
    socket.emit('error', new Error('connect ECONNREFUSED'));

    expect(recorder.entries.filter((entry) => entry.type === 'error').map((entry) => entry.message)).toEqual([
      'DNS lookup error for nope.invalid: getaddrinfo ENOTFOUND nope.invalid',
      'Socket error: connect ECONNREFUSED'
    ]);
  });
});

describe('logRequestHeaders', () => {
  it('logs the headers in the order and casing they are written in', () => {
    const recorder = createRecorder();

    logRequestHeaders(createClientRequest({
      'Content-Type': 'application/json',
      'Content-Length': '14',
      Host: 'api.example.com'
    }), recorder.log);

    expect(recorder.entries).toEqual([
      { type: 'requestHeader', message: 'Content-Type: application/json' },
      { type: 'requestHeader', message: 'Content-Length: 14' },
      { type: 'requestHeader', message: 'Host: api.example.com' },
      { type: 'requestHeader', message: 'Connection: keep-alive' }
    ]);
  });

  it('reports the connection Node will ask for when the request does not set one', () => {
    const recorder = createRecorder();

    logRequestHeaders(createClientRequest({}, { shouldKeepAlive: false }), recorder.log);

    expect(recorder.messages()).toEqual(['Connection: close']);
  });

  it('keeps a Connection header the request set itself', () => {
    const recorder = createRecorder();

    logRequestHeaders(createClientRequest({ Connection: 'upgrade' }), recorder.log);

    expect(recorder.messages()).toEqual(['Connection: upgrade']);
  });

  it('masks the proxy credential and leaves the credentials the user set alone', () => {
    const recorder = createRecorder();

    logRequestHeaders(createClientRequest({
      'Proxy-Authorization': 'Basic cHJveHl1c2VyOnN1cDNyczNjcmV0',
      Authorization: 'Bearer user-token',
      Cookie: 'session=abc'
    }), recorder.log);

    expect(recorder.messages()).toEqual([
      `Proxy-Authorization: ${'*'.repeat('Basic cHJveHl1c2VyOnN1cDNyczNjcmV0'.length)}`,
      'Authorization: Bearer user-token',
      'Cookie: session=abc',
      'Connection: keep-alive'
    ]);
  });
});
