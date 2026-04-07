
// @ts-expect-error - WsClient may not have type definitions
import { WsClient } from '@usebruno/requests';
import { cloneDeep, each, get } from 'lodash';
import { registerHandler, sendToWebview } from '../handlers';
import { interpolateVars } from './interpolate-vars';
import { getEnvVars, getTreePathFromCollectionToItem, mergeHeaders, mergeScripts, mergeVars, mergeAuth } from '../../utils/collection';
import { getCertsAndProxyConfig } from './cert-utils';
import { setAuthHeaders } from './prepare-request';

interface WsMessage {
  content: string;
  type?: string;
  enabled?: boolean;
}

interface WsBody {
  mode?: string;
  ws?: WsMessage[];
}

interface WsRequestItem {
  uid: string;
  draft?: {
    request?: WsRequestData;
  };
  request?: WsRequestData;
}

interface WsRequestData {
  url: string;
  headers?: Array<{ name: string; value: string; enabled?: boolean }>;
  body?: WsBody;
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
    brunoConfig?: unknown;
  };
  root?: unknown;
  brunoConfig?: {
    scripts?: {
      flow?: string;
    };
  };
  globalEnvironmentVariables?: Record<string, string>;
  oauth2Credentials?: unknown;
}

interface Environment {
  variables?: Array<{ name: string; value: string; enabled?: boolean }>;
}

interface WsSettings {
  timeout?: number;
  keepAliveInterval?: number;
}

interface WsOptions {
  connectOnly?: boolean;
}

interface PreparedWsRequest {
  uid: string;
  mode?: string;
  url: string;
  headers: Record<string, string>;
  processEnvVars: Record<string, string>;
  envVars: Record<string, string>;
  runtimeVariables: Record<string, string>;
  body?: WsBody;
  vars?: unknown;
  collectionVariables?: Record<string, string>;
  folderVariables?: Record<string, string>;
  requestVariables?: Record<string, string>;
  globalEnvironmentVariables?: Record<string, string>;
  oauth2CredentialVariables?: Record<string, string>;
  oauth2?: unknown;
  oauth2Credentials?: unknown;
}

const prepareWsRequest = async (
  item: WsRequestItem,
  collection: Collection,
  environment: Environment | null,
  runtimeVariables: Record<string, string>,
  _certsAndProxyConfig: Record<string, unknown> = {}
): Promise<PreparedWsRequest> => {
  const request = item.draft ? item.draft.request : item.request;
  if (!request) {
    throw new Error('No request found in item');
  }

  const collectionRoot = collection?.draft?.root ? get(collection, 'draft.root', {}) : get(collection, 'root', {});
  const brunoConfig = collection.draft?.brunoConfig
    ? get(collection, 'draft.brunoConfig', {})
    : get(collection, 'brunoConfig', {});
  const rawHeaders = cloneDeep(request.headers ?? []);
  const headers: Record<string, string> = {};

  const scriptFlow = (brunoConfig as { scripts?: { flow?: string } })?.scripts?.flow ?? 'sandwich';
  const requestTreePath = getTreePathFromCollectionToItem(collection as never, item as never);
  if (requestTreePath && requestTreePath.length > 0) {
    mergeHeaders(collection as never, request as never, requestTreePath);
    mergeScripts(collection as never, request as never, requestTreePath, scriptFlow);
    mergeVars(collection as never, request as never, requestTreePath);
    mergeAuth(collection as never, request as never, requestTreePath);
    (request as WsRequestData).globalEnvironmentVariables = collection?.globalEnvironmentVariables;
  }

  each(get(collectionRoot, 'request.headers', []), (h: { enabled?: boolean; name?: string }) => {
    if (h.enabled && h.name?.toLowerCase() === 'content-type') {
      return false;
    }
  });

  each(get(request, 'headers', []), (h: { enabled?: boolean; name: string; value: string }) => {
    if (h.enabled) {
      headers[h.name] = h.value;
    }
  });

  const socketProtocols = rawHeaders
    .filter((header) => {
      return header.name && header.name.toLowerCase() === 'sec-websocket-protocol' && header.enabled;
    })
    .map((d) => d.value.trim())
    .join(',');

  if (socketProtocols.length > 0) {
    headers['Sec-WebSocket-Protocol'] = socketProtocols;
  }

  const envVars = getEnvVars(environment as never);
  const processEnvVars: Record<string, string> = {}; // VS Code doesn't have process env vars like Electron

  let wsRequest: PreparedWsRequest = {
    uid: item.uid,
    mode: request.body?.mode,
    url: request.url,
    headers,
    processEnvVars,
    envVars,
    runtimeVariables,
    body: request.body,
    vars: request.vars,
    collectionVariables: request.collectionVariables,
    folderVariables: request.folderVariables,
    requestVariables: request.requestVariables,
    globalEnvironmentVariables: request.globalEnvironmentVariables,
    oauth2CredentialVariables: request.oauth2CredentialVariables
  };

  wsRequest = setAuthHeaders(wsRequest as never, request as never, collection as never) as unknown as PreparedWsRequest;

  // Interpolate variables
  interpolateVars(wsRequest as never, {
    envVars,
    runtimeVariables,
    processEnvVars,
    collectionVariables: request.collectionVariables,
    folderVariables: request.folderVariables,
    requestVariables: request.requestVariables,
    globalEnvironmentVariables: request.globalEnvironmentVariables
  });

  return wsRequest;
};

let wsClient: WsClient | null = null;

const createSendEvent = () => {
  return (eventName: string, ...args: unknown[]) => {
    sendToWebview(eventName, ...args);
  };
};

const registerWsEventHandlers = (): void => {
  const sendEvent = createSendEvent();
  wsClient = new WsClient(sendEvent);

  registerHandler('renderer:ws:start-connection', async (args) => {
    const [params] = args as [{
      request: WsRequestItem;
      collection: Collection;
      environment: Environment | null;
      runtimeVariables: Record<string, string>;
      settings: WsSettings;
      options?: WsOptions;
    }];

    const { request, collection, environment, runtimeVariables, settings, options = {} } = params;

    try {
      const requestCopy = cloneDeep(request);
      const preparedRequest = await prepareWsRequest(requestCopy, collection, environment, runtimeVariables, {});
      const connectOnly = options?.connectOnly ?? false;
      const requestSent = {
        type: 'request',
        url: preparedRequest.url,
        headers: preparedRequest.headers,
        body: preparedRequest.body,
        timestamp: Date.now()
      };

      if (!connectOnly && wsClient) {
        const hasMessages = preparedRequest.body?.ws?.some((msg) => msg.content?.length);
        if (hasMessages) {
          preparedRequest.body?.ws?.forEach((message) => {
            wsClient?.queueMessage(preparedRequest.uid, collection.uid, message.content);
          });
        }
      }

      const certsAndProxyConfig = await getCertsAndProxyConfig({
        collectionUid: collection.uid,
        collection: collection as never,
        request: requestCopy as never,
        envVars: preparedRequest.envVars,
        runtimeVariables,
        processEnvVars: preparedRequest.processEnvVars,
        collectionPath: collection.pathname,
        globalEnvironmentVariables: collection.globalEnvironmentVariables
      });

      const { httpsAgentRequestFields } = certsAndProxyConfig;

      const sslOptions = {
        rejectUnauthorized: httpsAgentRequestFields.rejectUnauthorized !== false,
        ca: httpsAgentRequestFields.ca,
        cert: httpsAgentRequestFields.cert,
        key: httpsAgentRequestFields.key,
        pfx: httpsAgentRequestFields.pfx,
        passphrase: httpsAgentRequestFields.passphrase
      };

      await wsClient?.startConnection({
        request: preparedRequest as never,
        collection: collection as never,
        options: {
          timeout: settings.timeout,
          keepAlive: settings.keepAliveInterval ? settings.keepAliveInterval > 0 : false,
          keepAliveInterval: settings.keepAliveInterval,
          sslOptions
        }
      });

      sendEvent('main:ws:request', preparedRequest.uid, collection.uid, requestSent);

      return { success: true };
    } catch (error) {
      console.error('Error starting WebSocket connection:', error);
      if (error instanceof Error) {
        sendEvent('main:ws:error', request.uid, collection.uid, { error: error.message });
        throw error;
      }
      sendEvent('main:ws:error', request.uid, collection.uid, { error: String(error) });
      return { success: false, error: String(error) };
    }
  });

  registerHandler('renderer:ws:get-active-connections', async () => {
    try {
      const activeConnectionIds = wsClient?.getActiveConnectionIds() || [];
      return { success: true, activeConnectionIds };
    } catch (error) {
      console.error('Error getting active connections:', error);
      return { success: false, error: (error as Error).message, activeConnectionIds: [] };
    }
  });

  registerHandler('renderer:ws:queue-message', async (args) => {
    const [params] = args as [{
      item: WsRequestItem;
      collection: Collection;
      environment: Environment | null;
      runtimeVariables: Record<string, string>;
      messageContent?: string;
    }];

    const { item, collection, environment, runtimeVariables, messageContent } = params;

    try {
      const itemCopy = cloneDeep(item);
      const preparedRequest = await prepareWsRequest(itemCopy, collection, environment, runtimeVariables, {});

      // If messageContent is provided, find and queue that specific message (interpolated)
      // Otherwise, queue all messages
      if (messageContent !== undefined && messageContent !== null) {
        const originalMessages = itemCopy.draft?.request?.body?.ws || itemCopy.request?.body?.ws || [];
        const messageIndex = originalMessages.findIndex((msg) => msg.content === messageContent);

        if (messageIndex >= 0 && preparedRequest.body?.ws?.[messageIndex]) {
          const message = preparedRequest.body.ws[messageIndex];
          wsClient?.queueMessage(preparedRequest.uid, collection.uid, message.content, message.type);
        } else {
          // Message not found in request body, queue as-is
          wsClient?.queueMessage(preparedRequest.uid, collection.uid, messageContent);
        }
      } else {
        if (preparedRequest.body && preparedRequest.body.ws && Array.isArray(preparedRequest.body.ws)) {
          preparedRequest.body.ws
            .filter((message) => message && message.content)
            .forEach((message) => {
              wsClient?.queueMessage(preparedRequest.uid, collection.uid, message.content, message.type);
            });
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Error queuing WebSocket message:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  registerHandler('renderer:ws:send-message', async (args) => {
    const [requestId, collectionUid, message] = args as [string, string, string];

    try {
      wsClient?.sendMessage(requestId, collectionUid, message);
      return { success: true };
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  registerHandler('renderer:ws:close-connection', async (args) => {
    const [requestId, code, reason] = args as [string, number | undefined, string | undefined];

    try {
      wsClient?.close(requestId, code, reason);
      return { success: true };
    } catch (error) {
      console.error('Error closing WebSocket connection:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  registerHandler('renderer:ws:is-connection-active', async (args) => {
    const [requestId] = args as [string];

    try {
      const isActive = wsClient?.isConnectionActive(requestId) || false;
      return { success: true, isActive };
    } catch (error) {
      console.error('Error checking WebSocket connection status:', error);
      return { success: false, error: (error as Error).message, isActive: false };
    }
  });

  registerHandler('renderer:ws:connection-status', async (args) => {
    const [requestId] = args as [string];

    try {
      const status = wsClient?.connectionStatus(requestId) || 'disconnected';
      return { success: true, status };
    } catch (error) {
      console.error('Error getting WebSocket connection status:', error);
      return { success: false, error: (error as Error).message, status: 'disconnected' };
    }
  });

};

export { registerWsEventHandlers, wsClient };
