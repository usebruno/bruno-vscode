/**
 * Axios instance configuration
 * Creates and configures axios instances for HTTP requests
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
import https from 'https';
import { URL } from 'url';
import { getCookieStringForUrl, saveCookies } from '../../utils/cookies';
import { createFormData } from '../../utils/form-data';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import type { Agent } from 'http';
import {
  ProxyConfig,
  buildProxyUrl,
  shouldBypassProxy,
} from './proxy-utils';

/**
 * Create a proxy agent based on the proxy protocol.
 * Supports http, https, socks4, socks5 proxy protocols.
 * Passes through TLS options (cert, key, pfx, etc.) for the destination connection.
 */
function createProxyAgent(
  proxyConfig: ProxyConfig,
  agentOpts: https.AgentOptions
): { httpsAgent: Agent; httpAgent: Agent } {
  const proxyUrl = buildProxyUrl(proxyConfig);
  const protocol = (proxyConfig.protocol || 'http').toLowerCase();

  // Merge agentOpts so cert/key/pfx are preserved for the destination TLS handshake
  const tlsOpts = { ...agentOpts };

  if (protocol === 'socks4' || protocol === 'socks5') {
    const agent = new SocksProxyAgent(proxyUrl, tlsOpts);
    return { httpsAgent: agent, httpAgent: agent };
  }

  // http and https proxy protocols both use HttpsProxyAgent for HTTPS targets
  const httpsAgent = new HttpsProxyAgent(proxyUrl, tlsOpts);
  const httpAgent = new HttpProxyAgent(proxyUrl);
  return { httpsAgent, httpAgent };
}

// Import digest auth helper using require due to type declaration issues in @usebruno/requests
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { addDigestInterceptor } = require('@usebruno/requests') as {
  addDigestInterceptor: (axiosInstance: AxiosInstance, request: { digestConfig: { username?: string; password?: string } }) => void;
};

const redirectResponseCodes = [301, 302, 303, 307, 308];

interface AxiosInstanceOptions {
  timeout?: number;
  maxBodyLength?: number;
  maxContentLength?: number;
  httpsAgentOptions?: https.AgentOptions;
  proxyMode?: 'off' | 'on' | 'system';
  proxyConfig?: ProxyConfig;
  requestMaxRedirects?: number;
  digestConfig?: {
    username?: string;
    password?: string;
  };
  collectionPath?: string;
  /** Target request URL — used for no_proxy / bypassProxy matching */
  _targetUrl?: string;
}

const createAxiosInstance = (options: AxiosInstanceOptions = {}): AxiosInstance => {

  const {
    timeout = 0,
    maxBodyLength = Infinity,
    maxContentLength = Infinity,
    httpsAgentOptions = {},
    proxyMode = 'off',
    proxyConfig,
    requestMaxRedirects = 5,
    digestConfig,
    collectionPath
  } = options;

  const { ca, cert, key, pfx, passphrase, rejectUnauthorized, caCertificatesCount, ...restAgentOptions } = httpsAgentOptions as Record<string, unknown>;

  // TODO: Properly handle certificates. VS Code's @vscode/proxy-agent patches
  // https.request and overrides agent TLS settings. As a workaround, we disable
  // TLS verification at the process level for now.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const agentOpts: https.AgentOptions = {
    keepAlive: true,
    rejectUnauthorized: false,
    ...(cert !== undefined && { cert: cert as string | Buffer }),
    ...(key !== undefined && { key: key as string | Buffer }),
    ...(pfx !== undefined && { pfx: pfx as string | Buffer }),
    ...(passphrase !== undefined && { passphrase: passphrase as string }),
  };

  const config: AxiosRequestConfig = {
    timeout,
    maxBodyLength,
    maxContentLength,
    maxRedirects: 0,
    responseType: 'stream',
    proxy: false,
    httpsAgent: new https.Agent(agentOpts),
    headers: {
      'User-Agent': 'bruno-runtime/1.0'
    }
  };

  if (proxyMode === 'on' && proxyConfig) {
    const targetUrl = options._targetUrl || '';
    const bypassEntries = Array.isArray(proxyConfig.bypassProxy) ? proxyConfig.bypassProxy : [];
    if (targetUrl && shouldBypassProxy(targetUrl, bypassEntries)) {
      // Target host matches no_proxy / bypassProxy — skip proxy, use direct https.Agent
      config.proxy = false;
    } else if (proxyConfig.hostname) {
      // Use proxy agents (HttpsProxyAgent / SocksProxyAgent) instead of axios built-in proxy.
      // When httpsAgent is explicitly set, axios ignores the `proxy` option, so we must
      // use a proxy-aware agent rather than relying on config.proxy.
      const { httpsAgent: proxyHttpsAgent, httpAgent: proxyHttpAgent } = createProxyAgent(proxyConfig, agentOpts);
      config.httpsAgent = proxyHttpsAgent;
      config.httpAgent = proxyHttpAgent;
      config.proxy = false;
    }
  } else if (proxyMode === 'system') {
    // System proxy mode is resolved to 'on' or 'off' in cert-utils.ts
    config.proxy = false;
  }

  const instance = axios.create(config);

  if (digestConfig && digestConfig.username && digestConfig.password) {
    addDigestInterceptor(instance, { digestConfig });
  }

  let redirectCount = 0;

  instance.interceptors.response.use(
    (response: AxiosResponse) => {
      if (response.config.url) {
        saveCookies(response.config.url, response.headers as Record<string, string | string[]>);
      }

      redirectCount = 0;

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers['location'];
        if (location) {
          (response as unknown as { redirectLocation: string }).redirectLocation = location;
        }
      }
      return response;
    },
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & {
        _retry?: boolean;
        _originalMultipartData?: unknown;
        collectionPath?: string;
      };

      if (!originalRequest) {
        return Promise.reject(error);
      }

      if (error.response && redirectResponseCodes.includes(error.response.status)) {
        if (originalRequest.url) {
          saveCookies(originalRequest.url, error.response.headers as Record<string, string | string[]>);
        }

        if (redirectCount >= requestMaxRedirects) {
          redirectCount = 0;
          return Promise.reject(error);
        }

        redirectCount++;

        const locationHeader = error.response.headers['location'];
        if (!locationHeader) {
          return Promise.reject(error);
        }

        let redirectUrl = locationHeader;
        if (!locationHeader.match(/^https?:\/\//i)) {
          try {
            redirectUrl = new URL(locationHeader, originalRequest.url).toString();
          } catch {
            redirectUrl = locationHeader;
          }
        }

        const requestConfig: AxiosRequestConfig = {
          ...originalRequest,
          url: redirectUrl,
          headers: { ...originalRequest.headers }
        };

        const statusCode = error.response.status;
        const originalMethod = (originalRequest.method || 'get').toLowerCase();

        if ([301, 302, 303].includes(statusCode) && originalMethod !== 'head') {
          requestConfig.method = 'get';
          requestConfig.data = undefined;
          if (requestConfig.headers) {
            delete requestConfig.headers['content-length'];
            delete requestConfig.headers['Content-Length'];
            delete requestConfig.headers['content-type'];
            delete requestConfig.headers['Content-Type'];
          }
        } else {
          if (requestConfig.data && typeof requestConfig.data === 'object' &&
              requestConfig.data.constructor && requestConfig.data.constructor.name === 'FormData') {
            const formData = requestConfig.data as { _released?: boolean; _streams?: unknown[] };
            if (formData._released || (formData._streams && formData._streams.length === 0)) {
              if (originalRequest._originalMultipartData && (originalRequest.collectionPath || collectionPath)) {
                const recreatedForm = createFormData(
                  originalRequest._originalMultipartData as Array<{ name: string; type: string; value: string; contentType?: string }>,
                  originalRequest.collectionPath || collectionPath || ''
                );
                requestConfig.data = recreatedForm;
                const formHeaders = recreatedForm.getHeaders();
                Object.assign(requestConfig.headers || {}, formHeaders);
              }
            }
          }
        }

        const cookieString = getCookieStringForUrl(redirectUrl);
        if (cookieString && requestConfig.headers) {
          requestConfig.headers['cookie'] = cookieString;
        }

        return instance(requestConfig);
      }

      return Promise.reject(error);
    }
  );

  return instance;
};

/**
 * Make a request using a fresh axios instance
 */
const makeRequest = async (
  config: AxiosRequestConfig,
  instanceOptions: AxiosInstanceOptions = {}
): Promise<AxiosResponse> => {
  const instance = createAxiosInstance(instanceOptions);
  return instance.request(config);
};

export default createAxiosInstance;
export {
  createAxiosInstance,
  makeRequest,
  AxiosInstanceOptions
};
