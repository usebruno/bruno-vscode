/**
 * Unified test server for e2e tests.
 *
 * Endpoints:
 *   GET  /ping                                    - Health check
 *   GET  /headers                                 - Echo request headers
 *   POST /raw-body                                - Record the raw request body as received
 *   GET  /get-raw-body                            - Read back the last recorded raw body
 *   POST /api/echo/json                           - Echo JSON body
 *   *    /api/echo/query                           - Echo query params as a flat object
 *   *    /api/echo/header                          - Echo the `x-prompt-header` header value
 *   *    /api/echo/auth                            - Echo the `authorization` header value
 *   *    /api/auth/oauth2/client_credentials/*     - Client credentials flow
 *   *    /api/auth/oauth2/password_credentials/*   - Password credentials flow
 *   *    /api/auth/oauth2/authorization_code/*     - Authorization code flow
 *   *    /api/auth/oauth2/implicit/*               - Implicit flow
 *   GET  /api/auth/oauth2/resource                - Protected resource (all flows)
 *   POST /api/auth/oauth2/refresh                 - Token refresh
 *   POST /api/auth/oauth2/reset                   - Reset all OAuth2 state
 *   ws://…/<path>                                  - WebSocket echo (sends a welcome
 *                                                    message containing the connected
 *                                                    path, then echoes every message)
 *
 * The echo endpoints deliberately return SMALL objects with the value of interest at
 * the TOP LEVEL of the JSON so assertions stay robust regardless of how the Bruno
 * response pane renders the body (CodeMirror editor vs. collapsed JSON tree).
 */

import express from 'express';
import cors from 'cors';
import * as http from 'http';
import { WebSocketServer } from 'ws';
import { oauth2Router } from './auth/oauth2';
import { startGrpcServer } from './grpc';
import { startMtlsServer, startMtlsGrpcServer } from '../ssl/client-certificate/server';
import { MTLS_PORT, MTLS_GRPC_PORT } from '../ssl/client-certificate/server/mtls-certs';

const app = express();
const port = Number(process.env.PORT) || 8081;
// gRPC port; default to the HTTP port + 1.
const grpcPort = Number(process.env.GRPC_PORT) || port + 1;

app.use(cors());

// Records the body as received.
let lastRawBody: { contentType: string | null; body: string } = { contentType: null, body: '' };
app.post('/raw-body', express.raw({ type: '*/*' }), (req, res) => {
  lastRawBody = {
    contentType: (req.headers['content-type'] as string) ?? null,
    // A request with no body at all never reaches express.raw, leaving req.body unset
    body: Buffer.isBuffer(req.body) ? req.body.toString('utf8') : ''
  };
  res.json({ ok: true });
});
app.get('/get-raw-body', (_req, res) => {
  res.json(lastRawBody);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Core endpoints ---

app.get('/ping', (_req, res) => {
  res.send('pong');
});

app.get('/headers', (req, res) => {
  res.json(req.headers);
});

// Capture a header so e2e tests can assert (from Node) exactly what the extension SENT — used to
// verify pre-request scripts ran and variables interpolated, without relying on the response UI.
let lastCapturedToken: string | undefined;
app.get('/capture', (req, res) => {
  lastCapturedToken = req.headers['x-token'] as string | undefined;
  res.json({ ok: true });
});
app.get('/last-capture', (_req, res) => {
  res.json({ token: lastCapturedToken ?? null });
});

// Minimal HTML page (with a relative asset) to exercise the HTML response preview's <base href>.
app.get('/htmlpage', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send('<html><head><title>t</title></head><body><img src="logo.png"/>hello</body></html>');
});

app.get('/htmlpage-autofocus', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send('<html><head><title>t</title></head><body><input id="focustrap" autofocus /></body></html>');
});

app.post('/api/echo/json', (req, res) => {
  res.json(req.body);
});

// Echo query params back as a flat, top-level object.
app.all('/api/echo/query', (req, res) => {
  res.json(req.query);
});

// Echo a single probe header so header interpolation is easy to assert at the top level.
app.all('/api/echo/header', (req, res) => {
  res.json({ value: req.headers['x-prompt-header'] ?? '' });
});

// Echo the Authorization header so bearer-auth interpolation is easy to assert.
app.all('/api/echo/auth', (req, res) => {
  res.json({ authorization: req.headers['authorization'] ?? '' });
});

// --- Auth ---

app.use('/api/auth/oauth2', oauth2Router);

// --- Start ---

const server = http.createServer(app);

// WebSocket echo server, sharing the HTTP server and accepting any path.
const wss = new WebSocketServer({ server });
wss.on('connection', (socket, req) => {
  // On connect, echo back the handshake path / header / auth.
  socket.send(JSON.stringify({
    type: 'welcome',
    path: req.url,
    header: req.headers['x-prompt-header'] ?? '',
    authorization: req.headers['authorization'] ?? ''
  }));
  // Echo every subsequent message straight back.
  socket.on('message', (data) => {
    socket.send(JSON.stringify({ type: 'echo', message: data.toString() }));
  });
});

server.listen(port, () => {
  console.log(`[test-server] Listening on http://127.0.0.1:${port}`);
});

// gRPC echo server.
startGrpcServer(grpcPort);

// mTLS servers — every request requires a client certificate.
startMtlsServer(MTLS_PORT);
startMtlsGrpcServer(MTLS_GRPC_PORT);
