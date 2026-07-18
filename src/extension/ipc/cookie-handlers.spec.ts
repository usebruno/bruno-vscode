/**
 * Tests for the cookie IPC handlers.
 * Verifies that the handlers correctly bridge the webview to the cookie jar.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { cookieJar, getCookiesForUrl, getCookieStringForUrl } from '../utils/cookies';

// Access the shared @usebruno/requests cookie functions
// eslint-disable-next-line @typescript-eslint/no-var-requires
const brunoCookies = require('@usebruno/requests').cookies;

const TEST_URL = 'http://127.0.0.1:8081';
const TEST_DOMAIN = '127.0.0.1';

// Clear the cookie jar before each test
beforeEach(async () => {
  await cookieJar.removeAllCookies();
});

describe('Cookie Jar Operations', () => {

  test('addCookieToJar stores a cookie and getCookiesForUrl retrieves it', () => {
    brunoCookies.addCookieToJar('session=abc123; Path=/', TEST_URL);

    const cookies = getCookiesForUrl(TEST_URL);
    expect(cookies.length).toBe(1);
    expect(cookies[0].key).toBe('session');
    expect(cookies[0].value).toBe('abc123');
  });

  test('getCookieStringForUrl returns Cookie header format', () => {
    brunoCookies.addCookieToJar('token=xyz; Path=/', TEST_URL);

    const cookieString = getCookieStringForUrl(TEST_URL);
    expect(cookieString).toContain('token=xyz');
  });

  test('multiple cookies are stored and retrieved', () => {
    brunoCookies.addCookieToJar('a=1; Path=/', TEST_URL);
    brunoCookies.addCookieToJar('b=2; Path=/', TEST_URL);
    brunoCookies.addCookieToJar('c=3; Path=/', TEST_URL);

    const cookies = getCookiesForUrl(TEST_URL);
    expect(cookies.length).toBe(3);

    const names = cookies.map((c: any) => c.key).sort();
    expect(names).toEqual(['a', 'b', 'c']);
  });

  test('deleteCookie removes a specific cookie', async () => {
    brunoCookies.addCookieToJar('keep=yes; Path=/', TEST_URL);
    brunoCookies.addCookieToJar('remove=no; Path=/', TEST_URL);

    await brunoCookies.deleteCookie(TEST_DOMAIN, '/', 'remove');

    const cookies = getCookiesForUrl(TEST_URL);
    expect(cookies.length).toBe(1);
    expect(cookies[0].key).toBe('keep');
  });

  test('deleteCookiesForDomain removes all cookies for a domain', async () => {
    brunoCookies.addCookieToJar('a=1; Path=/', TEST_URL);
    brunoCookies.addCookieToJar('b=2; Path=/', TEST_URL);

    await brunoCookies.deleteCookiesForDomain(TEST_DOMAIN);

    const cookies = getCookiesForUrl(TEST_URL);
    expect(cookies.length).toBe(0);
  });

  test('addCookieForDomain adds a cookie object', async () => {
    await brunoCookies.addCookieForDomain(TEST_DOMAIN, {
      key: 'custom',
      value: 'data',
      path: '/',
      domain: TEST_DOMAIN
    });

    const cookies = getCookiesForUrl(TEST_URL);
    expect(cookies.length).toBe(1);
    expect(cookies[0].key).toBe('custom');
    expect(cookies[0].value).toBe('data');
  });

  test('modifyCookieForDomain updates a cookie value', async () => {
    await brunoCookies.addCookieForDomain(TEST_DOMAIN, {
      key: 'token',
      value: 'old-value',
      path: '/',
      domain: TEST_DOMAIN
    });

    await brunoCookies.modifyCookieForDomain(
      TEST_DOMAIN,
      { key: 'token', value: 'old-value', path: '/', domain: TEST_DOMAIN },
      { key: 'token', value: 'new-value', path: '/', domain: TEST_DOMAIN }
    );

    const cookies = getCookiesForUrl(TEST_URL);
    expect(cookies.length).toBe(1);
    expect(cookies[0].value).toBe('new-value');
  });

  test('parseCookieString parses a Set-Cookie header', () => {
    const parsed = brunoCookies.parseCookieString('session=abc; Path=/; HttpOnly; Secure');
    expect(parsed).not.toBeNull();
    expect(parsed.key).toBe('session');
    expect(parsed.value).toBe('abc');
    expect(parsed.httpOnly).toBe(true);
    expect(parsed.secure).toBe(true);
  });

  test('getDomainsWithCookies returns grouped cookies', async () => {
    brunoCookies.addCookieToJar('a=1; Path=/', TEST_URL);
    brunoCookies.addCookieToJar('b=2; Path=/', 'http://example.com');

    const domains = await brunoCookies.getDomainsWithCookies();
    expect(domains.length).toBeGreaterThanOrEqual(2);

    const domainNames = domains.map((d: any) => d.domain);
    expect(domainNames).toContain(TEST_DOMAIN);
    expect(domainNames).toContain('example.com');
  });
});
