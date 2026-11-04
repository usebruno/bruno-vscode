import { beforeEach, describe, expect, it } from 'vitest';
import { CookiesStore, setExtensionContext } from './cookies';
import { addCookieToJar, cookieJar, getCookieStringForUrl } from '../utils/cookies';

const createContext = (state: Record<string, unknown> = {}) => ({
  globalState: {
    get: <T>(key: string, defaultValue?: T) => (key in state ? (state[key] as T) : defaultValue),
    update: (key: string, value: unknown) => {
      state[key] = value;
      return Promise.resolve();
    }
  },
  state
});

describe('cookie jar persistence', () => {
  beforeEach(() => {
    cookieJar.removeAllCookies();
  });

  it('restores stored cookies into the jar on the next session', () => {
    const context = createContext();

    setExtensionContext(context as never);
    const firstSession = new CookiesStore();
    firstSession.initializeCookies();
    addCookieToJar('XSRF-TOKEN=first-token; Path=/', 'https://catfact.ninja/breeds');
    firstSession.saveCookieJar(true);

    expect(getCookieStringForUrl('https://catfact.ninja/breeds')).toContain('XSRF-TOKEN=first-token');

    cookieJar.removeAllCookies();
    expect(getCookieStringForUrl('https://catfact.ninja/breeds')).toBe('');

    setExtensionContext(context as never);
    new CookiesStore().initializeCookies();

    expect(getCookieStringForUrl('https://catfact.ninja/breeds')).toContain('XSRF-TOKEN=first-token');
  });
});
