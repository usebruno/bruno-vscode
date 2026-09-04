/**
 * mTLS test servers — every endpoint requires a valid client certificate.
 *
 *   HTTPS + WSS : https://localhost:8083   (wss://localhost:8083)
 *   gRPC (TLS)  : grpcs://localhost:8084    service echo.EchoService/Echo
 */

import * as fs from 'fs';
import * as https from 'https';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { WebSocketServer } from 'ws';
import { CA_CERT, SERVER_CERT, SERVER_KEY, generateCerts } from './mtls-certs';
import { GRPC_PROTO_PATH } from '../../../server/grpc';

/** Describe the client certificate the peer presented. */
const peerInfo = (socket: any) => {
  const cert = socket.getPeerCertificate?.();
  if (!cert || !Object.keys(cert).length) return { clientCertPresented: false };
  return {
    clientCertPresented: true,
    subjectCN: cert.subject?.CN,
    issuerCN: cert.issuer?.CN
  };
};

/** HTTPS + WSS on one port, both requiring a client certificate. */
export function startMtlsServer(port: number): https.Server {
  generateCerts();

  const server = https.createServer(
    {
      cert: fs.readFileSync(SERVER_CERT),
      key: fs.readFileSync(SERVER_KEY),
      ca: fs.readFileSync(CA_CERT),
      requestCert: true,
      rejectUnauthorized: true
    },
    (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, ...peerInfo(req.socket) }));
    }
  );

  // Websocket echo server, sharing the HTTPS server and requiring a client certificate.
  const wss = new WebSocketServer({ server });
  wss.on('connection', (socket, req) => {
    socket.send(JSON.stringify({ type: 'welcome', ...peerInfo(req.socket) }));
    socket.on('message', (data) => {
      socket.send(JSON.stringify({ type: 'echo', message: data.toString() }));
    });
  });

  server.on('tlsClientError', (err) => {
    console.log(`[mtls-server] rejected TLS client: ${err.message}`);
  });

  server.listen(port, () => {
    console.log(`[mtls-server] Listening on https://localhost:${port} (wss - wss://localhost:8083)`);
  });

  return server;
}

/** GRPC server with mTLS */
export function startMtlsGrpcServer(port: number): grpc.Server {
  generateCerts();

  const packageDef = protoLoader.loadSync(GRPC_PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
  const proto = grpc.loadPackageDefinition(packageDef) as any;

  const server = new grpc.Server();
  server.addService(proto.echo.EchoService.service, {
    Echo: (call: any, callback: any) => {
      callback(null, { message: `${call.request.message} (mTLS ok)` });
    }
  });

  // The trailing `true` is checkClientCertificate — the cert is REQUIRED and verified against `ca`.
  const credentials = grpc.ServerCredentials.createSsl(
    fs.readFileSync(CA_CERT),
    [{ private_key: fs.readFileSync(SERVER_KEY), cert_chain: fs.readFileSync(SERVER_CERT) }],
    true
  );

  server.bindAsync(`localhost:${port}`, credentials, (err) => {
    if (err) {
      console.error('[mtls-grpc-server] failed to bind:', err.message);
      return;
    }
    console.log(`[mtls-grpc-server] Listening on grpcs://localhost:${port}`);
  });

  return server;
}
