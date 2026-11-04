import http from 'http';
import https from 'https';
import { AxiosError } from 'axios';
import type { ClientRequest, RequestOptions } from 'http';
import type { PeerCertificate, TLSSocket } from 'tls';
import type { Socket } from 'net';
import type { NetworkLogEntry } from '@bruno-types';
import type { CACertificatesCount } from './cert-utils';

type LogEntry = (type: NetworkLogEntry['type'], message: string) => void;

export interface ConnectionLogOptions {
  log: LogEntry;
  timeout?: number;
  caCertificatesCount?: Partial<CACertificatesCount>;
  proxyModeMessage: string;
  /** Set on every https request, since VS Code's proxy agent drops the ones set on the agent. */
  tlsOptions?: https.AgentOptions;
}

export const sslValidationMessage = (rejectUnauthorized?: boolean): string =>
  `SSL validation: ${rejectUnauthorized === false ? 'disabled' : 'enabled'}`;

interface ConnectionTarget {
  host: string;
  port: number;
  isHttps: boolean;
}

// Node sends no ALPN extension unless asked; this is what gets reported as offered.
const DEFAULT_ALPN_PROTOCOLS = ['h2', 'http/1.1'];

const MASK_CHAR = '*';

/** Proxy credentials are put on the request by axios, not by the user, so the name is logged and the value never is. */
const maskProxyCredential = (name: string, value: string): string =>
  name.toLowerCase() === 'proxy-authorization' ? MASK_CHAR.repeat(value.length) : value;

const formatDistinguishedName = (fields: Record<string, string | string[]>): string =>
  Object.entries(fields).map(([key, value]) => `${key}=${value}`).join(', ');

const logSecureConnection = (socket: TLSSocket, log: LogEntry): void => {
  const protocol = socket.getProtocol?.() || 'SSL/TLS';
  const cipher = socket.getCipher?.();
  log('tls', `SSL connection using ${protocol} / ${cipher ? `${cipher.name} (${cipher.version})` : 'Unknown cipher'}`);
  log('tls', `ALPN: server accepted ${socket.alpnProtocol || 'None'}`);

  const certificate = socket.getPeerCertificate?.(true) as PeerCertificate | undefined;
  if (!certificate) {
    return;
  }

  log('tls', 'Server certificate:');
  if (certificate.subject) {
    log('tls', ` subject: ${formatDistinguishedName(certificate.subject as unknown as Record<string, string>)}`);
  }
  if (certificate.valid_from) {
    log('tls', ` start date: ${certificate.valid_from}`);
  }
  if (certificate.valid_to) {
    log('tls', ` expire date: ${certificate.valid_to}`);
  }
  if (certificate.subjectaltname) {
    log('tls', ` subjectAltName: ${certificate.subjectaltname}`);
  }
  if (certificate.issuer) {
    log('tls', ` issuer: ${formatDistinguishedName(certificate.issuer as unknown as Record<string, string>)}`);
  }

  log('tls', socket.authorized !== false
    ? 'SSL certificate verify ok.'
    : 'SSL certificate verification skipped (rejectUnauthorized: false).');
};

/**
 * The axios config a request interceptor sees is not yet the wire set: `Content-Length` and
 * `Accept-Encoding` are added by the http adapter and `Host` by Node, so the headers are read back off
 * the request instead. `getRawHeaderNames` keeps the casing and the order they are written in.
 */
export const logRequestHeaders = (request: ClientRequest, log: LogEntry): void => {
  const names = request.getRawHeaderNames();
  names.forEach((name) => log('requestHeader', `${name}: ${maskProxyCredential(name, String(request.getHeader(name)))}`));

  // Node writes this one straight into the header block from the agent, never through setHeader.
  if (!names.some((name) => name.toLowerCase() === 'connection')) {
    log('requestHeader', `Connection: ${request.shouldKeepAlive ? 'keep-alive' : 'close'}`);
  }
};

/**
 * VS Code's proxy agent drops the `agent` an extension passes for any non-localhost request, so these
 * events are read off the request's own socket rather than from a custom agent.
 */
export const logConnection = (
  request: ClientRequest,
  { host, port, isHttps }: ConnectionTarget,
  { log, tlsOptions, caCertificatesCount }: ConnectionLogOptions
): void => {
  if (isHttps) {
    log('info', sslValidationMessage(tlsOptions?.rejectUnauthorized));
  }

  request.on('socket', (socket: Socket) => {
    // A pooled socket is already connected and emits none of the events below.
    if (!socket.connecting) {
      return;
    }

    if (isHttps) {
      log('tls', `ALPN: offers ${DEFAULT_ALPN_PROTOCOLS.join(', ')}`);
      const { root = 0, system = 0, extra = 0, custom = 0 } = caCertificatesCount || {};
      log('tls', `CA Certificates: ${root} root, ${system} system, ${extra} extra, ${custom} custom`);
    }
    log('info', `Trying ${host}:${port}...`);

    const onLookup = (error: Error | null, address: string, _family: unknown, lookupHost: string) => {
      log(error ? 'error' : 'info', error
        ? `DNS lookup error for ${lookupHost}: ${error.message}`
        : `DNS lookup: ${lookupHost} -> ${address}`);
    };
    const onConnect = () => {
      log('info', `Connected to ${host} (${socket.remoteAddress || host}) port ${socket.remotePort || port}`);
    };
    const onSecureConnect = () => logSecureConnection(socket as TLSSocket, log);
    const onError = (error: Error) => log('error', `Socket error: ${error.message}`);

    socket.on('lookup', onLookup);
    socket.on('connect', onConnect);
    socket.on('secureConnect', onSecureConnect);
    socket.on('error', onError);

    // A kept-alive socket outlives the request; late events must not reach a finished timeline.
    request.once('close', () => {
      socket.off('lookup', onLookup);
      socket.off('connect', onConnect);
      socket.off('secureConnect', onSecureConnect);
      socket.off('error', onError);
    });
  });
};

/**
 * axios arms this timer only for its own transport and, like the desktop app's `timeout`, lets it run
 * until the response starts rather than stopping it at connect. Substituting the transport has to bring
 * the same timer along, or `timeout` would stop covering a request that hangs before any data arrives.
 */
const armRequestTimeout = (request: ClientRequest, timeout: number): (() => void) => {
  const timer = setTimeout(() => {
    request.destroy(new AxiosError(`timeout of ${timeout}ms exceeded`, AxiosError.ECONNABORTED));
  }, timeout);
  const clear = () => clearTimeout(timer);
  request.once('close', clear);
  return clear;
};

/** Sending still goes through the stock http/https module, so proxy and TLS behaviour are untouched. */
export const createConnectionLoggingTransport = (options: ConnectionLogOptions) => ({
  request: (requestOptions: RequestOptions, callback?: (response: http.IncomingMessage) => void): ClientRequest => {
    // axios rewrites the protocol to the proxy's, so follow the options, not the request URL.
    const isHttps = (requestOptions.protocol || '').startsWith('https');
    const transport = isHttps ? https : http;

    let clearRequestTimeout: (() => void) | undefined;
    const sendOptions = isHttps ? { ...requestOptions, ...options.tlsOptions } : requestOptions;
    const request = transport.request(sendOptions, (response) => {
      clearRequestTimeout?.();
      callback?.(response);
    });
    if (options.timeout && options.timeout > 0) {
      clearRequestTimeout = armRequestTimeout(request, options.timeout);
    }

    logRequestHeaders(request, options.log);

    // Sits between the header block and the connection trace, where the desktop app puts it.
    options.log('info', options.proxyModeMessage);

    const host = requestOptions.hostname || requestOptions.host;
    if (host && !requestOptions.socketPath) {
      logConnection(request, { host, port: Number(requestOptions.port) || (isHttps ? 443 : 80), isHttps }, options);
    }
    return request;
  }
});
