/**
 * OAuth2 test endpoints for all 4 grant types + refresh + protected resource.
 *
 * Mirrors the main Bruno repo's test server pattern:
 *   packages/bruno-tests/src/auth/oauth2/clientCredentials.js
 *   packages/bruno-tests/src/auth/oauth2/passwordCredentials.js
 *   packages/bruno-tests/src/auth/oauth2/authorizationCode.js
 *
 * Default credentials:
 *   Client: client_id=test-client, client_secret=test-secret
 *   User:   username=testuser, password=testpass
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';

const router = Router();

// --- State ---

interface IssuedToken {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  clientId: string;
  scope?: string;
  username?: string;
  expiresIn: number;
  createdAt: number;
}

const clients = [
  { clientId: 'test-client', clientSecret: 'test-secret' },
  { clientId: 'public-client', clientSecret: '' }
];

const users = [
  { username: 'testuser', password: 'testpass' }
];

const tokens: IssuedToken[] = [];
const authCodes: Array<{
  code: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  codeChallenge?: string;
}> = [];

// --- Helpers ---

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function parseBasicAuth(authHeader?: string): { clientId: string; clientSecret: string } | null {
  if (!authHeader?.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
    const i = decoded.indexOf(':');
    if (i === -1) return null;
    return { clientId: decoded.substring(0, i), clientSecret: decoded.substring(i + 1) };
  } catch {
    return null;
  }
}

function extractClientCredentials(req: Request): { clientId: string | null; clientSecret: string | null } {
  // Try Authorization header first
  const basic = parseBasicAuth(req.headers.authorization);
  if (basic) return basic;
  // Fall back to body params
  return {
    clientId: req.body.client_id || null,
    clientSecret: req.body.client_secret ?? null
  };
}

function validateClient(clientId: string, clientSecret: string | null): boolean {
  const client = clients.find(c => c.clientId === clientId);
  if (!client) return false;
  // If client has a secret, it must match
  if (client.clientSecret && clientSecret !== client.clientSecret) return false;
  return true;
}

function issueTokens(clientId: string, scope?: string, username?: string): {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  id_token: string;
  scope?: string;
} {
  const accessToken = generateToken();
  const refreshToken = generateToken();
  const idToken = generateToken();

  tokens.push({
    accessToken,
    refreshToken,
    idToken,
    clientId,
    scope,
    username,
    expiresIn: 3600,
    createdAt: Date.now()
  });

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: refreshToken,
    id_token: idToken,
    ...(scope ? { scope } : {})
  };
}

function findTokenByAccess(token: string): IssuedToken | undefined {
  return tokens.find(t => t.accessToken === token);
}

function findTokenByRefresh(refreshToken: string): IssuedToken | undefined {
  return tokens.find(t => t.refreshToken === refreshToken);
}

function generateCodeChallenge(codeVerifier: string): string {
  return crypto.createHash('sha256')
    .update(codeVerifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// ─── Client Credentials ──────────────────────────────────────────────────────

router.post('/client_credentials/token', (req: Request, res: Response) => {
  const { clientId, clientSecret } = extractClientCredentials(req);
  const { grant_type, scope } = req.body;

  if (grant_type !== 'client_credentials') {
    res.status(400).json({ error: 'invalid_grant', error_description: 'Expected grant_type=client_credentials' });
    return;
  }
  if (!clientId || !validateClient(clientId, clientSecret)) {
    res.status(401).json({ error: 'invalid_client', error_description: 'Invalid client credentials' });
    return;
  }

  res.json(issueTokens(clientId, scope));
});

// ─── Password Credentials ────────────────────────────────────────────────────

router.post('/password_credentials/token', (req: Request, res: Response) => {
  const { clientId, clientSecret } = extractClientCredentials(req);
  const { grant_type, username, password, scope } = req.body;

  if (grant_type !== 'password') {
    res.status(400).json({ error: 'invalid_grant', error_description: 'Expected grant_type=password' });
    return;
  }
  if (!clientId || !validateClient(clientId, clientSecret)) {
    res.status(401).json({ error: 'invalid_client', error_description: 'Invalid client credentials' });
    return;
  }
  if (!username || !password) {
    res.status(400).json({ error: 'invalid_request', error_description: 'username and password are required' });
    return;
  }

  const user = users.find(u => u.username === username && u.password === password);
  if (!user) {
    res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid username or password' });
    return;
  }

  res.json(issueTokens(clientId, scope, username));
});

// ─── Authorization Code ──────────────────────────────────────────────────────

router.get('/authorization_code/authorize', (req: Request, res: Response) => {
  const { response_type, client_id, redirect_uri, scope, state, code_challenge } = req.query as Record<string, string>;

  if (response_type !== 'code') {
    res.status(400).json({ error: 'unsupported_response_type' });
    return;
  }
  if (!client_id || !clients.find(c => c.clientId === client_id)) {
    res.status(400).json({ error: 'invalid_client' });
    return;
  }
  if (!redirect_uri) {
    res.status(400).json({ error: 'invalid_request', error_description: 'redirect_uri is required' });
    return;
  }

  const code = crypto.randomBytes(16).toString('hex');
  authCodes.push({ code, clientId: client_id, redirectUri: redirect_uri, scope, codeChallenge: code_challenge });

  // Auto-approve: redirect immediately with code (no user interaction needed for e2e)
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set('code', code);
  if (state) redirectUrl.searchParams.set('state', state);

  res.redirect(302, redirectUrl.toString());
});

router.post('/authorization_code/token', (req: Request, res: Response) => {
  const { clientId, clientSecret } = extractClientCredentials(req);
  const { grant_type, code, redirect_uri, code_verifier } = req.body;

  if (grant_type !== 'authorization_code') {
    res.status(400).json({ error: 'invalid_grant', error_description: 'Expected grant_type=authorization_code' });
    return;
  }
  if (!clientId || !validateClient(clientId, clientSecret)) {
    res.status(401).json({ error: 'invalid_client', error_description: 'Invalid client credentials' });
    return;
  }
  if (!code) {
    res.status(400).json({ error: 'invalid_request', error_description: 'code is required' });
    return;
  }

  const idx = authCodes.findIndex(a => a.code === code && a.clientId === clientId);
  if (idx === -1) {
    res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid or expired authorization code' });
    return;
  }

  const stored = authCodes[idx];
  // Single-use: remove the code
  authCodes.splice(idx, 1);

  if (redirect_uri && stored.redirectUri !== redirect_uri) {
    res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
    return;
  }

  // PKCE validation
  if (stored.codeChallenge) {
    if (!code_verifier) {
      res.status(400).json({ error: 'invalid_request', error_description: 'code_verifier is required for PKCE' });
      return;
    }
    if (generateCodeChallenge(code_verifier) !== stored.codeChallenge) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE code_verifier validation failed' });
      return;
    }
  }

  res.json(issueTokens(clientId, stored.scope));
});

// ─── Implicit ────────────────────────────────────────────────────────────────

router.get('/implicit/authorize', (req: Request, res: Response) => {
  const { response_type, client_id, redirect_uri, scope, state } = req.query as Record<string, string>;

  if (response_type !== 'token') {
    res.status(400).json({ error: 'unsupported_response_type' });
    return;
  }
  if (!client_id || !clients.find(c => c.clientId === client_id)) {
    res.status(400).json({ error: 'invalid_client' });
    return;
  }
  if (!redirect_uri) {
    res.status(400).json({ error: 'invalid_request', error_description: 'redirect_uri is required' });
    return;
  }

  const tokenData = issueTokens(client_id, scope);

  // Redirect with token in fragment
  const fragment = new URLSearchParams({
    access_token: tokenData.access_token,
    token_type: tokenData.token_type,
    expires_in: String(tokenData.expires_in),
    ...(scope ? { scope } : {}),
    ...(state ? { state } : {})
  });

  res.redirect(302, `${redirect_uri}#${fragment.toString()}`);
});

// ─── Token Refresh (shared across all flows) ─────────────────────────────────

router.post('/refresh', (req: Request, res: Response) => {
  const { clientId, clientSecret } = extractClientCredentials(req);
  const { grant_type, refresh_token } = req.body;

  if (grant_type !== 'refresh_token') {
    res.status(400).json({ error: 'invalid_grant', error_description: 'Expected grant_type=refresh_token' });
    return;
  }
  if (!clientId || !validateClient(clientId, clientSecret)) {
    res.status(401).json({ error: 'invalid_client' });
    return;
  }
  if (!refresh_token) {
    res.status(400).json({ error: 'invalid_request', error_description: 'refresh_token is required' });
    return;
  }

  const stored = findTokenByRefresh(refresh_token);
  if (!stored) {
    res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid refresh token' });
    return;
  }

  // Invalidate old token
  const idx = tokens.indexOf(stored);
  if (idx !== -1) tokens.splice(idx, 1);

  // Issue new tokens
  res.json(issueTokens(clientId, stored.scope, stored.username));
});

// ─── Protected Resource (shared) ─────────────────────────────────────────────

router.get('/resource', (req: Request, res: Response) => {
  // Accept token from Bearer header or query param
  let token: string | null = null;
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    token = auth.slice(7);
  } else if (auth?.startsWith('Token ')) {
    token = auth.slice(6);
  }
  if (!token) {
    token = (req.query.access_token || req.query.token || req.query.api_token) as string | null;
  }

  if (!token) {
    res.status(401).json({ error: 'unauthorized', message: 'No access token provided' });
    return;
  }

  const issued = findTokenByAccess(token);
  if (!issued) {
    res.status(401).json({ error: 'invalid_token', message: 'Invalid or expired access token' });
    return;
  }

  res.json({
    resource: { name: issued.username || 'service', email: `${issued.username || 'service'}@test.local` },
    client_id: issued.clientId,
    scope: issued.scope || null
  });
});

// ─── Userinfo ────────────────────────────────────────────────────────────────

router.get('/userinfo', (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const issued = findTokenByAccess(auth.slice(7));
  if (!issued) {
    res.status(401).json({ error: 'invalid_token' });
    return;
  }

  res.json({
    sub: issued.username || issued.clientId,
    name: issued.username || 'Service Account',
    email: issued.username ? `${issued.username}@test.local` : null
  });
});

// ─── Reset (for test isolation) ──────────────────────────────────────────────

router.post('/reset', (_req: Request, res: Response) => {
  tokens.length = 0;
  authCodes.length = 0;
  res.json({ message: 'OAuth2 state reset' });
});

export { router as oauth2Router };
