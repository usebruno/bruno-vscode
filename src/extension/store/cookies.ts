import * as vscode from 'vscode';
import { Cookie } from 'tough-cookie';
import crypto from 'crypto';
import moment from 'moment';
import { encryptString, decryptString } from '../utils/encryption';
// Use the shared cookieJar from utils/cookies to ensure cookies are shared across the system
import { cookieJar, createCookieString, CookieInput } from '../utils/cookies';

/** Stored cookie with encrypted value */
interface StoredCookieInternal {
  key?: string;
  value: string;
  domain: string;
  path?: string;
  secure?: boolean;
  [key: string]: unknown;
}

const DEBOUNCE_MS = 5000;

interface StoredCookie {
  key?: string;
  value: string;
  domain: string;
  path?: string;
  secure?: boolean;
  [key: string]: unknown;
}

interface CookiesByDomain {
  [domain: string]: StoredCookie[];
}

interface SerializedCookieJar {
  cookies: StoredCookie[];
}

// VS Code extension context - must be set during activation
let extensionContext: vscode.ExtensionContext | null = null;

export function setExtensionContext(context: vscode.ExtensionContext): void {
  extensionContext = context;
}

class CookiesStore {
  private saveTimerId: NodeJS.Timeout | null = null;
  private debounceStart: number | null = null;
  private passkey: string | null = null;

  private generatePasskey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private getFromStorage<T>(key: string, defaultValue: T): T {
    if (!extensionContext) {
      return defaultValue;
    }
    return extensionContext.globalState.get<T>(key, defaultValue);
  }

  private setInStorage<T>(key: string, value: T): void {
    if (!extensionContext) {
      console.error('Extension context not set, cannot save to storage');
      return;
    }
    extensionContext.globalState.update(key, value);
  }

  initializeEncryption(): void {
    try {
      let encryptedPasskey = this.getFromStorage<string | null>('cookies.encryptedPasskey', null);

      if (!encryptedPasskey) {
        const passkey = this.generatePasskey();
        encryptedPasskey = encryptString(passkey);
        if (!encryptedPasskey) {
          console.warn('Failed to encrypt new passkey, falling back to unencrypted cookies');
          this.passkey = null;
          return;
        }
        this.setInStorage('cookies.encryptedPasskey', encryptedPasskey);
      }

      this.passkey = decryptString(encryptedPasskey);
      if (!this.passkey) {
        console.warn('Failed to decrypt passkey, falling back to unencrypted cookies');
      }
    } catch (err) {
      console.warn('Failed to initialize encryption, falling back to unencrypted cookies:', err);
      this.passkey = null;
    }
  }

  getCookies(): StoredCookie[] {
    const cookieStore = this.getFromStorage<CookiesByDomain>('cookies.data', {});
    const decryptedCookies: StoredCookie[] = [];

    Object.values(cookieStore).forEach((domainCookies) => {
      if (!Array.isArray(domainCookies)) return;

      domainCookies.forEach((cookie) => {
        try {
          const decryptedCookie: StoredCookie = {
            ...cookie,
            value: decryptString(cookie.value, this.passkey)
          };
          decryptedCookies.push(decryptedCookie);
        } catch (err) {
          console.warn('Failed to process cookie:', cookie?.key, err);
          decryptedCookies.push({
            ...cookie,
            value: ''
          });
        }
      });
    });

    return decryptedCookies;
  }

  setCookies(cookies: SerializedCookieJar): void {
    try {
      const cookiesByDomain: CookiesByDomain = {};

      cookies.cookies.forEach((cookie) => {
        try {
          if (!cookiesByDomain[cookie.domain]) {
            cookiesByDomain[cookie.domain] = [];
          }

          cookiesByDomain[cookie.domain].push({
            ...cookie,
            value: encryptString(cookie.value, this.passkey)
          });
        } catch (err) {
          console.warn('Failed to process cookie for storage:', cookie?.key, err);
          if (!cookiesByDomain[cookie.domain]) {
            cookiesByDomain[cookie.domain] = [];
          }
          cookiesByDomain[cookie.domain].push(cookie);
        }
      });

      this.setInStorage('cookies.data', cookiesByDomain);
    } catch (err) {
      console.warn('Failed to set cookies:', err);
    }
  }

  initializeCookies(): void {
    if (this.passkey === null) {
      this.initializeEncryption();
    }
    try {
      const storedCookies = this.getCookies();

      if (Array.isArray(storedCookies) && storedCookies.length) {
        storedCookies.forEach((cookie) => this.loadCookieIntoJar(cookie));
      }
    } catch (err) {
      console.warn('Failed to initialize cookies:', err);
    }
  }

  loadCookieIntoJar(rawCookie: StoredCookie): void {
    try {
      // Use type assertion as fromJSON exists but types may not include it
      const cookie = (Cookie as unknown as { fromJSON: (json: unknown) => Cookie | null }).fromJSON(rawCookie);
      if (!cookie) return;

      const protocol = cookie.secure ? 'https' : 'http';
      const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
      const url = `${protocol}://${domain}${cookie.path || '/'}`;
      const setCookieHeader = createCookieString(cookie as unknown as CookieInput);

      cookieJar.setCookieSync(setCookieHeader, url, { ignoreError: true });
    } catch (err) {
      console.warn('Failed to load cookie:', rawCookie?.key, (err as Error)?.message);
    }
  }

  writeCookieJar(): void {
    try {
      const serialized = cookieJar.serializeSync() as SerializedCookieJar;
      this.setCookies(serialized);
    } catch (err) {
      console.warn('Failed to save cookie jar:', err);
    } finally {
      this.debounceStart = null;
    }
  }

  saveCookieJar(immediate = false): void {
    if (immediate) {
      if (this.saveTimerId) {
        clearTimeout(this.saveTimerId);
        this.saveTimerId = null;
      }
      this.writeCookieJar();
      return;
    }

    if (!this.debounceStart) {
      this.debounceStart = Date.now();
    }

    if (this.saveTimerId) {
      clearTimeout(this.saveTimerId);
    }

    this.saveTimerId = setTimeout(() => {
      this.writeCookieJar();
      this.saveTimerId = null;
    }, DEBOUNCE_MS);
  }
}

export const cookiesStore = new CookiesStore();
export { CookiesStore };
