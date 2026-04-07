import path from 'path';
import { isFile, isDirectory } from './filesystem';
import { get } from 'lodash';

interface ImportPath {
  path: string;
  exists?: boolean;
}

interface ProtoFile {
  path: string;
  exists?: boolean;
}

interface ProxyAuth {
  username?: string;
  password?: string;
  enabled?: boolean;
  disabled?: boolean;
}

interface ProxyConfig {
  protocol?: string;
  hostname?: string;
  port?: number | null;
  auth?: ProxyAuth;
  bypassProxy?: string;
}

interface OldProxy {
  enabled?: boolean | 'global';
  protocol?: string;
  hostname?: string;
  port?: number | null;
  auth?: ProxyAuth;
  bypassProxy?: string;
}

interface NewProxy {
  inherit?: boolean;
  disabled?: boolean;
  config?: ProxyConfig;
}

interface BrunoConfig {
  protobuf?: {
    importPaths?: ImportPath[];
    protoFiles?: ProtoFile[];
  };
  proxy?: OldProxy | NewProxy;
  [key: string]: unknown;
}

export function transformBrunoConfigBeforeSave(brunoConfig: BrunoConfig): BrunoConfig {
  if (brunoConfig.protobuf?.importPaths) {
    brunoConfig.protobuf.importPaths = brunoConfig.protobuf.importPaths.map((importPath) => {
      const { exists, ...rest } = importPath;
      return rest;
    });
  }
  if (brunoConfig.protobuf?.protoFiles) {
    brunoConfig.protobuf.protoFiles = brunoConfig.protobuf.protoFiles.map((protoFile) => {
      const { exists, ...rest } = protoFile;
      return rest;
    });
  }

  if (brunoConfig.proxy) {
    const proxy = brunoConfig.proxy as NewProxy;
    if (proxy.disabled === false) {
      delete proxy.disabled;
    }
    if (proxy.config?.auth?.disabled === false) {
      delete proxy.config.auth.disabled;
    }
  }

  return brunoConfig;
}

export async function transformBrunoConfigAfterRead(brunoConfig: BrunoConfig, collectionPathname: string): Promise<BrunoConfig> {
  if (brunoConfig.protobuf?.importPaths) {
    brunoConfig.protobuf.importPaths = await Promise.all(
      brunoConfig.protobuf.importPaths.map(async (importPath) => {
        try {
          const absolutePath = path.resolve(collectionPathname, importPath.path);
          const exists = isDirectory(absolutePath);
          return { ...importPath, exists };
        } catch {
          return { ...importPath, exists: false };
        }
      })
    );
  }

  if (brunoConfig.protobuf?.protoFiles) {
    brunoConfig.protobuf.protoFiles = await Promise.all(
      brunoConfig.protobuf.protoFiles.map(async (protoFile) => {
        try {
          const absolutePath = path.resolve(collectionPathname, protoFile.path);
          const exists = isFile(absolutePath);
          return { ...protoFile, exists };
        } catch {
          return { ...protoFile, exists: false };
        }
      })
    );
  }

  // Migrate proxy configuration from old format to new format
  if (brunoConfig.proxy) {
    const proxy = brunoConfig.proxy as OldProxy;

    if (Object.prototype.hasOwnProperty.call(proxy, 'enabled')) {
      const enabled = proxy.enabled;

      const newProxy: NewProxy = {
        inherit: true,
        config: {
          protocol: proxy.protocol || 'http',
          hostname: proxy.hostname || '',
          port: proxy.port || null,
          auth: {
            username: get(proxy, 'auth.username', ''),
            password: get(proxy, 'auth.password', '')
          },
          bypassProxy: proxy.bypassProxy || ''
        }
      };

      if (enabled === true) {
        newProxy.disabled = false;
        newProxy.inherit = false;
      } else if (enabled === false) {
        newProxy.disabled = true;
        newProxy.inherit = false;
      } else if (enabled === 'global') {
        newProxy.disabled = false;
        newProxy.inherit = true;
      }

      // Migrate auth.enabled to auth.disabled
      if (get(proxy, 'auth.enabled') === false) {
        newProxy.config!.auth!.disabled = true;
      }

      // Omit disabled: false at top level (optional field)
      if (newProxy.disabled === false) {
        delete newProxy.disabled;
      }
      // Omit auth.disabled: false (optional field)
      if (newProxy.config?.auth?.disabled === false) {
        delete newProxy.config.auth.disabled;
      }

      brunoConfig.proxy = newProxy;
    }
  }

  return brunoConfig;
}
