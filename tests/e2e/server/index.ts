/**
 * Unified test server for e2e tests.
 *
 * Mirrors the pattern from the main Bruno repo (packages/bruno-tests/src/index.js).
 * Playwright auto-starts this via the webServer config.
 *
 * Endpoints:
 *   GET  /ping                                    - Health check
 *   GET  /headers                                 - Echo request headers
 *   POST /api/echo/json                           - Echo JSON body
 *   *    /api/auth/oauth2/client_credentials/*     - Client credentials flow
 *   *    /api/auth/oauth2/password_credentials/*   - Password credentials flow
 *   *    /api/auth/oauth2/authorization_code/*     - Authorization code flow
 *   *    /api/auth/oauth2/implicit/*               - Implicit flow
 *   GET  /api/auth/oauth2/resource                - Protected resource (all flows)
 *   POST /api/auth/oauth2/refresh                 - Token refresh
 *   POST /api/auth/oauth2/reset                   - Reset all OAuth2 state
 */

import express from 'express';
import cors from 'cors';
import { oauth2Router } from './auth/oauth2';
import { cookieRouter } from './auth/cookie';

const app = express();
const port = process.env.PORT || 8081;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Core endpoints ---

app.get('/ping', (_req, res) => {
  res.send('pong');
});

app.get('/headers', (req, res) => {
  res.json(req.headers);
});

app.post('/api/echo/json', (req, res) => {
  res.json(req.body);
});

// --- Auth ---

app.use('/api/auth/oauth2', oauth2Router);
app.use('/api/auth/cookie', cookieRouter);

// --- Start ---

app.listen(port, () => {
  console.log(`[test-server] Listening on http://127.0.0.1:${port}`);
});
