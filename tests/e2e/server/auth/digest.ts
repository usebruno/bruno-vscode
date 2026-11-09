/**
 * Digest auth test endpoint (RFC 7616, MD5, qop=auth).
 *
 * Credentials: username=bruno, password=della
 */

import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';

const router = Router();

const REALM = 'bruno';

const users: Record<string, string> = {
  bruno: 'della'
};

const md5 = (value: string) => crypto.createHash('md5').update(value).digest('hex');

function parseDigestHeader(header: string): Record<string, string> {
  const fields: Record<string, string> = {};
  // Drop the "Digest " prefix, then read each key=value pair; the value is either quoted (key="a, b") or bare (key=abc)
  for (const [, key, quoted, bare] of header.replace(/^Digest\s+/i, '').matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]*))/g)) {
    fields[key] = quoted ?? bare;
  }
  return fields;
}

function challenge(res: Response) {
  res.setHeader('WWW-Authenticate', `Digest realm="${REALM}", qop="auth", algorithm=MD5, nonce="${crypto.randomBytes(16).toString('hex')}"`);
  res.status(401).json({ error: 'Unauthorized' });
}

router.get('/protected', (req: Request, res: Response) => {
  const header = req.headers.authorization;
  if (!header?.toLowerCase().startsWith('digest ')) {
    return challenge(res);
  }

  const { username, nonce, nc, cnonce, qop, response } = parseDigestHeader(header);
  const password = users[username];
  if (!password) {
    return challenge(res);
  }

  const ha1 = md5(`${username}:${REALM}:${password}`);
  const ha2 = md5(`${req.method}:${req.originalUrl}`);
  const expected = md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);

  if (response !== expected) {
    return challenge(res);
  }
  res.json({ authenticated: true });
});

export { router as digestRouter };
