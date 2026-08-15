import { URL } from 'url';

export type ProxyProtocol = 'http' | 'https' | 'socks4' | 'socks5';

export interface ProxyAuth {
  username?: string;
  password?: string;
  disabled?: boolean;
}

/**
 * Proxy configuration data (the `config` field inside a proxy settings object).
 * Matches the structure used in `bruno.json` and global preferences.
 */
export interface ProxyConfig {
  protocol?: ProxyProtocol | string;
  hostname?: string;
  port?: number;
  auth?: ProxyAuth;
  bypassProxy?: string | string[];
}

/**
 * Full proxy settings structure as used in `bruno.json`:
 * { "disabled": false, "inherit": false, "config": { ... } }
 */
export interface ProxySettings {
  disabled?: boolean;
  inherit?: boolean;
  config?: ProxyConfig;
}

/**
 * Build a proxy URL string from ProxyConfig for use with proxy-agent packages.
 * Format: "protocol://username:password@hostname:port"
 * Returns empty string if hostname is not set.
 */
export function buildProxyUrl(proxyConfig: ProxyConfig): string {
  const protocol = proxyConfig.protocol || 'http';
  const hostname = proxyConfig.hostname;
  const port = proxyConfig.port;

  if (!hostname) {
    return '';
  }

  let auth = '';
  if (proxyConfig.auth && !proxyConfig.auth.disabled &&
    (proxyConfig.auth.username || proxyConfig.auth.password)) {
    const username = encodeURIComponent(proxyConfig.auth.username || '');
    const password = encodeURIComponent(proxyConfig.auth.password || '');
    auth = `${username}:${password}@`;
  }

  return `${protocol}://${auth}${hostname}:${port}`;
}

/**
 * Parse a proxy URL string (e.g. "http://user:pass@host:8080") into a ProxyConfig.
 */
export function parseProxyUrl(proxyUrl: string): ProxyConfig | null {
  if (!proxyUrl || !proxyUrl.trim()) {
    return null;
  }

  try {
    const normalizedUrl = /^[a-zA-Z]+:\/\//.test(proxyUrl) ? proxyUrl : `http://${proxyUrl}`;
    const parsed = new URL(normalizedUrl);

    const config: ProxyConfig = {
      protocol: parsed.protocol.replace(':', '') || 'http',
      hostname: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : undefined,
    };

    if (parsed.username || parsed.password) {
      config.auth = {
        username: decodeURIComponent(parsed.username || ''),
        password: decodeURIComponent(parsed.password || ''),
      };
    }

    return config;
  } catch {
    return null;
  }
}

/**
 * Normalize bypassProxy to a string array.
 * Accepts string (comma-separated) or string[].
 */
export function normalizeBypassProxy(bypassProxy: string | string[] | undefined): string[] {
  if (!bypassProxy) {
    return [];
  }

  if (Array.isArray(bypassProxy)) {
    return bypassProxy.map((s) => s.trim()).filter((s) => s.length > 0);
  }

  return bypassProxy
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Check if a target hostname matches any entry in the no_proxy / bypassProxy list.
 * Supports wildcard patterns (e.g. "*.internal.com", "10.0.*"),
 * subdomain patterns (e.g. ".example.com"), and exact match.
 */
export function shouldBypassProxy(target: string, bypassEntries: string[]): boolean {
  if (!bypassEntries || bypassEntries.length === 0) {
    return false;
  }

  let host: string;
  try {
    const parsed = new URL(target);
    host = parsed.hostname.toLowerCase();
  } catch {
    host = target.toLowerCase();
  }

  for (const entry of bypassEntries) {
    const pattern = entry.toLowerCase().trim();
    if (!pattern) continue;

    // "*" means bypass everything
    if (pattern === '*') {
      return true;
    }

    // Exact match
    if (host === pattern) {
      return true;
    }

    // Wildcard match (e.g. "*.internal.com" matches "api.internal.com")
    if (pattern.includes('*')) {
      const regexStr = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
      const regex = new RegExp(`^${regexStr}$`, 'i');
      if (regex.test(host)) {
        return true;
      }
    }

    // Subdomain match: ".example.com" matches "api.example.com" and "example.com"
    if (pattern.startsWith('.') && (host === pattern.slice(1) || host.endsWith(pattern))) {
      return true;
    }
  }

  return false;
}

/**
 * Build a ProxyConfig from system environment variables (http_proxy, https_proxy, no_proxy).
 * Selects the appropriate proxy variable based on the target request URL's protocol.
 */
export function getSystemProxyConfigForRequest(
  targetUrl: string,
  systemProxyVars: { http_proxy?: string; https_proxy?: string; no_proxy?: string }
): ProxyConfig | null {
  if (!targetUrl) {
    return null;
  }

  // Determine if the target URL uses https
  let isHttps = false;
  try {
    const parsed = new URL(targetUrl);
    isHttps = parsed.protocol === 'https:' || parsed.protocol === 'wss:';
  } catch {
    // If URL parsing fails, default to https_proxy (safer default)
    isHttps = true;
  }

  // Select the appropriate proxy variable
  const proxyUrl = isHttps
    ? (systemProxyVars.https_proxy || systemProxyVars.http_proxy)
    : (systemProxyVars.http_proxy || systemProxyVars.https_proxy);

  if (!proxyUrl) {
    return null;
  }

  const config = parseProxyUrl(proxyUrl);
  if (!config) {
    return null;
  }

  // Parse no_proxy into bypassProxy array
  if (systemProxyVars.no_proxy) {
    config.bypassProxy = normalizeBypassProxy(systemProxyVars.no_proxy);
  }

  return config;
}
