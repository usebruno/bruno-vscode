
import * as fs from 'fs';
import * as path from 'path';
import * as tls from 'tls';
import * as vscode from 'vscode';
import { get } from 'lodash';
import { preferencesUtil } from '../../store/preferences';
import { getBrunoConfig } from '../../store/bruno-config';
import { interpolateString, InterpolationOptions } from './interpolate-string';

interface Collection {
  promptVariables?: Record<string, string>;
}

interface Request {
  url?: string;
  collectionVariables?: Record<string, string>;
  folderVariables?: Record<string, string>;
  requestVariables?: Record<string, string>;
}

interface CACertificatesCount {
  system: number;
  root: number;
  custom: number;
  extra: number;
}

interface HttpsAgentFields {
  keepAlive: boolean;
  rejectUnauthorized?: boolean;
  caCertificatesCount?: CACertificatesCount;
  ca?: string;
  cert?: Buffer;
  key?: Buffer;
  pfx?: Buffer;
  passphrase?: string;
}

interface ProxyConfig {
  protocol?: string;
  hostname?: string;
  port?: number;
  auth?: {
    username?: string;
    password?: string;
  };
  bypassProxy?: string[];
}

interface CertsAndProxyConfigParams {
  collectionUid: string;
  collection: Collection;
  request: Request;
  envVars: Record<string, string>;
  runtimeVariables: Record<string, string>;
  processEnvVars: Record<string, string>;
  collectionPath: string;
  globalEnvironmentVariables: Record<string, string>;
}

interface CertsAndProxyConfigResult {
  proxyMode: 'off' | 'on' | 'system';
  proxyConfig: ProxyConfig;
  httpsAgentRequestFields: HttpsAgentFields;
  interpolationOptions: InterpolationOptions;
  [key: string]: unknown;
}

interface CACertificatesOptions {
  caCertFilePath?: string;
  shouldKeepDefaultCerts?: boolean;
}

interface CACertificatesResult {
  caCertificates: string;
  caCertificatesCount: CACertificatesCount;
}

let systemCertsCache: string[] | undefined;

function getSystemCerts(): string[] {
  if (systemCertsCache) return systemCertsCache;

  try {
    // tls.getCACertificates is available in Node.js 20.13+
    if (typeof (tls as any).getCACertificates === 'function') {
      systemCertsCache = (tls as any).getCACertificates('system');
      return systemCertsCache || [];
    }
    return [];
  } catch (error) {
    console.warn('Failed to get system CA certificates:', error);
    return [];
  }
}

function certToString(cert: string | Buffer): string {
  return typeof cert === 'string'
    ? cert
    : Buffer.from(cert.buffer, cert.byteOffset, cert.byteLength).toString('utf8');
}

function mergeCA(...args: (string | string[])[]): string {
  const ca = new Set<string>();
  for (const item of args) {
    if (!item) continue;
    const caList = Array.isArray(item) ? item : [item];
    for (const cert of caList) {
      if (cert) {
        ca.add(certToString(cert));
      }
    }
  }
  return [...ca].join('\n');
}

function getNodeExtraCACerts(): string[] {
  const extraCACertPath = process.env.NODE_EXTRA_CA_CERTS;
  if (!extraCACertPath) return [];

  try {
    if (fs.existsSync(extraCACertPath)) {
      const extraCACert = fs.readFileSync(extraCACertPath, 'utf8');
      if (extraCACert && extraCACert.trim()) {
        return [extraCACert];
      }
    }
  } catch (err) {
    console.error(`Failed to read NODE_EXTRA_CA_CERTS from ${extraCACertPath}:`, (err as Error).message);
  }

  return [];
}

const getCACertificates = ({ caCertFilePath, shouldKeepDefaultCerts = true }: CACertificatesOptions): CACertificatesResult => {
  try {
    let caCertificatesCount: CACertificatesCount = {
      system: 0,
      root: 0,
      custom: 0,
      extra: 0
    };

    let systemCerts: string[] = [];
    let rootCerts: string[] = [];
    let customCerts: string[] = [];
    let nodeExtraCerts: string[] = [];

    if (caCertFilePath) {
      if (fs.existsSync(caCertFilePath)) {
        try {
          const customCert = fs.readFileSync(caCertFilePath, 'utf8');
          if (customCert && customCert.trim()) {
            customCerts.push(customCert);
            caCertificatesCount.custom = customCerts.length;
          }
        } catch (err) {
          console.error(`Failed to read custom CA certificate from ${caCertFilePath}:`, (err as Error).message);
          throw new Error(`Unable to load custom CA certificate: ${(err as Error).message}`);
        }
      } else {
        throw new Error(`Invalid custom CA certificate path: ${caCertFilePath}`);
      }

      if (shouldKeepDefaultCerts) {
        systemCerts = getSystemCerts();
        caCertificatesCount.system = systemCerts.length;

        rootCerts = [...tls.rootCertificates];
        caCertificatesCount.root = rootCerts.length;
      }
    } else {
      systemCerts = getSystemCerts();
      caCertificatesCount.system = systemCerts.length;

      rootCerts = [...tls.rootCertificates];
      caCertificatesCount.root = rootCerts.length;
    }

    nodeExtraCerts = getNodeExtraCACerts();
    caCertificatesCount.extra = nodeExtraCerts.length;

    const mergedCerts = mergeCA(systemCerts, rootCerts, customCerts, nodeExtraCerts);

    return {
      caCertificates: mergedCerts,
      caCertificatesCount
    };
  } catch (err) {
    console.error('Error configuring CA certificates:', (err as Error).message);
    throw err; // Re-throw certificate loading errors as they're critical
  }
};

const getCertsAndProxyConfig = async ({
  collectionUid,
  collection,
  request,
  envVars,
  runtimeVariables,
  processEnvVars,
  collectionPath,
  globalEnvironmentVariables
}: CertsAndProxyConfigParams): Promise<CertsAndProxyConfigResult> => {
  const httpsAgentRequestFields: HttpsAgentFields = { keepAlive: true };

  const { promptVariables } = collection;
  const collectionVariables = request.collectionVariables || {};
  const folderVariables = request.folderVariables || {};
  const requestVariables = request.requestVariables || {};

  const brunoConfig = getBrunoConfig(collectionUid);
  const interpolationOptions: InterpolationOptions = {
    globalEnvironmentVariables,
    collectionVariables,
    envVars,
    folderVariables,
    requestVariables,
    runtimeVariables,
    promptVariables,
    processEnvVars
  };

  const clientCertConfig = get(brunoConfig, 'clientCertificates.certs', []) as Array<{
    domain?: string;
    type?: string;
    certFilePath?: string;
    keyFilePath?: string;
    pfxFilePath?: string;
    passphrase?: string;
  }>;

  for (const clientCert of clientCertConfig) {
    const domain = interpolateString(clientCert?.domain || '', interpolationOptions);
    const type = clientCert?.type || 'cert';

    if (domain) {
      const hostRegex = '^(https:\\/\\/|grpc:\\/\\/|grpcs:\\/\\/|ws:\\/\\/|wss:\\/\\/)?'
        + domain.replaceAll('.', '\\.').replaceAll('*', '.*');
      const requestUrl = interpolateString(request.url || '', interpolationOptions);

      if (requestUrl && requestUrl.match(hostRegex)) {
        if (type === 'cert') {
          try {
            let certFilePath = interpolateString(clientCert?.certFilePath || '', interpolationOptions);
            certFilePath = path.isAbsolute(certFilePath) ? certFilePath : path.join(collectionPath, certFilePath);
            let keyFilePath = interpolateString(clientCert?.keyFilePath || '', interpolationOptions);
            keyFilePath = path.isAbsolute(keyFilePath) ? keyFilePath : path.join(collectionPath, keyFilePath);

            httpsAgentRequestFields.cert = fs.readFileSync(certFilePath);
            httpsAgentRequestFields.key = fs.readFileSync(keyFilePath);
          } catch (err) {
            console.error('Error reading cert/key file', err);
            throw new Error('Error reading cert/key file' + err);
          }
        } else if (type === 'pfx') {
          try {
            let pfxFilePath = interpolateString(clientCert?.pfxFilePath || '', interpolationOptions);
            pfxFilePath = path.isAbsolute(pfxFilePath) ? pfxFilePath : path.join(collectionPath, pfxFilePath);
            httpsAgentRequestFields.pfx = fs.readFileSync(pfxFilePath);
          } catch (err) {
            console.error('Error reading pfx file', err);
            throw new Error('Error reading pfx file' + err);
          }
        }
        httpsAgentRequestFields.passphrase = interpolateString(clientCert.passphrase || '', interpolationOptions);
        break;
      }
    }
  }

  // Proxy configuration
  let proxyMode: 'off' | 'on' | 'system' = 'off';
  let proxyConfig: ProxyConfig = {};

  const collectionProxyConfig = get(brunoConfig, 'proxy', {}) as {
    disabled?: boolean;
    inherit?: boolean;
    config?: ProxyConfig;
  };

  const collectionProxyDisabled = get(collectionProxyConfig, 'disabled', false);
  const collectionProxyInherit = get(collectionProxyConfig, 'inherit', true);
  const collectionProxyConfigData = get(collectionProxyConfig, 'config', collectionProxyConfig);

  if (!collectionProxyDisabled && !collectionProxyInherit) {
    // Use collection-specific proxy
    proxyConfig = collectionProxyConfigData as ProxyConfig;
    proxyMode = 'on';
  } else if (!collectionProxyDisabled && collectionProxyInherit) {
    // Inherit from global preferences
    const globalProxy = preferencesUtil.getGlobalProxyConfig();
    const globalDisabled = get(globalProxy, 'disabled', false);
    const globalInherit = get(globalProxy, 'inherit', false);
    const globalProxyConfigData = get(globalProxy, 'config', globalProxy);

    if (!globalDisabled && !globalInherit) {
      // Use global custom proxy
      proxyConfig = globalProxyConfigData as ProxyConfig;
      proxyMode = 'on';
    } else if (!globalDisabled && globalInherit) {
      // Use system proxy
      proxyMode = 'system';
    }
  }

  return { proxyMode, proxyConfig, httpsAgentRequestFields, interpolationOptions };
};

export {
  getCertsAndProxyConfig,
  CertsAndProxyConfigParams,
  CertsAndProxyConfigResult,
  HttpsAgentFields,
  ProxyConfig
};
