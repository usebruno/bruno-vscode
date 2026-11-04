/**
 * NTLM test server. Like IIS, it binds auth to the connection, so a handshake split across sockets
 * fails. Every request is recorded (per instance, one per spec) so tests can assert socket reuse.
 * `/redirect?to=<url>` redirects to the given URL after auth.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import type { AddressInfo, Socket } from 'net';
import { SERVER_CERT, SERVER_KEY, generateCerts } from '../../ssl/client-certificate/server/mtls-certs';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const md4 = require('js-md4') as { create: () => { update: (data: Buffer) => void; buffer: () => ArrayBuffer } };

const NEGOTIATE_UNICODE = 1;
const NEGOTIATE_NTLM2_KEY = 1 << 19;
const NEGOTIATE_TARGET_INFO = 1 << 23;

const HEADER_SCHEME = 'NTLM ';
const SIGNATURE = 'NTLMSSP\0';
const MESSAGE_TYPE_OFFSET = SIGNATURE.length;
const CHALLENGE_MESSAGE_TYPE = 2;
const TARGET_NAME_FIELDS_OFFSET = 12;
const NEGOTIATE_FLAGS_OFFSET = 20;
const SERVER_CHALLENGE_OFFSET = 24;
const TARGET_INFO_FIELDS_OFFSET = 40;
const HEADER_SIZE = 48;
const TARGET_INFO_TERMINATOR_SIZE = 4;
const NT_RESPONSE_OFFSET = 20;
const DOMAIN_OFFSET = 28;
const USERNAME_OFFSET = 36;
const PROOF_SIZE = 16;

type NtlmSocket = Socket & { ntlmSocketId?: number; ntlmChallenge?: Buffer };

export interface NtlmRequestRecord {
  socketId: number | undefined;
  type: number | null;
  url: string;
  body: string;
  headers: http.IncomingHttpHeaders;
  authenticated?: boolean;
}

export interface NtlmEndpoint {
  baseUrl: string;
  requests: NtlmRequestRecord[];
  messageTypesSeen: () => Array<number | null>;
  connectionsUsed: () => number;
  close: () => Promise<void>;
}

// Security buffer layout: length, max length (same value), offset of the data.
const writeSecurityBuffer = (message: Buffer, offset: number, { length, start }: { length: number; start: number }) => {
  message.writeUInt16LE(length, offset);
  message.writeUInt16LE(length, offset + 2);
  message.writeUInt32LE(start, offset + 4);
};

const readSecurityBuffer = (message: Buffer, offset: number) => {
  const length = message.readUInt16LE(offset);
  const start = message.readUInt32LE(offset + 4);
  return message.subarray(start, start + length);
};

// Builds the type 2 challenge; the caller stores the nonce on the socket so a proof can't be replayed on another connection.
const type2Message = (challenge: Buffer) => {
  const message = Buffer.alloc(HEADER_SIZE + TARGET_INFO_TERMINATOR_SIZE);

  message.write(SIGNATURE, 0, 'ascii');
  message.writeUInt32LE(CHALLENGE_MESSAGE_TYPE, MESSAGE_TYPE_OFFSET);
  writeSecurityBuffer(message, TARGET_NAME_FIELDS_OFFSET, { length: 0, start: HEADER_SIZE });
  message.writeUInt32LE(NEGOTIATE_UNICODE | NEGOTIATE_NTLM2_KEY | NEGOTIATE_TARGET_INFO, NEGOTIATE_FLAGS_OFFSET);
  challenge.copy(message, SERVER_CHALLENGE_OFFSET);
  writeSecurityBuffer(message, TARGET_INFO_FIELDS_OFFSET, { length: TARGET_INFO_TERMINATOR_SIZE, start: HEADER_SIZE });

  return `${HEADER_SCHEME}${message.toString('base64')}`;
};

const decodeHeader = (authorization: string | undefined) =>
  (authorization?.startsWith(HEADER_SCHEME) ? Buffer.from(authorization.slice(HEADER_SCHEME.length), 'base64') : null);

const messageType = (authorization: string | undefined): number | null => {
  const message = decodeHeader(authorization);

  if (!message || message.toString('ascii', 0, SIGNATURE.length) !== SIGNATURE) {
    return null;
  }

  return message.readUInt32LE(MESSAGE_TYPE_OFFSET);
};

const parseType3Message = (authorization: string) => {
  const message = decodeHeader(authorization)!;

  return {
    ntResponse: readSecurityBuffer(message, NT_RESPONSE_OFFSET),
    domain: readSecurityBuffer(message, DOMAIN_OFFSET).toString('ucs2'),
    username: readSecurityBuffer(message, USERNAME_OFFSET).toString('ucs2')
  };
};

const ntlmHashOf = (password: string) => {
  const hash = md4.create();
  hash.update(Buffer.from(password, 'ucs2'));
  return Buffer.from(hash.buffer());
};

// Recomputes the NTLMv2 proof (MS-NLMP 3.3.2) from the password so wrong credentials are rejected.
const isValidNtlmv2Response = (authorization: string, password: string, challenge: Buffer) => {
  const { ntResponse, domain, username } = parseType3Message(authorization);

  if (ntResponse.length <= PROOF_SIZE) {
    return false;
  }

  const proof = ntResponse.subarray(0, PROOF_SIZE);
  const blob = ntResponse.subarray(PROOF_SIZE);
  const ntlmv2Hash = crypto
    .createHmac('md5', ntlmHashOf(password))
    .update(Buffer.from(`${username.toUpperCase()}${domain}`, 'ucs2'))
    .digest();
  const expected = crypto
    .createHmac('md5', ntlmv2Hash)
    .update(Buffer.concat([challenge, blob]))
    .digest();

  return crypto.timingSafeEqual(proof, expected);
};

const readBody = (req: http.IncomingMessage) =>
  new Promise<string>((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
  });

const handleRequest = (password: string, requests: NtlmRequestRecord[]) =>
  async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const body = await readBody(req);
    const authorization = req.headers.authorization;
    const [pathname, query] = (req.url || '').split('?');
    const socket = req.socket as NtlmSocket;

    const record: NtlmRequestRecord = {
      socketId: socket.ntlmSocketId,
      type: messageType(authorization),
      url: req.url || '',
      body,
      headers: req.headers
    };
    requests.push(record);

    const challengeWith = (header: string) => {
      res.writeHead(401, { 'www-authenticate': header, 'content-length': 0 });
      res.end();
    };

    switch (record.type) {
      case 1: {
        const nonce = crypto.randomBytes(8);
        socket.ntlmChallenge = nonce;
        return challengeWith(type2Message(nonce));
      }
      case 3: {
        const nonce = socket.ntlmChallenge;
        record.authenticated = Boolean(nonce) && isValidNtlmv2Response(authorization!, password, nonce!);

        if (!record.authenticated) {
          return challengeWith('Negotiate, NTLM');
        }
        if (pathname === '/redirect') {
          res.writeHead(302, { 'location': new URLSearchParams(query).get('to') || '/', 'content-length': 0 });
          return res.end();
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ authenticated: true, url: pathname }));
      }
      default:
        return challengeWith('NTLM');
    }
  };

export const startNtlmServer = async ({ password = 'pass', host = '127.0.0.1', tls = false, port = 0 } = {}): Promise<NtlmEndpoint> => {
  const requests: NtlmRequestRecord[] = [];
  const sockets: Socket[] = [];
  const handler = handleRequest(password, requests);

  let listener: http.Server;
  if (tls) {
    generateCerts();
    listener = https.createServer({ key: fs.readFileSync(SERVER_KEY), cert: fs.readFileSync(SERVER_CERT) }, handler);
  } else {
    listener = http.createServer(handler);
  }

  let socketId = 0;
  // Over TLS, req.socket is the TLS socket, which only `secureConnection` provides.
  listener.on(tls ? 'secureConnection' : 'connection', (socket: NtlmSocket) => {
    socket.ntlmSocketId = ++socketId;
    sockets.push(socket);
  });

  await new Promise<void>((resolve) => listener.listen(port, host, resolve));
  const { port: boundPort } = listener.address() as AddressInfo;
  // IPv6 literals must be bracketed in URLs (RFC 3986).
  const urlHost = host.includes(':') ? `[${host}]` : host;

  return {
    baseUrl: `${tls ? 'https' : 'http'}://${urlHost}:${boundPort}`,
    requests,
    messageTypesSeen: () => requests.map((request) => request.type),
    connectionsUsed: () => new Set(requests.map((request) => request.socketId)).size,
    close: async () => {
      sockets.forEach((socket) => socket.destroy());
      await new Promise((resolve) => listener.close(resolve));
    }
  };
};
