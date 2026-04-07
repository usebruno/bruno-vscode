
// @ts-expect-error - GrpcClient may not be exported in types
import { GrpcClient } from '@usebruno/requests';
import { cloneDeep, each, get } from 'lodash';
import path from 'path';
import { registerHandler, sendToWebview } from '../handlers';
import { interpolateVars } from './interpolate-vars';
import { getEnvVars, getTreePathFromCollectionToItem, mergeHeaders, mergeScripts, mergeVars, mergeAuth } from '../../utils/collection';
import { getCertsAndProxyConfig } from './cert-utils';
import { getPreferences } from '../../store/preferences';
import { setAuthHeaders } from './prepare-request';
import { interpolateString } from './interpolate-string';

interface GrpcBody {
  mode?: string;
  grpc?: string;
}

interface GrpcRequestItem {
  uid: string;
  draft?: {
    request?: GrpcRequestData;
  };
  request?: GrpcRequestData;
}

interface GrpcRequestData {
  url: string;
  method?: string;
  methodType?: string;
  protoPath?: string;
  headers?: Array<{ name: string; value: string; enabled?: boolean }>;
  body?: GrpcBody;
  vars?: unknown;
  collectionVariables?: Record<string, string>;
  folderVariables?: Record<string, string>;
  requestVariables?: Record<string, string>;
  globalEnvironmentVariables?: Record<string, string>;
  oauth2CredentialVariables?: Record<string, string>;
  auth?: unknown;
  script?: unknown;
}

interface Collection {
  uid: string;
  pathname: string;
  draft?: {
    root?: unknown;
    brunoConfig?: {
      scripts?: { flow?: string };
      clientCertificates?: { certs?: ClientCertConfig[] };
    };
  };
  root?: unknown;
  brunoConfig?: {
    scripts?: { flow?: string };
    clientCertificates?: { certs?: ClientCertConfig[] };
  };
  globalEnvironmentVariables?: Record<string, string>;
  oauth2Credentials?: unknown;
  promptVariables?: Record<string, string>;
}

interface ClientCertConfig {
  domain?: string;
  type?: string;
  certFilePath?: string;
  keyFilePath?: string;
}

interface Environment {
  variables?: Array<{ name: string; value: string; enabled?: boolean }>;
}

interface PreparedGrpcRequest {
  uid: string;
  mode?: string;
  method?: string;
  methodType?: string;
  url: string;
  headers: Record<string, string>;
  processEnvVars: Record<string, string>;
  envVars: Record<string, string>;
  runtimeVariables: Record<string, string>;
  promptVariables: Record<string, string>;
  body?: GrpcBody;
  protoPath?: string;
  vars?: unknown;
  collectionVariables?: Record<string, string>;
  folderVariables?: Record<string, string>;
  requestVariables?: Record<string, string>;
  globalEnvironmentVariables?: Record<string, string>;
  oauth2CredentialVariables?: Record<string, string>;
  oauth2?: unknown;
  oauth2Credentials?: unknown;
}

const processHeaders = (headers: Record<string, string | Buffer>): void => {
  Object.entries(headers).forEach(([key, value]) => {
    if (key?.toLowerCase().endsWith('-bin') && typeof value === 'string') {
      headers[key] = Buffer.from(value, 'base64');
    }
  });
};

const prepareGrpcRequest = async (
  item: GrpcRequestItem,
  collection: Collection,
  environment: Environment | null,
  runtimeVariables: Record<string, string>
): Promise<PreparedGrpcRequest> => {
  const request = item.draft ? item.draft.request : item.request;
  if (!request) {
    throw new Error('No request found in item');
  }

  const collectionRoot = collection?.draft?.root ? get(collection, 'draft.root', {}) : get(collection, 'root', {});
  const headers: Record<string, string> = {};
  const url = request.url;
  const { promptVariables = {} } = collection;

  const scriptFlow = collection?.brunoConfig?.scripts?.flow ?? 'sandwich';
  const requestTreePath = getTreePathFromCollectionToItem(collection as never, item as never);
  if (requestTreePath && requestTreePath.length > 0) {
    mergeAuth(collection as never, request as never, requestTreePath);
    mergeHeaders(collection as never, request as never, requestTreePath);
    mergeScripts(collection as never, request as never, requestTreePath, scriptFlow);
    mergeVars(collection as never, request as never, requestTreePath);
    (request as GrpcRequestData).globalEnvironmentVariables = collection?.globalEnvironmentVariables;
  }

  each(get(request, 'headers', []), (h: { enabled?: boolean; name: string; value: string }) => {
    if (h.enabled && h.name.length > 0) {
      headers[h.name] = h.value;
    }
  });

  const processEnvVars: Record<string, string> = {}; // VS Code doesn't have process env vars like Electron
  const envVars = getEnvVars(environment as never);

  let grpcRequest: PreparedGrpcRequest = {
    uid: item.uid,
    mode: request.body?.mode,
    method: request.method,
    methodType: request.methodType,
    url,
    headers,
    processEnvVars,
    envVars,
    runtimeVariables,
    promptVariables,
    body: request.body,
    protoPath: request.protoPath,
    vars: request.vars,
    collectionVariables: request.collectionVariables,
    folderVariables: request.folderVariables,
    requestVariables: request.requestVariables,
    globalEnvironmentVariables: request.globalEnvironmentVariables,
    oauth2CredentialVariables: request.oauth2CredentialVariables
  };

  grpcRequest = setAuthHeaders(grpcRequest as never, request as never, collectionRoot as never) as unknown as PreparedGrpcRequest;

  // Interpolate variables
  interpolateVars(grpcRequest as never, {
    envVars,
    runtimeVariables,
    processEnvVars,
    promptVariables,
    collectionVariables: request.collectionVariables,
    folderVariables: request.folderVariables,
    requestVariables: request.requestVariables,
    globalEnvironmentVariables: request.globalEnvironmentVariables
  });

  processHeaders(grpcRequest.headers as Record<string, string | Buffer>);

  return grpcRequest;
};

/**
 * Configure gRPC request with OAuth2 if needed
 */
const configureRequest = async (
  grpcRequest: PreparedGrpcRequest,
  _request: GrpcRequestItem,
  _collection: Collection,
  _envVars: Record<string, string>,
  _runtimeVariables: Record<string, string>,
  _processEnvVars: Record<string, string>,
  _promptVariables: Record<string, string>,
  _certsAndProxyConfig: Record<string, unknown>
): Promise<void> => {
  // OAuth2 configuration would go here - similar to bruno-electron
  // For now, we skip OAuth2 as it's a deferred feature
  if (grpcRequest.oauth2) {
    console.warn('OAuth2 for gRPC is not yet implemented');
  }
};

let grpcClient: GrpcClient | null = null;

const createSendEvent = () => {
  return (eventName: string, ...args: unknown[]) => {
    sendToWebview(eventName, ...args);
  };
};

const safeParseJSON = (str: string): unknown => {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
};

const safeStringifyJSON = (obj: unknown): string => {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(obj);
  }
};

const registerGrpcEventHandlers = (): void => {
  const sendEvent = createSendEvent();
  grpcClient = new GrpcClient(sendEvent);

  registerHandler('grpc:start-connection', async (args) => {
    const [params] = args as [{
      request: GrpcRequestItem;
      collection: Collection;
      environment: Environment | null;
      runtimeVariables: Record<string, string>;
    }];

    const { request, collection, environment, runtimeVariables } = params;

    try {
      const requestCopy = cloneDeep(request);
      const preparedRequest = await prepareGrpcRequest(requestCopy, collection, environment, runtimeVariables);

      const protocolRegex = /^([-+\w]{1,25})(:?\/\/|:)/;
      if (!protocolRegex.test(preparedRequest.url)) {
        preparedRequest.url = `http://${preparedRequest.url}`;
      }

      const certsAndProxyConfig = await getCertsAndProxyConfig({
        collectionUid: collection.uid,
        collection: collection as never,
        request: preparedRequest as never,
        envVars: preparedRequest.envVars,
        runtimeVariables,
        processEnvVars: preparedRequest.processEnvVars,
        collectionPath: collection.pathname,
        globalEnvironmentVariables: collection.globalEnvironmentVariables
      });

      await configureRequest(
        preparedRequest,
        requestCopy,
        collection,
        preparedRequest.envVars,
        runtimeVariables,
        preparedRequest.processEnvVars,
        preparedRequest.promptVariables,
        certsAndProxyConfig
      );

      const { httpsAgentRequestFields } = certsAndProxyConfig;

      const verifyOptions = {
        rejectUnauthorized: httpsAgentRequestFields.rejectUnauthorized !== false
      };

      const rootCertificate = httpsAgentRequestFields.ca;
      const privateKey = httpsAgentRequestFields.key;
      const certificateChain = httpsAgentRequestFields.cert;
      const passphrase = httpsAgentRequestFields.passphrase;
      const pfx = httpsAgentRequestFields.pfx;

      const requestSent = {
        type: 'request',
        url: preparedRequest.url,
        method: preparedRequest.method,
        methodType: preparedRequest.methodType,
        headers: preparedRequest.headers,
        body: preparedRequest.body,
        timestamp: Date.now()
      };

      await grpcClient?.startConnection({
        request: preparedRequest as never,
        collection: collection as never,
        rootCertificate,
        privateKey,
        certificateChain,
        passphrase,
        pfx,
        verifyOptions
      });

      sendEvent('grpc:request', preparedRequest.uid, collection.uid, requestSent);

      return { success: true };
    } catch (error) {
      console.error('Error starting gRPC connection:', error);
      if (error instanceof Error) {
        sendEvent('grpc:error', request.uid, collection.uid, { error: error.message });
        throw error;
      }
      sendEvent('grpc:error', request.uid, collection.uid, { error: String(error) });
      return { success: false, error: String(error) };
    }
  });

  registerHandler('grpc:get-active-connections', async () => {
    try {
      const activeConnectionIds = grpcClient?.getActiveConnectionIds() || [];
      return { success: true, activeConnectionIds };
    } catch (error) {
      console.error('Error getting active connections:', error);
      return { success: false, error: (error as Error).message, activeConnectionIds: [] };
    }
  });

  registerHandler('grpc:send-message', async (args) => {
    const [requestId, collectionUid, message] = args as [string, string, unknown];

    try {
      grpcClient?.sendMessage(requestId, collectionUid, message);
      sendEvent('grpc:message', requestId, collectionUid, message);
      return { success: true };
    } catch (error) {
      console.error('Error sending gRPC message:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // End a streaming request
  registerHandler('grpc:end-request', async (args) => {
    const [params] = args as [{ requestId?: string }];

    try {
      const { requestId } = params || {};
      if (!requestId) {
        throw new Error('Request ID is required');
      }
      grpcClient?.end(requestId);
      return { success: true };
    } catch (error) {
      console.error('Error ending gRPC stream:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  registerHandler('grpc:cancel-request', async (args) => {
    const [params] = args as [{ requestId?: string }];

    try {
      const { requestId } = params || {};
      if (!requestId) {
        throw new Error('Request ID is required');
      }
      grpcClient?.cancel(requestId);
      return { success: true };
    } catch (error) {
      console.error('Error cancelling gRPC request:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  registerHandler('grpc:load-methods-reflection', async (args) => {
    const [params] = args as [{
      request: GrpcRequestItem;
      collection: Collection;
      environment: Environment | null;
      runtimeVariables: Record<string, string>;
    }];

    const { request, collection, environment, runtimeVariables } = params;

    try {
      const requestCopy = cloneDeep(request);
      const preparedRequest = await prepareGrpcRequest(requestCopy, collection, environment, runtimeVariables);

      const protocolRegex = /^([-+\w]{1,25})(:?\/\/|:)/;
      if (!protocolRegex.test(preparedRequest.url)) {
        preparedRequest.url = `http://${preparedRequest.url}`;
      }

      const certsAndProxyConfig = await getCertsAndProxyConfig({
        collectionUid: collection.uid,
        collection: collection as never,
        request: preparedRequest as never,
        envVars: preparedRequest.envVars,
        runtimeVariables,
        processEnvVars: preparedRequest.processEnvVars,
        collectionPath: collection.pathname,
        globalEnvironmentVariables: collection.globalEnvironmentVariables
      });

      await configureRequest(
        preparedRequest,
        requestCopy,
        collection,
        preparedRequest.envVars,
        runtimeVariables,
        preparedRequest.processEnvVars,
        preparedRequest.promptVariables,
        certsAndProxyConfig
      );

      const { httpsAgentRequestFields } = certsAndProxyConfig;

      const verifyOptions = {
        rejectUnauthorized: httpsAgentRequestFields.rejectUnauthorized !== false
      };

      const rootCertificate = httpsAgentRequestFields.ca;
      const privateKey = httpsAgentRequestFields.key;
      const certificateChain = httpsAgentRequestFields.cert;
      const passphrase = httpsAgentRequestFields.passphrase;
      const pfx = httpsAgentRequestFields.pfx;

      const methods = await grpcClient?.loadMethodsFromReflection({
        request: preparedRequest as never,
        collectionUid: collection.uid,
        rootCertificate,
        privateKey,
        certificateChain,
        passphrase,
        pfx,
        verifyOptions,
        sendEvent
      });

      return { success: true, methods: safeParseJSON(safeStringifyJSON(methods)) };
    } catch (error) {
      console.error('Error loading gRPC methods from reflection:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  registerHandler('grpc:load-methods-proto', async (args) => {
    const [params] = args as [{ filePath: string; includeDirs?: string[] }];

    const { filePath, includeDirs } = params;

    try {
      const methods = await grpcClient?.loadMethodsFromProtoFile(filePath, includeDirs);
      return { success: true, methods: safeParseJSON(safeStringifyJSON(methods)) };
    } catch (error) {
      console.error('Error loading gRPC methods from proto file:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Generate a sample gRPC message based on method path
  registerHandler('grpc:generate-sample-message', async (args) => {
    const [params] = args as [{ methodPath: string; existingMessage?: string; options?: Record<string, unknown> }];

    const { methodPath, existingMessage, options = {} } = params;

    try {
      // Generate the sample message
      const result = grpcClient?.generateSampleMessage(methodPath, {
        ...options,
        existingMessage: existingMessage ? safeParseJSON(existingMessage) : null
      });

      if (!result?.success) {
        return {
          success: false,
          error: result?.error || 'Failed to generate sample message'
        };
      }

      return {
        success: true,
        message: JSON.stringify(result.message, null, 2)
      };
    } catch (error) {
      console.error('Error generating gRPC sample message:', error);
      return {
        success: false,
        error: (error as Error).message || 'Failed to generate sample message'
      };
    }
  });

  // Generate grpcurl command for a request
  registerHandler('grpc:generate-grpcurl', async (args) => {
    const [params] = args as [{
      request: GrpcRequestItem;
      collection: Collection;
      environment: Environment | null;
      runtimeVariables: Record<string, string>;
    }];

    const { request, collection, environment, runtimeVariables } = params;

    try {
      const requestCopy = cloneDeep(request);
      const preparedRequest = await prepareGrpcRequest(requestCopy, collection, environment, runtimeVariables);

      const protocolRegex = /^([-+\w]{1,25})(:?\/\/|:)/;
      if (!protocolRegex.test(preparedRequest.url)) {
        preparedRequest.url = `http://${preparedRequest.url}`;
      }

      const interpolationOptions = {
        envVars: preparedRequest.envVars,
        runtimeVariables,
        processEnvVars: preparedRequest.processEnvVars
      };

      let caCertFilePath: string | undefined;
      let certFilePath: string | undefined;
      let keyFilePath: string | undefined;

      const preferences = getPreferences();
      if (preferences?.request?.customCaCertificate?.enabled && preferences.request.customCaCertificate.filePath) {
        caCertFilePath = preferences.request.customCaCertificate.filePath;
      }

      const clientCertConfig = collection.draft?.brunoConfig
        ? get(collection, 'draft.brunoConfig.clientCertificates.certs', [])
        : get(collection, 'brunoConfig.clientCertificates.certs', []);

      for (const clientCert of clientCertConfig as ClientCertConfig[]) {
        const domain = interpolateString(clientCert?.domain || '', interpolationOptions);
        const type = clientCert?.type || 'cert';
        if (domain) {
          const hostRegex = '^(https:\\/\\/|grpc:\\/\\/|grpcs:\\/\\/)' + domain.replaceAll('.', '\\.').replaceAll('*', '.*');
          const requestUrl = interpolateString(preparedRequest.url, interpolationOptions);
          if (requestUrl.match(hostRegex)) {
            if (type === 'cert') {
              certFilePath = interpolateString(clientCert?.certFilePath || '', interpolationOptions);
              certFilePath = path.isAbsolute(certFilePath) ? certFilePath : path.join(collection.pathname, certFilePath);
              keyFilePath = interpolateString(clientCert?.keyFilePath || '', interpolationOptions);
              keyFilePath = path.isAbsolute(keyFilePath) ? keyFilePath : path.join(collection.pathname, keyFilePath);
            }
          }
        }
      }

      // Generate the grpcurl command
      const command = grpcClient?.generateGrpcurlCommand({
        request: preparedRequest as never,
        collectionPath: collection.pathname,
        certificates: {
          ca: caCertFilePath,
          cert: certFilePath,
          key: keyFilePath
        }
      });

      return { success: true, command };
    } catch (error) {
      console.error('Error generating grpcurl command:', error);
      return { success: false, error: (error as Error).message };
    }
  });

};

export { registerGrpcEventHandlers, grpcClient };
