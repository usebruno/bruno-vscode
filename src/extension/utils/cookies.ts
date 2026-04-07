import { Cookie, CookieJar } from 'tough-cookie';
import moment from 'moment';
// This is critical: scripts use bru.cookies.jar() which uses this cookie jar internally
// We must use the SAME cookie jar so cookies set by scripts are visible when building request headers
// eslint-disable-next-line @typescript-eslint/no-var-requires
const brunoCookies = require('@usebruno/requests').cookies;

/** Input cookie object with optional date fields */
export interface CookieInput {
  key?: string;
  value?: string;
  domain?: string;
  path?: string;
  expires?: string | number | Date;
  creation?: string | number | Date;
  lastAccessed?: string | number | Date;
  hostOnly?: boolean;
  secure?: boolean;
  httpOnly?: boolean;
  [key: string]: unknown;
}

/** Cookie object with normalized date fields */
export interface NormalizedCookie extends Omit<CookieInput, 'expires' | 'creation' | 'lastAccessed'> {
  expires: Date | typeof Infinity;
  creation: Date;
  lastAccessed: Date;
}

/** Response headers that may contain cookies */
export interface ResponseHeaders {
  'set-cookie'?: string | string[];
  [key: string]: string | string[] | undefined;
}

// Use the shared cookie jar from @usebruno/requests
// This ensures scripts using bru.cookies.jar() and the extension's request building use the same jar
export const cookieJar: CookieJar = brunoCookies.cookieJar;

export const createCookieObj = (cookieObj: CookieInput): NormalizedCookie => {
  return {
    ...cookieObj,
    path: cookieObj.path,
    expires: cookieObj?.expires && moment(cookieObj.expires).isValid() ? new Date(cookieObj.expires) : Infinity,
    creation: cookieObj?.creation && moment(cookieObj.creation).isValid() ? new Date(cookieObj.creation) : new Date(),
    lastAccessed:
      cookieObj?.lastAccessed && moment(cookieObj.lastAccessed).isValid()
        ? new Date(cookieObj.lastAccessed)
        : new Date()
  };
};

export const createCookieString = (cookieObj: CookieInput): string => {
  const normalized = createCookieObj(cookieObj);
  const cookie = new Cookie();
  // Copy properties to the cookie instance
  Object.assign(cookie, normalized);
  let cookieString = cookie.toString();

  if (cookieObj.hostOnly && !cookieString.includes('Domain=')) {
    cookieString += `; Domain=${cookieObj.domain}`;
  }
  return cookieString;
};

// Use the @usebruno/requests addCookieToJar for consistency (uses loose: true)
export const addCookieToJar = (setCookieHeader: string, requestUrl: string): void => {
  brunoCookies.addCookieToJar(setCookieHeader, requestUrl);
};

// Use the @usebruno/requests getCookiesForUrl which handles secure cookies properly
export const getCookiesForUrl = (url: string): Cookie[] => {
  return brunoCookies.getCookiesForUrl(url);
};

// Use the @usebruno/requests getCookieStringForUrl for consistency
export const getCookieStringForUrl = (url: string): string => {
  return brunoCookies.getCookieStringForUrl(url);
};

// Use the @usebruno/requests saveCookies for consistency
export const saveCookies = (url: string, headers: ResponseHeaders): void => {
  brunoCookies.saveCookies(url, headers);
};

export const getDomainsWithCookies = brunoCookies.getDomainsWithCookies;

export const cookies = {
  cookieJar,
  addCookieToJar,
  getCookiesForUrl,
  getCookieStringForUrl,
  createCookieString,
  createCookieObj,
  saveCookies,
  getDomainsWithCookies
};
