/**
 * Cookie-based authentication test endpoints.
 *
 * Mirrors the main Bruno repo's test server pattern:
 *   packages/bruno-tests/src/auth/cookie.js
 *
 * Endpoints:
 *   POST /login      - Sets isAuthenticated cookie
 *   POST /logout     - Clears isAuthenticated cookie
 *   GET  /protected  - Requires isAuthenticated cookie
 *   GET  /set        - Sets custom cookies from query params
 *   GET  /echo       - Echoes back all received cookies
 */

import { Router, Request, Response } from 'express';
import cookieParser from 'cookie-parser';

const router = Router();

router.use(cookieParser());

function requireAuth(req: Request, res: Response, next: Function) {
  if (req.cookies.isAuthenticated === 'true') {
    next();
  } else {
    res.status(401).json({ message: 'Unauthorized' });
  }
}

// Login — sets the authentication cookie
router.post('/login', (_req: Request, res: Response) => {
  res.cookie('isAuthenticated', 'true');
  res.status(200).json({ message: 'Logged in successfully' });
});

// Logout — clears the authentication cookie
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('isAuthenticated');
  res.status(200).json({ message: 'Logged out successfully' });
});

// Protected route — requires isAuthenticated cookie
router.get('/protected', requireAuth, (_req: Request, res: Response) => {
  res.status(200).json({ message: 'Authentication successful' });
});

// Set custom cookies from query params (?name=value&name2=value2)
router.get('/set', (req: Request, res: Response) => {
  const { query } = req;
  for (const [name, value] of Object.entries(query)) {
    if (typeof value === 'string') {
      res.cookie(name, value);
    }
  }
  res.status(200).json({ message: 'Cookies set', cookies: query });
});

// Echo back all cookies received in the request
router.get('/echo', (req: Request, res: Response) => {
  res.status(200).json({ cookies: req.cookies });
});

export { router as cookieRouter };
