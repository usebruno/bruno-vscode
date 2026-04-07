/**
 * Axios instance configuration
 * Creates and configures axios instances for HTTP requests
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
import https from 'https';
import { URL } from 'url';
import { getCookieStringForUrl, saveCookies } from '../../utils/cookies';
import { createFormData } from '../../utils/form-data';

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
  proxyConfig?: {
    protocol?: string;
    hostname?: string;
    port?: number;
    auth?: {
      username?: string;
      password?: string;
    };
  };
  requestMaxRedirects?: number;
  digestConfig?: {
    username?: string;
    password?: string;
  };
  collectionPath?: string;
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
    config.proxy = {
      protocol: proxyConfig.protocol || 'http',
      host: proxyConfig.hostname || 'localhost',
      port: proxyConfig.port || 8080,
      auth: proxyConfig.auth ? {
        username: proxyConfig.auth.username || '',
        password: proxyConfig.auth.password || ''
      } : undefined
    };
  } else if (proxyMode === 'system') {
    delete config.proxy;
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
