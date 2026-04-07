import React from 'react';
import cloneDeep from 'lodash/cloneDeep';
import { resolvePath } from 'utils/filesystem';

// Response types for network operations
interface HttpResponse {
  error?: string | Error;
  data?: string;
  dataBuffer?: string;
  headers?: Record<string, string | string[]>;
  size?: number;
  status?: number;
  statusText?: string;
  duration?: number;
  timeline?: unknown[];
  stream?: unknown;
}

interface GrpcConnectionResult {
  success?: boolean;
  isActive?: boolean;
  error?: string;
}

interface WsConnectionResult {
  success?: boolean;
  isActive?: boolean;
  error?: string;
}

interface IpcOperationResult {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

export const sendNetworkRequest = async (item: any, collection: any, environment: any, runtimeVariables: any) => {
  return new Promise((resolve, reject) => {
    if (['http-request', 'graphql-request'].includes(item.type)) {
      sendHttpRequest(item, collection, environment, runtimeVariables)
        .then((response: HttpResponse) => {
          // if there is an error, we return the response object as is
          if (response?.error) {
            resolve(response);
          }

          resolve({
            state: 'success',
            data: response.data,
            // Note that the Buffer is encoded as a base64 string, because Buffers / TypedArrays are not allowed in the redux store
            dataBuffer: response.dataBuffer,
            headers: response.headers,
            size: response.size,
            status: response.status,
            statusText: response.statusText,
            duration: response.duration,
            timeline: response.timeline,
            stream: response.stream
          });
        })
        .catch((err) => reject(err));
    }
  });
};

export const sendGrpcRequest = async (item: any, collection: any, environment: any, runtimeVariables: any) => {
  return new Promise((resolve, reject) => {
    startGrpcRequest(item, collection, environment, runtimeVariables)
      .then((initialState: Record<string, unknown>) => {
        // The real response data will be handled by event listeners
        resolve({
          ...initialState,
          timeline: []
        });
      })
      .catch((err) => reject(err));
  });
};

const sendHttpRequest = async (item: any, collection: any, environment: any, runtimeVariables: any) => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;

    ipcRenderer
      .invoke('send-http-request', item, collection, environment, runtimeVariables)
      .then(resolve)
      .catch(reject);
  });
};

export const sendCollectionOauth2Request = async (collection: any, environment: any, runtimeVariables: any) => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;
    resolve({});
  });
};

export const fetchGqlSchema = async (endpoint: any, environment: any, request: any, collection: any) => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;

    ipcRenderer.invoke('fetch-gql-schema', endpoint, environment, request, collection).then(resolve).catch(reject);
  });
};

export const cancelNetworkRequest = async (cancelTokenUid: any) => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;

    ipcRenderer.invoke('cancel-http-request', cancelTokenUid).then(resolve).catch(reject);
  });
};

export const startGrpcRequest = async (item: any, collection: any, environment: any, runtimeVariables: any): Promise<Record<string, unknown>> => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;
    const request = item.draft ? item.draft : item;

    ipcRenderer.invoke('grpc:start-connection', {
      request,
      collection,
      environment,
      runtimeVariables
    })
      .then((result) => {
        resolve(result as Record<string, unknown> || {});
      })
      .catch((err) => {
        reject(err);
      });
  });
};

/**
 * Sends a message to an existing gRPC stream
 * @param {string} requestId - The request ID to send a message to
 * @param {Object} message - The message to send
 * @returns {Promise<Object>} - The result of the send operation
 */
export const sendGrpcMessage = async (item: any, collectionUid: any, message: any) => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;
    ipcRenderer.invoke('grpc:send-message', item.uid, collectionUid, message)
      .then(resolve)
      .catch(reject);
  });
};

/**
 * Cancels a running gRPC request
 * @param {string} requestId - The request ID to cancel
 * @returns {Promise<Object>} - The result of the cancel operation
 */
export const cancelGrpcRequest = async (requestId: any) => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;
    ipcRenderer.invoke('grpc:cancel', requestId)
      .then(resolve)
      .catch(reject);
  });
};

/**
 * Ends a gRPC streaming request (client-streaming or bidirectional)
 * @param {string} requestId - The request ID to end
 * @returns {Promise<Object>} - The result of the end operation
 */
export const endGrpcStream = async (requestId: any) => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;
    ipcRenderer.invoke('grpc:end', requestId)
      .then(resolve)
      .catch(reject);
  });
};

export const loadGrpcMethodsFromProtoFile = async (filePath: any, collection: any = null) => {
  return new Promise(async (resolve, reject) => {
    const { ipcRenderer } = window;

    let importPaths = [];

    if (collection) {
      const config = cloneDeep(collection.brunoConfig);

      if (config.protobuf && config.protobuf.importPaths) {
        // Use Promise.all to wait for all resolvePath calls to complete
        const enabledImportPaths = config.protobuf.importPaths.filter((importPath: any) => importPath.enabled);
        importPaths = await Promise.all(enabledImportPaths.map((importPath: any) => {
          return resolvePath(importPath.path, collection.pathname);
        }));
      }
    }

    ipcRenderer.invoke('grpc:load-methods-proto', { filePath, includeDirs: importPaths }).then(resolve).catch(reject);
  });
};

export const cancelGrpcConnection = async (connectionId: any) => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;
    ipcRenderer.invoke('grpc:cancel-request', { requestId: connectionId }).then(resolve).catch(reject);
  });
};

export const endGrpcConnection = async (connectionId: any) => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;
    ipcRenderer.invoke('grpc:end-request', { requestId: connectionId }).then(resolve).catch(reject);
  });
};

/**
 * Check if a gRPC connection is active
 * @param {string} connectionId - The connection ID to check
 * @returns {Promise<boolean>} - Whether the connection is active
 */
export const isGrpcConnectionActive = async (connectionId: any): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;
    ipcRenderer.invoke('grpc:is-connection-active', connectionId)
      .then((response: GrpcConnectionResult) => {
        if (response.success) {
          resolve(response.isActive ?? false);
        } else {
          // If there was an error, assume the connection is not active
          console.error('Error checking connection status:', response.error);
          resolve(false);
        }
      })
      .catch((err) => {
        console.error('Failed to check connection status:', err);
        // On error, assume the connection is not active
        resolve(false);
      });
  });
};

/**
 * Generates a sample gRPC message for a method
 * @param {string} methodPath - The full gRPC method path
 * @param {string|null} existingMessage - Optional existing message JSON string to use as a template
 * @param {Object} options - Additional options for message generation
 * @returns {Promise<Object>} The generated sample message or error
 */
export const generateGrpcSampleMessage = async (methodPath: any, existingMessage: string | null = null, options = {}) => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;

    ipcRenderer.invoke('grpc:generate-sample-message', {
      methodPath,
      existingMessage,
      options
    })
      .then(resolve)
      .catch(reject);
  });
};

export const connectWS = async (item: any, collection: any, environment: any, runtimeVariables: any, options: any) => {
  return new Promise((resolve, reject) => {
    startWsConnection(item, collection, environment, runtimeVariables, options)
      .then((initialState: Record<string, unknown>) => {
        // The real response data will be handled by event listeners
        resolve({
          ...initialState,
          timeline: []
        });
      })
      .catch((err) => reject(err));
  });
};

export const sendWsRequest = async (item: any, collection: any, environment: any, runtimeVariables: any) => {
  const ensureConnection = async () => {
    const connectionStatus = await isWsConnectionActive(item.uid) as WsConnectionResult;
    if (!connectionStatus.isActive) {
      await connectWS(item, collection, environment, runtimeVariables, { connectOnly: true });
    }
  };

  await ensureConnection();

  // Use queueWsMessage helper to queue all messages with proper variable interpolation
  const result = await queueWsMessage(item, collection, environment, runtimeVariables, null) as IpcOperationResult;

  if (result.success) {
    return {};
  } else {
    throw new Error((result.error as string) || 'Failed to queue messages');
  }
};

/**
 * Queues a message to an existing WebSocket connection with variable interpolation
 * @param {Object} item - The request item
 * @param {Object} collection - The collection object
 * @param {Object} environment - The environment variables
 * @param {Object} runtimeVariables - The runtime variables
 * @param {string} messageContent - The message content to queue (or null to queue all messages)
 * @returns {Promise<Object>} - The result of the queue operation
 */
export const queueWsMessage = async (item: any, collection: any, environment: any, runtimeVariables: any, messageContent: any) => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;
    ipcRenderer.invoke('renderer:ws:queue-message', {
      item,
      collection,
      environment,
      runtimeVariables,
      messageContent
    }).then(resolve).catch(reject);
  });
};

export const startWsConnection = async (item: any, collection: any, environment: any, runtimeVariables: any, options: any): Promise<Record<string, unknown>> => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;
    const request = item.draft ? item.draft : item;
    const settings = item.draft ? item.draft.settings : item.settings;

    ipcRenderer
      .invoke('renderer:ws:start-connection', {
        request,
        collection,
        environment,
        runtimeVariables,
        settings,
        options
      })
      .then((result) => {
        resolve(result as Record<string, unknown> || {});
      })
      .catch((err) => {
        reject(err);
      });
  });
};

/**
 * Sends a message to an existing WebSocket connection
 * @param {string} requestId - The request ID to send a message to
 * @param {Object} message - The message to send
 * @returns {Promise<Object>} - The result of the send operation
 */
export const sendWsMessage = async (item: any, collectionUid: any, message: any) => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;
    ipcRenderer.invoke('renderer:ws:send-message', item.uid, collectionUid, message).then(resolve).catch(reject);
  });
};

/**
 * Closes a WebSocket connection
 * @param {string} requestId - The request ID to close
 * @returns {Promise<Object>} - The result of the close operation
 */
export const closeWsConnection = async (requestId: any) => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;
    ipcRenderer.invoke('renderer:ws:close-connection', requestId).then(resolve).catch(reject);
  });
};

/**
 * Checks if a WebSocket connection is active
 * @param {string} requestId - The request ID to check
 * @returns {Promise<boolean>} - Whether the connection is active
 */
export const isWsConnectionActive = async (requestId: any) => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;
    ipcRenderer.invoke('renderer:ws:is-connection-active', requestId).then(resolve).catch(reject);
  });
};

/**
 * Get the connection status of a WebSocket connection
 * @param {string} requestId - The request ID to get the connection status of
 * @returns {Promise<Object>} - The result of the get operation
 */
export const getWsConnectionStatus = async (requestId: any) => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;
    ipcRenderer.invoke('renderer:ws:connection-status', requestId).then(resolve).catch(reject);
  });
};
