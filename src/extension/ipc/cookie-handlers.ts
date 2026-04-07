/**
 * IPC handlers for cookie management.
 *
 * Bridges the webview Cookie UI to the @usebruno/requests cookie jar.
 * After each mutation, notifies all webviews and persists the jar.
 *
 * Reference: packages/bruno-electron/src/ipc/collection.js lines 1551-1613
 */

import { registerHandler, broadcastToAllWebviews } from './handlers';
import { getDomainsWithCookies, createCookieString as cookieUtilCreateCookieString } from '../utils/cookies';
import { cookiesStore } from '../store/cookies';

// @usebruno/requests exports cookie mutation functions
// eslint-disable-next-line @typescript-eslint/no-var-requires
const brunoCookies = require('@usebruno/requests').cookies;

/**
 * Get updated cookies from the jar, broadcast to all webviews, and persist.
 */
async function updateCookiesAndNotify(): Promise<void> {
  const domainsWithCookies = await getDomainsWithCookies();
  // safeParseJSON(safeStringifyJSON(...)) to strip non-serializable fields (functions, circular refs)
  const serializable = JSON.parse(JSON.stringify(domainsWithCookies));
  broadcastToAllWebviews('main:cookies-update', serializable);
  cookiesStore.saveCookieJar();
}

export function registerCookieHandlers(): void {
  // Delete all cookies for a domain
  registerHandler('renderer:delete-cookies-for-domain', async (args) => {
    const [domain] = args as [string];
    await brunoCookies.deleteCookiesForDomain(domain);
    await updateCookiesAndNotify();
  });

  // Delete a specific cookie
  registerHandler('renderer:delete-cookie', async (args) => {
    const [domain, path, cookieKey] = args as [string, string, string];
    await brunoCookies.deleteCookie(domain, path, cookieKey);
    await updateCookiesAndNotify();
  });

  // Add a cookie for a domain
  registerHandler('renderer:add-cookie', async (args) => {
    const [domain, cookie] = args as [string, Record<string, unknown>];
    await brunoCookies.addCookieForDomain(domain, cookie);
    await updateCookiesAndNotify();
  });

  // Modify an existing cookie
  registerHandler('renderer:modify-cookie', async (args) => {
    const [domain, oldCookie, cookie] = args as [string, Record<string, unknown>, Record<string, unknown>];
    await brunoCookies.modifyCookieForDomain(domain, oldCookie, cookie);
    await updateCookiesAndNotify();
  });

  // Parse a Set-Cookie string into a cookie object
  registerHandler('renderer:get-parsed-cookie', async (args) => {
    const [cookieStr] = args as [string];
    return brunoCookies.parseCookieString(cookieStr);
  });

  // Create a Set-Cookie string from a cookie object
  registerHandler('renderer:create-cookie-string', async (args) => {
    const [cookieObj] = args as [Record<string, unknown>];
    return cookieUtilCreateCookieString(cookieObj);
  });
}
