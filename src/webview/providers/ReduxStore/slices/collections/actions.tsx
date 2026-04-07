import React from 'react';
import { collectionSchema, environmentSchema, itemSchema } from '@usebruno/schema';
import { parseQueryParams, extractPromptVariables } from '@usebruno/common/utils';
import { REQUEST_TYPES } from 'utils/common/constants';
import cloneDeep from 'lodash/cloneDeep';
import filter from 'lodash/filter';
import find from 'lodash/find';
import get from 'lodash/get';
import set from 'lodash/set';
import trim from 'lodash/trim';
import type { RootState, AppDispatch } from 'providers/ReduxStore/index';
import type { AppCollection, AppItem } from '@bruno-types';
import { variableNameRegex } from 'utils/common/regex';

/** Redux thunk action creator type */
type ThunkAction<R = void> = (dispatch: AppDispatch, getState: () => RootState) => R;

/** Item with optional items array (folder or collection) */
interface ItemContainer {
  items?: AppItem[];
  pathname?: string;
  [key: string]: unknown;
}

/** Dragged item in drag-and-drop operations */
interface DraggedItem {
  uid: string;
  pathname: string;
  sourceCollectionUid?: string;
  type?: string;
  name?: string;
  filename?: string;
  seq?: number;
  [key: string]: unknown;
}

/** Target item in drag-and-drop operations */
interface TargetItem {
  uid: string;
  pathname: string;
  type?: string;
  items?: AppItem[];
  [key: string]: unknown;
}

/** Response with optional data and error */
interface IpcResponse {
  data?: Record<string, unknown>;
  error?: string;
  [key: string]: unknown;
}

/**
 * Safely clone an item, excluding runtime properties that can cause stack overflow.
 * Uses JSON.parse/stringify to avoid issues with Immer proxies and circular references.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const safeCloneItem = (item: any): any => {
  if (!item) return item;

  const excludeProperties = new Set([
    'response',
    'requestState',
    'cancelTokenUid',
    'requestStartTime',
    'requestSent',
    'requestUid'
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cloneItemRecursive = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map(cloneItemRecursive);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered: any = {};
    for (const key of Object.keys(obj)) {
      if (!excludeProperties.has(key)) {
        if (key === 'items' && Array.isArray(obj[key])) {
          filtered[key] = obj[key].map(cloneItemRecursive);
        } else {
          filtered[key] = obj[key];
        }
      }
    }

    try {
      return JSON.parse(JSON.stringify(filtered));
    } catch {
      return cloneDeep(filtered);
    }
  };

  return cloneItemRecursive(item);
};

/**
 * Safely clone a collection, excluding runtime properties from items that can cause stack overflow.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const safeCloneCollection = (collection: any): any => {
  if (!collection) return collection;

  // Clone the collection structure, but filter out response data from items
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cloneItems = (items: any[]): any[] => {
    if (!items || !Array.isArray(items)) return items;
    return items.map((item) => {
      const cloned = safeCloneItem(item);
      if (cloned.items) {
        cloned.items = cloneItems(cloned.items);
      }
      return cloned;
    });
  };

  try {
    const { items, ...collectionWithoutItems } = collection;
    const clonedBase = JSON.parse(JSON.stringify(collectionWithoutItems));
    clonedBase.items = cloneItems(items);
    return clonedBase;
  } catch {
    // Fallback: create a shallow copy and clone items separately
    const cloned = { ...collection };
    cloned.items = cloneItems(collection.items);
    return cloned;
  }
};
import path, { normalizePath } from 'utils/common/path';
import { insertTaskIntoQueue } from 'providers/ReduxStore/slices/app';
import toast from 'react-hot-toast';
import {
  findCollectionByUid,
  findEnvironmentInCollection,
  findItemInCollection,
  findParentItemInCollection,
  isItemAFolder,
  refreshUidsInItem,
  isItemARequest,
  getAllVariables,
  transformRequestToSaveToFilesystem,
  transformCollectionRootToSave
} from 'utils/collections';
import { uuid, waitForNextTick } from 'utils/common';
import { cancelNetworkRequest, connectWS, sendGrpcRequest, sendNetworkRequest, sendWsRequest } from 'utils/network/index';
import { callIpc } from 'utils/common/ipc';
import brunoClipboard from 'utils/bruno-clipboard';

import {
  collectionAddEnvFileEvent as _collectionAddEnvFileEvent,
  createCollection as _createCollection,
  removeCollection as _removeCollection,
  selectEnvironment as _selectEnvironment,
  sortCollections as _sortCollections,
  updateCollectionMountStatus,
  moveCollection,
  requestCancelled,
  resetRunResults,
  responseReceived,
  updateLastAction,
  setCollectionSecurityConfig,
  collectionAddOauth2CredentialsByUrl,
  collectionClearOauth2CredentialsByUrl,
  initRunRequestEvent,
  updateRunnerConfiguration as _updateRunnerConfiguration,
  updateActiveConnections,
  saveRequest as _saveRequest,
  saveEnvironment as _saveEnvironment,
  saveCollectionDraft,
  saveFolderDraft,
  addVar,
  updateVar,
  addFolderVar,
  updateFolderVar,
  addCollectionVar,
  updateCollectionVar
} from './index';

import { each } from 'lodash';
import { closeAllCollectionTabs, updateResponsePaneScrollPosition } from 'providers/ReduxStore/slices/tabs';
import { removeCollectionFromWorkspace, addCollectionToWorkspace } from 'providers/ReduxStore/slices/workspaces';
import { resolveRequestFilename } from 'utils/common/platform';
import { interpolateUrl, parsePathParams, splitOnFirst } from 'utils/url/index';
import { sendCollectionOauth2Request as _sendCollectionOauth2Request } from 'utils/network/index';
import {
  getGlobalEnvironmentVariables,
  findCollectionByPathname,
  findEnvironmentInCollectionByName,
  getReorderedItemsInTargetDirectory,
  resetSequencesInFolder,
  getReorderedItemsInSourceDirectory,
  calculateDraggedItemNewPathname,
  transformFolderRootToSave,
  getTreePathFromCollectionToItem,
  mergeHeaders
} from 'utils/collections/index';
import { sanitizeName } from 'utils/common/regex';
import { buildPersistedEnvVariables } from 'utils/environments';
import { safeParseJSON, safeStringifyJSON } from 'utils/common/index';
import { resolveInheritedAuth } from 'utils/auth';
import { addTab } from 'providers/ReduxStore/slices/tabs';
import { updateSettingsSelectedTab } from './index';
import { saveGlobalEnvironment } from 'providers/ReduxStore/slices/global-environments';

interface generateUniqueNameProps {
  newName?: unknown;
  newFilename?: unknown;
  itemUid?: string;
  collectionUid?: string;
  targetDirname?: unknown;
  sourcePathname?: unknown;
  targetItem?: unknown;
  draggedItem: unknown;
  dropType?: unknown;
  itemsToResequence?: unknown[];
  name?: (...args: unknown[]) => unknown;
  variables?: unknown[];
  persistentEnvVariables?: boolean;
  pathname?: unknown;
  collectionPathname?: unknown;
  brunoConfig?: unknown;
}

// generate a unique names
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const generateUniqueName = (originalName: string, existingItems: any[], isFolder: boolean): { newName: string; newFilename: string } => {
  const baseName = originalName.replace(/\s*\(\d+\)$/, '');
  const baseFilename = sanitizeName(baseName);

  const existingFilenames = existingItems
    .filter((item) => isFolder ? item.type === 'folder' : item.type !== 'folder')
    .map((item) => {
      const filename = trim(item.filename ?? '');
      // For requests, remove file extension (.bru, .yml, .yaml)
      return isFolder ? filename : filename.replace(/\.(bru|yml|yaml)$/, '');
    });

  // Check if base name conflicts with existing items
  if (!existingFilenames.includes(baseFilename)) {
    return { newName: baseName, newFilename: baseFilename };
  }

  // Find highest counter among conflicting names
  const counters = existingFilenames
    .filter((filename) => filename === baseFilename || filename.startsWith(`${baseFilename} (`))
    .map((filename) => {
      if (filename === baseFilename) return 0;
      const match = filename.match(/\((\d+)\)$/);
      return match ? parseInt(match[1], 10) : 0;
    });

  const nextCounter = Math.max(0, ...counters) + 1;
  return {
    newName: `${baseName} (${nextCounter})`,
    newFilename: `${baseFilename} (${nextCounter})`
  };
};

export const renameCollection = (newName: string, collectionUid: string): ThunkAction<Promise<unknown>> => (dispatch, getState) => {
  const state = getState();
  const collection = findCollectionByUid(state.collections.collections, collectionUid);

  return new Promise((resolve, reject) => {
    if (!collection) {
      return reject(new Error('Collection not found'));
    }
    const { ipcRenderer } = window;
    ipcRenderer.invoke('renderer:rename-collection', newName, collection.pathname).then(resolve).catch(reject);
  });
};

/**
 * Validates that all assertion names and variable names in a request item
 * follow the valid naming pattern (alphanumeric, dash, underscore, dot)
 */
const validateRequestNames = (item: any): string | null => {
  const request = item.draft?.request || item.request;
  if (!request) return null;

  // Validate assertions
  const assertions = request.assertions || [];
  for (const assertion of assertions) {
    if (assertion.name && assertion.name.trim() !== '' && !variableNameRegex.test(assertion.name)) {
      return `Invalid assertion name "${assertion.name}". Must only contain alphanumeric characters, "-", "_", "."`;
    }
  }

  // Validate request vars
  const reqVars = request.vars?.req || [];
  for (const v of reqVars) {
    if (v.name && v.name.trim() !== '' && !variableNameRegex.test(v.name)) {
      return `Invalid variable name "${v.name}". Must only contain alphanumeric characters, "-", "_", "."`;
    }
  }

  // Validate response vars
  const resVars = request.vars?.res || [];
  for (const v of resVars) {
    if (v.name && v.name.trim() !== '' && !variableNameRegex.test(v.name)) {
      return `Invalid variable name "${v.name}". Must only contain alphanumeric characters, "-", "_", "."`;
    }
  }

  return null;
};

export const saveRequest = (itemUid: string, collectionUid: string, silent = false): ThunkAction<Promise<unknown>> => (dispatch, getState) => {
  const state = getState();
  const collection = findCollectionByUid(state.collections.collections, collectionUid);

  return new Promise((resolve, reject) => {
    if (!collection) {
      return reject(new Error('Collection not found'));
    }

    const collectionCopy = safeCloneCollection(collection);
    const item = findItemInCollection(collectionCopy, itemUid);
    if (!item) {
      return reject(new Error('Not able to locate item'));
    }

    // Validate assertion and variable names before saving
    const validationError = validateRequestNames(item);
    if (validationError) {
      toast.error(validationError);
      return reject(new Error(validationError));
    }

    const itemToSave = transformRequestToSaveToFilesystem(item);
    const { ipcRenderer } = window;

    itemSchema
      .validate(itemToSave)
      .then(() => ipcRenderer.invoke('renderer:save-request', item.pathname, itemToSave, collection.format))
      .then(() => {
        if (!silent) {
          toast.success('Request saved successfully');
        }
        dispatch(
          _saveRequest({
            itemUid,
            collectionUid
          })
        );
      })
      .then(resolve)
      .catch((err: Error) => {
        toast.error(err.message || 'Failed to save request!');
        reject(err);
      });
  });
};

interface ItemToSave {
  collectionUid: string;
  pathname: string;
  [key: string]: unknown;
}

export const saveMultipleRequests = (items: ItemToSave[]): ThunkAction<Promise<unknown>> => (dispatch, getState) => {
  const state = getState();
  const { collections } = state.collections;

  return new Promise((resolve, reject) => {
    const itemsToSave: Array<{ item: unknown; pathname: string; format: string | undefined }> = [];
    each(items, (item) => {
      const collection = findCollectionByUid(collections, item.collectionUid);
      if (collection) {
        const itemToSave = transformRequestToSaveToFilesystem(item);
        const itemIsValid = itemSchema.validateSync(itemToSave);
        if (itemIsValid) {
          itemsToSave.push({
            item: itemToSave,
            pathname: item.pathname,
            format: collection.format
          });
        }
      }
    });

    const { ipcRenderer } = window;

    ipcRenderer
      .invoke('renderer:save-multiple-requests', itemsToSave)
      .then(resolve)
      .catch((err: Error) => {
        toast.error('Failed to save requests!');
        reject(err);
      });
  });
};

export const saveCollectionRoot = (collectionUid: string): ThunkAction<Promise<unknown>> => (dispatch, getState) => {
  const state = getState();
  const collection = findCollectionByUid(state.collections.collections, collectionUid);

  return new Promise((resolve, reject) => {
    if (!collection) {
      return reject(new Error('Collection not found'));
    }

    const collectionCopy = safeCloneCollection(collection);

    const collectionRootToSave = transformCollectionRootToSave(collectionCopy);
    const { ipcRenderer } = window;

    ipcRenderer
      .invoke('renderer:save-collection-root', collectionCopy.pathname, collectionRootToSave, collectionCopy.brunoConfig)
      .then(() => {
        toast.success('Collection Settings saved successfully');
        dispatch(saveCollectionDraft({ collectionUid }));
      })
      .then(resolve)
      .catch((err) => {
        toast.error('Failed to save collection settings!');
        reject(err);
      });
  });
};

export const saveFolderRoot = (collectionUid: string, folderUid: string, silent = false): ThunkAction<Promise<unknown>> => (dispatch, getState) => {
  const state = getState();
  const collection = findCollectionByUid(state.collections.collections, collectionUid);
  const folder = findItemInCollection(collection, folderUid);

  return new Promise((resolve, reject) => {
    if (!collection) {
      return reject(new Error('Collection not found'));
    }

    if (!folder) {
      return reject(new Error('Folder not found'));
    }

    const { ipcRenderer } = window;

    // Use draft if it exists, otherwise use root
    const folderRootToSave = transformFolderRootToSave(folder);

    const folderData = {
      name: folder.name,
      folderPathname: folder.pathname,
      collectionPathname: collection.pathname,
      root: folderRootToSave
    };

    ipcRenderer
      .invoke('renderer:save-folder-root', folderData)
      .then(() => {
        if (!silent) {
          toast.success('Folder Settings saved successfully');
        }
        // If there was a draft, save it to root and clear the draft
        if (folder.draft) {
          dispatch(saveFolderDraft({ collectionUid, folderUid }));
        }
      })
      .then(resolve)
      .catch((err) => {
        toast.error('Failed to save folder settings!');
        reject(err);
      });
  });
};

interface CollectionDraftInfo {
  collectionUid: string;
}

export const saveMultipleCollections = (collectionDrafts: CollectionDraftInfo[]): ThunkAction<Promise<unknown>> => (dispatch, getState) => {
  const state = getState();
  const { collections } = state.collections;

  return new Promise((resolve, reject) => {
    const savePromises: any = [];

    each(collectionDrafts, (collectionDraft) => {
      const collection = findCollectionByUid(collections, collectionDraft.collectionUid);
      if (collection) {
        const collectionCopy = safeCloneCollection(collection);
        const collectionRootToSave = transformCollectionRootToSave(collectionCopy);
        const { ipcRenderer } = window;

        let savePromises = [];

        savePromises.push(ipcRenderer.invoke('renderer:save-collection-root', collectionCopy.pathname, collectionRootToSave, collectionCopy.brunoConfig));

        if (collectionCopy.draft?.brunoConfig) {
          // Pass collectionRootToSave to preserve headers/auth/scripts for YML format
          savePromises.push(ipcRenderer.invoke('renderer:update-bruno-config', collectionCopy.draft.brunoConfig, collectionCopy.pathname, collectionRootToSave));
        }

        Promise.all(savePromises)
          .then(() => {
            dispatch(saveCollectionDraft({ collectionUid: collectionDraft.collectionUid }));
          })
          .catch((err) => {
            toast.error('Failed to save collection settings!');
            reject(err);
          });
      }
    });

    Promise.all(savePromises)
      .then(resolve)
      .catch((err) => {
        toast.error('Failed to save collection settings!');
        reject(err);
      });
  });
};

interface FolderDraftInfo {
  collectionUid: string;
  folderUid: string;
}

export const saveMultipleFolders = (folderDrafts: FolderDraftInfo[]): ThunkAction<Promise<unknown>> => (dispatch, getState) => {
  const state = getState();
  const { collections } = state.collections;

  return new Promise((resolve, reject) => {
    const savePromises: any = [];

    each(folderDrafts, (folderDraft) => {
      const collection = findCollectionByUid(collections, folderDraft.collectionUid);
      const folder = collection ? findItemInCollection(collection, folderDraft.folderUid) : null;

      if (collection && folder) {
        const folderRootToSave = transformFolderRootToSave(folder);
        const folderData = {
          name: folder.name,
          folderPathname: folder.pathname,
          collectionPathname: collection.pathname,
          root: folderRootToSave
        };

        const { ipcRenderer } = window;
        const savePromise = ipcRenderer
          .invoke('renderer:save-folder-root', folderData)
          .then(() => {
            if (folder.draft) {
              dispatch(saveFolderDraft({ collectionUid: folderDraft.collectionUid, folderUid: folderDraft.folderUid }));
            }
          });

        savePromises.push(savePromise);
      }
    });

    Promise.all(savePromises)
      .then(resolve)
      .catch((err) => {
        toast.error('Failed to save folder settings!');
        reject(err);
      });
  });
};

export const sendCollectionOauth2Request = (collectionUid: string, itemUid: string): ThunkAction<Promise<unknown>> => (dispatch, getState) => {
  const state = getState();
  const { globalEnvironments, activeGlobalEnvironmentUid } = state.globalEnvironments;
  const collection = findCollectionByUid(state.collections.collections, collectionUid);

  return new Promise((resolve, reject) => {
    if (!collection) {
      return reject(new Error('Collection not found'));
    }

    let collectionCopy = safeCloneCollection(collection);

    const globalEnvironmentVariables = getGlobalEnvironmentVariables({
      globalEnvironments,
      activeGlobalEnvironmentUid
    });
    collectionCopy.globalEnvironmentVariables = globalEnvironmentVariables;

    const environment = findEnvironmentInCollection(collectionCopy, collection.activeEnvironmentUid);

    _sendCollectionOauth2Request(collectionCopy, environment, collectionCopy.runtimeVariables)
      .then((response: IpcResponse) => {
        if (response?.data?.error) {
          toast.error(String(response.data.error));
        } else {
          toast.success('Request made successfully');
        }
        return response;
      })
      .then(resolve)
      .catch((err: Error) => {
        toast.error(err.message);
      });
  });
};

export const wsConnectOnly = (item: AppItem, collectionUid: string): ThunkAction<Promise<unknown>> => (dispatch, getState) => {
  const state = getState();
  const { globalEnvironments, activeGlobalEnvironmentUid } = state.globalEnvironments;
  const collection = findCollectionByUid(state.collections.collections, collectionUid);

  return new Promise(async (resolve, reject) => {
    if (!collection) {
      return reject(new Error('Collection not found'));
    }

    let collectionCopy = safeCloneCollection(collection);

    const itemCopy = safeCloneItem(item);

    const requestUid = uuid();
    itemCopy.requestUid = requestUid;

    const globalEnvironmentVariables = getGlobalEnvironmentVariables({
      globalEnvironments,
      activeGlobalEnvironmentUid
    });
    collectionCopy.globalEnvironmentVariables = globalEnvironmentVariables;

    const environment = findEnvironmentInCollection(collectionCopy, collectionCopy.activeEnvironmentUid);

    connectWS(itemCopy, collectionCopy, environment, collectionCopy.runtimeVariables, { connectOnly: true })
      .then(resolve)
      .catch((err: Error) => {
        toast.error(err.message);
      });
  });
};

/**
 * Extract prompt variables from a request, collection, and environment variables.
 * Tries to respect the hierarchy of the variables and avoid unnecessary prompts as much as possible
 *
 * @param {*} item
 * @param {*} collection
 * @returns {Promise<Object>} A promise that resolves with the prompt variables or null if no prompt variables are found
 */
const extractPromptVariablesForRequest = async (item: AppItem, collection: AppCollection): Promise<Record<string, string> | null> => {
  return new Promise(async (resolve, reject) => {
    if (typeof window === 'undefined' || typeof window.promptForVariables !== 'function') {
      console.error('Failed to initialize prompt variables: window.promptForVariables is not available. '
        + 'This may indicate an initialization issue with the app environment.');
      return resolve(null);
    }

    const prompts = [];
    const request = item.draft?.request ?? item.request ?? {};
    const allVariables = getAllVariables(collection, item);
    const clientCertConfig = get(collection, 'brunoConfig.clientCertificates.certs', []);
    const requestTreePath = getTreePathFromCollectionToItem(collection, item);
    const headers = mergeHeaders(collection, request, requestTreePath);
    const resolvedAuthRequest = resolveInheritedAuth(item, collection);

    for (let clientCert of clientCertConfig) {
      const domain = interpolateUrl({ url: clientCert?.domain, variables: allVariables });

      if (domain) {
        const hostRegex = '^(https:\\/\\/|grpc:\\/\\/|grpcs:\\/\\/)?' + domain.replaceAll('.', '\\.').replaceAll('*', '.*');
        const requestUrl = interpolateUrl({ url: request.url, variables: allVariables });
        if (requestUrl.match(hostRegex)) {
          prompts.push(...extractPromptVariables(clientCert));
        }
      }
    }

    // Attempt to extract unique prompt variables from anywhere in the request and environment variables.
    prompts.push(...extractPromptVariables(allVariables));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bodyContent = (request.body as any)?.[request.body?.mode as string];
    prompts.push(...extractPromptVariables(bodyContent));
    prompts.push(...extractPromptVariables(headers as any));
    prompts.push(...extractPromptVariables((request as any).params));
    prompts.push(...extractPromptVariables(resolvedAuthRequest.auth));
    prompts.push(...extractPromptVariables(request.url));

    const uniquePrompts = Array.from(new Set(prompts));

    // If no prompt variables are found, return null
    if (!uniquePrompts?.length) {
      return resolve(null);
    }

    try {
      // Prompt user for values if any prompt variables are found
      const userValues = await window.promptForVariables(uniquePrompts);
      const promptVariables: Record<string, string> = {};
      // Populate runtimeVariables with user input for prompt variables
      for (const prompt of uniquePrompts) {
        promptVariables[`?${prompt}`] = (userValues as Record<string, string>)[prompt] ?? '';
      }

      return resolve(promptVariables);
    } catch (error) {
      return reject(error);
    }
  });
};

export const sendRequest = (item: AppItem, collectionUid: string): ThunkAction<Promise<void>> => (dispatch, getState) => {
  const state = getState();
  const { globalEnvironments, activeGlobalEnvironmentUid } = state.globalEnvironments;
  const collection = findCollectionByUid(state.collections.collections, collectionUid);
  const itemUid = item?.uid;

  return new Promise<void>(async (resolve, reject) => {
    if (!collection) {
      return reject(new Error('Collection not found'));
    }

    let collectionCopy = safeCloneCollection(collection);

    const itemCopy = safeCloneItem(item);

    const globalEnvironmentVariables = getGlobalEnvironmentVariables({
      globalEnvironments,
      activeGlobalEnvironmentUid
    });
    collectionCopy.globalEnvironmentVariables = globalEnvironmentVariables;

    const requestUid = uuid();
    itemCopy.requestUid = requestUid;

    try {
      const promptVariables = await extractPromptVariablesForRequest(itemCopy, collectionCopy);
      collectionCopy.promptVariables = promptVariables ?? {};
    } catch (error) {
      if (error === 'cancelled') {
        return resolve(); // Resolve without error if user cancels prompt
      }
      return reject(error);
    }

    await dispatch(
      updateResponsePaneScrollPosition({
        uid: state.tabs.activeTabUid,
        scrollY: 0
      })
    );

    await dispatch(
      initRunRequestEvent({
        requestUid,
        itemUid,
        collectionUid
      })
    );

    const environment = findEnvironmentInCollection(collectionCopy, collectionCopy.activeEnvironmentUid);
    const isGrpcRequest = itemCopy.type === 'grpc-request';
    const isWsRequest = itemCopy.type === 'ws-request';
    if (isGrpcRequest) {
      sendGrpcRequest(itemCopy, collectionCopy, environment, collectionCopy.runtimeVariables)
        .then(() => resolve())
        .catch((err: Error) => {
          toast.error(err.message);
        });
    } else if (isWsRequest) {
      sendWsRequest(itemCopy, collectionCopy, environment, collectionCopy.runtimeVariables)
        .then(() => resolve())
        .catch((err: Error) => {
          toast.error(err.message);
        });
    } else {
      sendNetworkRequest(itemCopy, collectionCopy, environment, collectionCopy.runtimeVariables)
        .then((response: Record<string, unknown>) => {
          interface TimelineEntry {
            timestamp: Date | number;
            [key: string]: unknown;
          }
          const serializedResponse = {
            ...response,
            timeline: (response.timeline as TimelineEntry[] | undefined)?.map((entry) => ({
              ...entry,
              timestamp: entry.timestamp instanceof Date ? entry.timestamp.getTime() : entry.timestamp
            }))
          };

          dispatch(
            responseReceived({
              itemUid,
              collectionUid,
              response: serializedResponse
            })
          );
        })
        .then(() => resolve())
        .catch((err: Error) => {
          if (err && err.message === 'Error invoking remote method \'send-http-request\': Error: Request cancelled') {
            dispatch(
              responseReceived({
                itemUid,
                collectionUid,
                response: null
              })
            );
            return;
          }

          const errorResponse = {
            status: 'Error',
            isError: true,
            error: err.message ?? 'Something went wrong',
            size: 0,
            duration: 0
          };

          dispatch(
            responseReceived({
              itemUid,
              collectionUid,
              response: errorResponse
            })
          );
        });
    }
  });
};

export const cancelRequest = (cancelTokenUid: string, item: AppItem, collection: AppCollection): ThunkAction => (dispatch) => {
  cancelNetworkRequest(cancelTokenUid)
    .then(() => {
      dispatch(
        requestCancelled({
          itemUid: item.uid,
          collectionUid: collection.uid
        })
      );
    })
    .catch((err: Error) => console.error(err));
};

export const cancelRunnerExecution = (cancelTokenUid: string): ThunkAction => (dispatch) => {
  cancelNetworkRequest(cancelTokenUid).catch((err: Error) => console.error(err));
};

interface RunnerTags {
  include?: string[];
  exclude?: string[];
}

export const runCollectionFolder
  = (collectionUid: string, folderUid: string | null, recursive: boolean, delay: number, tags: RunnerTags | null, selectedRequestUids: string[] | null): ThunkAction<Promise<unknown>> => (dispatch, getState) => {
    const state = getState();
    const { globalEnvironments, activeGlobalEnvironmentUid } = state.globalEnvironments;
    const collection = findCollectionByUid(state.collections.collections, collectionUid);

    return new Promise((resolve, reject) => {
      if (!collection) {
        return reject(new Error('Collection not found'));
      }

      let collectionCopy = safeCloneCollection(collection);

      const globalEnvironmentVariables = getGlobalEnvironmentVariables({
        globalEnvironments,
        activeGlobalEnvironmentUid
      });
      collectionCopy.globalEnvironmentVariables = globalEnvironmentVariables;

      const folder = findItemInCollection(collectionCopy, folderUid);

      if (folderUid && !folder) {
        return reject(new Error('Folder not found'));
      }

      const environment = findEnvironmentInCollection(collectionCopy, collection.activeEnvironmentUid);

      dispatch(
        resetRunResults({
          collectionUid: collection.uid
        })
      );

      const { ipcRenderer } = window;
      ipcRenderer
        .invoke(
          'renderer:run-collection-folder',
          folder,
          collectionCopy,
          environment,
          collectionCopy.runtimeVariables,
          recursive,
          delay,
          tags,
          selectedRequestUids
        )
        .then(resolve)
        .catch((err) => {
          toast.error(get(err, 'error.message') || 'Something went wrong!');
          reject(err);
        });
    });
  };

export const newFolder = (folderName: string, directoryName: string, collectionUid: string, itemUid: string | null): ThunkAction<Promise<unknown>> => (dispatch, getState) => {
  const state = getState();
  const collection = findCollectionByUid(state.collections.collections, collectionUid);
  const parentItem = itemUid ? findItemInCollection(collection, itemUid) : collection;
  const items = filter(parentItem.items, (i) => isItemAFolder(i) || isItemARequest(i));

  return new Promise((resolve, reject) => {
    if (!collection) {
      return reject(new Error('Collection not found'));
    }

    if (!itemUid) {
      const folderWithSameNameExists = find(
        collection.items,
        (i) => i.type === 'folder' && trim(i.filename) === trim(directoryName)
      );
      if (!folderWithSameNameExists) {
        const fullName = path.join(collection.pathname, directoryName);
        const { ipcRenderer } = window;

        ipcRenderer
          .invoke('renderer:new-folder', fullName, collection.pathname)
          .then(resolve)
          .catch((error) => reject(error));
      } else {
        return reject(new Error('Duplicate folder names under same parent folder are not allowed'));
      }
    } else {
      const currentItem = findItemInCollection(collection, itemUid);
      if (currentItem) {
        const folderWithSameNameExists = find(
          currentItem.items,
          (i) => i.type === 'folder' && trim(i.filename) === trim(directoryName)
        );
        if (!folderWithSameNameExists) {
          const fullName = path.join(currentItem.pathname, directoryName);
          const { ipcRenderer } = window;

          ipcRenderer
            .invoke('renderer:new-folder', fullName, collection.pathname)
            .then(resolve)
            .catch((error) => reject(error));
        } else {
          return reject(new Error('Duplicate folder names under same parent folder are not allowed'));
        }
      } else {
        return reject(new Error('unable to find parent folder'));
      }
    }
  });
};

interface RenameItemParams {
  newName?: string;
  newFilename?: string;
  itemUid: string;
  collectionUid: string;
}

export const renameItem
  = ({
  newName,
  newFilename,
  itemUid,
  collectionUid
}: RenameItemParams): ThunkAction<Promise<void>> =>
    (dispatch, getState) => {
      const state = getState();
      const collection = findCollectionByUid(state.collections.collections, collectionUid);

      return new Promise<void>((resolve, reject) => {
        if (!collection) {
          return reject(new Error('Collection not found'));
        }

        const collectionCopy = safeCloneCollection(collection);
        const item = findItemInCollection(collectionCopy, itemUid);
        if (!item) {
          return reject(new Error('Unable to locate item'));
        }

        const { ipcRenderer } = window;

        const dirname = path.dirname(item.pathname);
        const effectiveFilename = newFilename || newName;
        if (!effectiveFilename) {
          return resolve();
        }

        let newPath = '';
        if (item.type === 'folder') {
          newPath = path.join(dirname, trim(effectiveFilename));
        } else {
          const filename = resolveRequestFilename(effectiveFilename, collection.format);
          newPath = path.join(dirname, filename);
        }

        // Use the existing renderer:rename-item handler which expects [oldPath, newPath, newName]
        ipcRenderer
          .invoke('renderer:rename-item', item.pathname, newPath, newName || effectiveFilename)
          .then(() => resolve())
          .catch((err) => reject(err));
      });
    };

export const cloneItem = (newName: string, newFilename: string, itemUid: string, collectionUid: string): ThunkAction<Promise<unknown>> => (dispatch, getState) => {
  const state = getState();
  const collection = findCollectionByUid(state.collections.collections, collectionUid);

  return new Promise((resolve, reject) => {
    if (!collection) {
      throw new Error('Collection not found');
    }
    const collectionCopy = safeCloneCollection(collection);
    const item = findItemInCollection(collectionCopy, itemUid);
    if (!item) {
      throw new Error('Unable to locate item');
    }

    if (isItemAFolder(item)) {
      const parentFolder = findParentItemInCollection(collection, item.uid) || collection;

      const folderWithSameNameExists = find(
        parentFolder.items,
        (i) => i.type === 'folder' && trim(i?.filename) === trim(newFilename)
      );

      if (folderWithSameNameExists) {
        return reject(new Error('Duplicate folder names under same parent folder are not allowed'));
      }

      set(item, 'name', newName);
      set(item, 'filename', newFilename);
      set(item, 'root.meta.name', newName);
      set(item, 'root.meta.seq', parentFolder?.items?.length + 1);

      const collectionPath = path.join(parentFolder.pathname, newFilename);

      const { ipcRenderer } = window;
      ipcRenderer.invoke('renderer:clone-folder', item, collectionPath, collection.pathname).then(resolve).catch(reject);
      return;
    }

    const parentItem = findParentItemInCollection(collectionCopy, itemUid);
    const filename = resolveRequestFilename(newFilename, collection.format);
    const itemToSave = refreshUidsInItem(transformRequestToSaveToFilesystem(item));
    set(itemToSave, 'name', trim(newName));
    set(itemToSave, 'filename', trim(filename));
    if (!parentItem) {
      const reqWithSameNameExists = find(
        collection.items,
        (i) => i.type !== 'folder' && trim(i.filename) === trim(filename)
      );
      if (!reqWithSameNameExists) {
        const fullPathname = path.join(collection.pathname, filename);
        const { ipcRenderer } = window;
        const requestItems = filter(collection.items, (i) => i.type !== 'folder');
        itemToSave.seq = requestItems ? requestItems.length + 1 : 1;

        itemSchema
          .validate(itemToSave)
          .then(() => ipcRenderer.invoke('renderer:new-request', fullPathname, itemToSave))
          .then(resolve)
          .catch(reject);

        dispatch(
          insertTaskIntoQueue({
            uid: uuid(),
            type: 'OPEN_REQUEST',
            collectionUid,
            itemPathname: fullPathname
          })
        );
      } else {
        return reject(new Error('Duplicate request names are not allowed under the same folder'));
      }
    } else {
      const reqWithSameNameExists = find(
        parentItem.items,
        (i) => i.type !== 'folder' && trim(i.filename) === trim(filename)
      );
      if (!reqWithSameNameExists) {
        const dirname = path.dirname(item.pathname);
        const fullName = path.join(dirname, filename);
        const { ipcRenderer } = window;
        const requestItems = filter(parentItem.items, (i) => i.type !== 'folder');
        itemToSave.seq = requestItems ? requestItems.length + 1 : 1;

        itemSchema
          .validate(itemToSave)
          .then(() => ipcRenderer.invoke('renderer:new-request', fullName, itemToSave))
          .then(resolve)
          .catch(reject);

        dispatch(
          insertTaskIntoQueue({
            uid: uuid(),
            type: 'OPEN_REQUEST',
            collectionUid,
            itemPathname: fullName
          })
        );
      } else {
        return reject(new Error('Duplicate request names are not allowed under the same folder'));
      }
    }
  });
};

export const pasteItem = (targetCollectionUid: string, targetItemUid: string | null = null): ThunkAction<Promise<void>> => (dispatch, getState) => {
  const state = getState();

  const clipboardResult = brunoClipboard.read();

  if (!clipboardResult.hasData) {
    return Promise.reject(new Error('No item in clipboard'));
  }

  const targetCollection = findCollectionByUid(state.collections.collections, targetCollectionUid);

  if (!targetCollection) {
    return Promise.reject(new Error('Target collection not found'));
  }

  return new Promise<void>(async (resolve, reject) => {
    try {
      for (const clipboardItem of clipboardResult.items) {
        const copiedItem = safeCloneItem(clipboardItem);

        const targetCollectionCopy = safeCloneCollection(targetCollection);
        let targetItem = null;
        let targetParentPathname = targetCollection.pathname;

        // If targetItemUid is provided, we're pasting into a folder
        if (targetItemUid) {
          targetItem = findItemInCollection(targetCollectionCopy, targetItemUid);
          if (!targetItem) {
            return reject(new Error('Target folder not found'));
          }
          if (!isItemAFolder(targetItem)) {
            return reject(new Error('Target must be a folder or collection'));
          }
          targetParentPathname = targetItem.pathname;
        }

        const existingItems = targetItem ? targetItem.items : targetCollection.items;

        if (isItemAFolder(copiedItem)) {
          const { newName, newFilename } = generateUniqueName(copiedItem.name, existingItems, true);

          set(copiedItem, 'name', newName);
          set(copiedItem, 'filename', newFilename);
          set(copiedItem, 'root.meta.name', newName);
          set(copiedItem, 'root.meta.seq', (existingItems?.length ?? 0) + 1);

          const fullPathname = path.join(targetParentPathname, newFilename);
          const { ipcRenderer } = window;

          await ipcRenderer.invoke('renderer:clone-folder', copiedItem, fullPathname, targetCollection.pathname);
        } else {
          const { newName, newFilename } = generateUniqueName(copiedItem.name, existingItems, false);

          const filename = resolveRequestFilename(newFilename, targetCollection.format);
          const itemToSave = refreshUidsInItem(transformRequestToSaveToFilesystem(copiedItem));
          set(itemToSave, 'name', trim(newName));
          set(itemToSave, 'filename', trim(filename));

          const fullPathname = path.join(targetParentPathname, filename);
          const { ipcRenderer } = window;
          const requestItems = filter(existingItems, (i) => i.type !== 'folder');
          itemToSave.seq = requestItems ? requestItems.length + 1 : 1;

          await itemSchema.validate(itemToSave);
          await ipcRenderer.invoke('renderer:new-request', fullPathname, itemToSave, targetCollection.format);

          dispatch(insertTaskIntoQueue({
            uid: uuid(),
            type: 'OPEN_REQUEST',
            collectionUid: targetCollectionUid,
            itemPathname: fullPathname
          }));
        }
      }

      resolve();
    } catch (error) {
      reject(error);
    }
  });
};

export const deleteItem = (itemUid: string, collectionUid: string): ThunkAction<Promise<void>> => (dispatch, getState) => {
  const state = getState();
  const collection = findCollectionByUid(state.collections.collections, collectionUid);

  return new Promise<void>((resolve, reject) => {
    if (!collection) {
      return reject(new Error('Collection not found'));
    }

    const item = findItemInCollection(collection, itemUid);
    if (item) {
      const parentDirectoryItem = findParentItemInCollection(collection, itemUid) || collection;
      const { ipcRenderer } = window;

      ipcRenderer
        .invoke('renderer:delete-item', item.pathname, collection.pathname)
        .then(async () => {
          // Reorder items in parent directory after deletion
          if (parentDirectoryItem.items) {
            const requestAndFolderTypes = [...REQUEST_TYPES, 'folder'];
            const directoryItemsWithOnlyRequestAndFolders = parentDirectoryItem.items.filter((i) => requestAndFolderTypes.includes(i.type));
            const directoryItemsWithoutDeletedItem = directoryItemsWithOnlyRequestAndFolders.filter((i) => i.uid !== itemUid);
            const reorderedSourceItems = getReorderedItemsInSourceDirectory({
              items: directoryItemsWithoutDeletedItem
            });
            if (reorderedSourceItems?.length) {
              await dispatch(updateItemsSequences({ itemsToResequence: reorderedSourceItems, collectionUid }));
            }
          }
          resolve();
        })
        .catch((error) => reject(error));
    } else {
      return reject(new Error('Unable to locate item'));
    }
  });
};

interface SortCollectionsPayload {
  order: 'default' | 'alphabetical' | 'reverseAlphabetical';
}

export const sortCollections = (payload: SortCollectionsPayload): ThunkAction => (dispatch) => {
  dispatch(_sortCollections(payload));
};

interface MoveItemParams {
  targetDirname: string;
  sourcePathname: string;
}

export const moveItem
  = ({
  targetDirname,
  sourcePathname
}: MoveItemParams): ThunkAction<Promise<unknown>> =>
    (dispatch, getState) => {
      return new Promise((resolve, reject) => {
        const { ipcRenderer } = window;

        ipcRenderer.invoke('renderer:move-item', { targetDirname, sourcePathname }).then(resolve).catch(reject);
      });
    };

interface HandleCollectionItemDropParams {
  targetItem: TargetItem;
  draggedItem: DraggedItem;
  dropType: 'adjacent' | 'inside';
  collectionUid: string;
}

export const handleCollectionItemDrop
  = ({
  targetItem,
  draggedItem,
  dropType,
  collectionUid
}: HandleCollectionItemDropParams): ThunkAction<Promise<void>> =>
    (dispatch, getState) => {
      const state = getState();
      const collection = findCollectionByUid(state.collections.collections, collectionUid);
      // if its withincollection set the source to current collection,
      // if its cross collection set the source to the source collection
      const sourceCollectionUid = draggedItem.sourceCollectionUid;
      const isCrossCollectionMove = sourceCollectionUid && collectionUid !== sourceCollectionUid;
      const sourceCollection = isCrossCollectionMove ? findCollectionByUid(state.collections.collections, sourceCollectionUid) : collection;
      const { uid: draggedItemUid, pathname: draggedItemPathname } = draggedItem;
      const { uid: targetItemUid, pathname: targetItemPathname } = targetItem;
      const targetItemDirectory = findParentItemInCollection(collection, targetItemUid) || collection;
      const targetItemDirectoryItems = targetItemDirectory.items?.map(safeCloneItem) || [];
      const draggedItemDirectory = findParentItemInCollection(sourceCollection, draggedItemUid) || sourceCollection;
      const draggedItemDirectoryItems = draggedItemDirectory.items?.map(safeCloneItem) || [];

      interface MoveToNewLocationParams {
        draggedItem: DraggedItem;
        draggedItemDirectoryItems: AppItem[];
        targetItem: TargetItem;
        targetItemDirectoryItems: AppItem[];
        newPathname: string;
        dropType: 'adjacent' | 'inside';
      }

      const handleMoveToNewLocation = async ({
        draggedItem,
        draggedItemDirectoryItems,
        targetItem,
        targetItemDirectoryItems,
        newPathname,
        dropType
      }: MoveToNewLocationParams): Promise<void> => {
        const { uid: targetItemUid } = targetItem;
        const { pathname: draggedItemPathname, uid: draggedItemUid } = draggedItem;

        const newDirname = path.dirname(newPathname);
        await dispatch(moveItem({
          targetDirname: newDirname,
          sourcePathname: draggedItemPathname
        }));

        if (draggedItemDirectoryItems?.length) {
          // reorder items in the source directory
          const draggedItemDirectoryItemsWithoutDraggedItem = draggedItemDirectoryItems.filter((i) => i.uid !== draggedItemUid);
          const reorderedSourceItems = getReorderedItemsInSourceDirectory({
            items: draggedItemDirectoryItemsWithoutDraggedItem
          });
          if (reorderedSourceItems?.length) {
            await dispatch(updateItemsSequences({ itemsToResequence: reorderedSourceItems, collectionUid: sourceCollectionUid || collectionUid }));
          }
        }

        if (dropType === 'adjacent') {
          const targetItemIndex = targetItemDirectoryItems.findIndex((i) => i.uid === targetItemUid);
          const targetItemSequence = targetItemIndex >= 0 ? targetItemDirectoryItems[targetItemIndex]?.seq : undefined;

          const draggedItemWithNewPathAndSequence = {
            ...draggedItem,
            pathname: newPathname,
            seq: targetItemSequence
          };

          // draggedItem is added to the targetItem's directory
          const reorderedTargetItems = getReorderedItemsInTargetDirectory({
            items: [...targetItemDirectoryItems, draggedItemWithNewPathAndSequence],
            targetItemUid,
            draggedItemUid
          });

          if (reorderedTargetItems?.length) {
            await dispatch(updateItemsSequences({ itemsToResequence: reorderedTargetItems, collectionUid }));
          }
        }
      };

      interface ReorderInSameLocationParams {
        draggedItem: DraggedItem;
        targetItem: TargetItem;
        targetItemDirectoryItems: AppItem[];
      }

      const handleReorderInSameLocation = async ({
        draggedItem,
        targetItem,
        targetItemDirectoryItems
      }: ReorderInSameLocationParams): Promise<void> => {
        const { uid: targetItemUid } = targetItem;
        const { uid: draggedItemUid } = draggedItem;

        // reorder items in the targetItem's directory
        const reorderedItems = getReorderedItemsInTargetDirectory({
          items: targetItemDirectoryItems,
          targetItemUid,
          draggedItemUid
        });

        if (reorderedItems?.length) {
          await dispatch(updateItemsSequences({ itemsToResequence: reorderedItems, collectionUid }));
        }
      };

      return new Promise<void>(async (resolve, reject) => {
        try {
          const newPathname = calculateDraggedItemNewPathname({
            draggedItem,
            targetItem,
            dropType,
            collectionPathname: collection.pathname
          });
          if (!newPathname) return;
          if (targetItemPathname?.startsWith(draggedItemPathname)) return;
          if (newPathname !== draggedItemPathname) {
            await handleMoveToNewLocation({
              targetItem,
              targetItemDirectoryItems,
              draggedItem,
              draggedItemDirectoryItems,
              newPathname,
              dropType
            });
          } else {
            await handleReorderInSameLocation({ draggedItem, targetItemDirectoryItems, targetItem });
          }
          resolve();
        } catch (error: unknown) {
          console.error(error);
          toast.error((error as Error)?.message);
          reject(error);
        }
      });
    };

interface UpdateItemsSequencesParams {
  itemsToResequence: Array<{ pathname: string; seq: number }>;
  collectionUid: string;
}

export const updateItemsSequences
  = ({
  itemsToResequence,
  collectionUid
}: UpdateItemsSequencesParams): ThunkAction<Promise<unknown>> =>
    (dispatch, getState) => {
      return new Promise((resolve, reject) => {
        const state = getState();
        const collection = findCollectionByUid(state.collections.collections, collectionUid);

        if (!collection) {
          return reject(new Error('Collection not found'));
        }

        const { ipcRenderer } = window;

        ipcRenderer.invoke('renderer:resequence-items', itemsToResequence, collection.pathname).then(resolve).catch(reject);
      });
    };

interface NewHttpRequestParams {
  requestName: string;
  filename: string;
  requestType: string;
  requestUrl: string;
  requestMethod: string;
  collectionUid: string;
  itemUid?: string | null;
  headers?: unknown[];
  body?: Record<string, unknown>;
  auth?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

export const newHttpRequest = (params: NewHttpRequestParams): ThunkAction<Promise<void>> => (dispatch, getState) => {
  const {
    requestName,
    filename,
    requestType,
    requestUrl,
    requestMethod,
    collectionUid,
    itemUid,
    headers,
    body,
    auth,
    settings
  } = params;

  return new Promise<void>((resolve, reject) => {
    const state = getState();
    const collection = findCollectionByUid(state.collections.collections, collectionUid);
    if (!collection) {
      return reject(new Error('Collection not found'));
    }

    interface RequestParam {
      name: string;
      value: string;
      enabled?: boolean;
      type?: 'query' | 'path';
    }

    const parts = splitOnFirst(requestUrl, '?');
    const queryParams = (parseQueryParams(parts[1]) ?? []) as RequestParam[];
    each(queryParams, (urlParam) => {
      urlParam.enabled = true;
      urlParam.type = 'query';
    });

    const pathParams = parsePathParams(requestUrl) as RequestParam[];
    each(pathParams, (pathParam) => {
      pathParam.enabled = true;
      pathParam.type = 'path';
    });

    const requestParams = [...queryParams, ...pathParams];

    const item: Record<string, unknown> = {
      uid: uuid(),
      type: requestType,
      name: requestName,
      filename,
      request: {
        method: requestMethod,
        url: requestUrl,
        headers: headers ?? [],
        params: requestParams,
        body: body ?? {
          mode: 'none',
          json: null,
          text: null,
          xml: null,
          sparql: null,
          multipartForm: [],
          formUrlEncoded: [],
          file: []
        },
        vars: {
          req: [] as unknown[],
          res: [] as unknown[]
        },
        assertions: [] as unknown[],
        auth: auth ?? {
          mode: 'inherit'
        }
      },
      settings: settings ?? {
        encodeUrl: true
      }
    };

    // itemUid is null when we are creating a new request at the root level
    const resolvedFilename = resolveRequestFilename(filename, collection.format);
    if (!itemUid) {
      const reqWithSameNameExists = find(
        collection.items,
        (i) => i.type !== 'folder' && trim(i.filename) === trim(resolvedFilename)
      );
      const items = filter(collection.items, (i) => isItemAFolder(i) || isItemARequest(i));
      item.seq = items.length + 1;

      if (!reqWithSameNameExists) {
        const fullName = path.join(collection.pathname, resolvedFilename);
        const { ipcRenderer } = window;

        ipcRenderer
          .invoke('renderer:new-request', fullName, item)
          .then(() => {
            // task middleware will track this and open the new request in a new tab once request is created
            dispatch(
              insertTaskIntoQueue({
                uid: uuid(),
                type: 'OPEN_REQUEST',
                collectionUid,
                itemPathname: fullName
              })
            );
            resolve();
          })
          .catch(reject);
      } else {
        return reject(new Error('Duplicate request names are not allowed under the same folder'));
      }
    } else {
      const currentItem = findItemInCollection(collection, itemUid);
      if (currentItem) {
        const reqWithSameNameExists = find(
          currentItem.items,
          (i) => i.type !== 'folder' && trim(i.filename) === trim(resolvedFilename)
        );
        const items = filter(currentItem.items, (i) => isItemAFolder(i) || isItemARequest(i));
        item.seq = items.length + 1;
        if (!reqWithSameNameExists) {
          const fullName = path.join(currentItem.pathname, resolvedFilename);
          const { ipcRenderer } = window;
          ipcRenderer
            .invoke('renderer:new-request', fullName, item)
            .then(() => {
              // task middleware will track this and open the new request in a new tab once request is created
              dispatch(
                insertTaskIntoQueue({
                  uid: uuid(),
                  type: 'OPEN_REQUEST',
                  collectionUid,
                  itemPathname: fullName
                })
              );
              resolve();
            })
            .catch(reject);
        } else {
          return reject(new Error('Duplicate request names are not allowed under the same folder'));
        }
      } else {
        return reject(new Error('Unable to locate folder'));
      }
    }
  });
};

interface NewGrpcRequestParams {
  requestName: string;
  filename: string;
  requestUrl: string;
  collectionUid: string;
  body?: Record<string, unknown>;
  auth?: Record<string, unknown>;
  headers?: unknown[];
  itemUid?: string | null;
}

export const newGrpcRequest = (params: NewGrpcRequestParams): ThunkAction<Promise<void>> => (dispatch, getState) => {
  const { requestName, filename, requestUrl, collectionUid, body, auth, headers, itemUid } = params;

  return new Promise<void>((resolve, reject) => {
    const state = getState();
    const collection = findCollectionByUid(state.collections.collections, collectionUid);
    if (!collection) {
      return reject(new Error('Collection not found'));
    }
    // do we need to handle query, path params for grpc requests?
    // skipping for now

    const item: Record<string, unknown> = {
      uid: uuid(),
      name: requestName,
      filename,
      type: 'grpc-request',
      headers: headers ?? [],
      request: {
        url: requestUrl,
        body: body ?? {
          mode: 'grpc',
          grpc: [
            {
              name: 'message 1',
              content: '{}'
            }
          ]
        },
        auth: auth ?? {
          mode: 'inherit'
        },
        vars: {
          req: [] as unknown[],
          res: [] as unknown[]
        },
        script: {
          req: null as string | null,
          res: null as string | null
        },
        assertions: [] as unknown[],
        tests: null as string | null
      }
    };

    // itemUid is null when we are creating a new request at the root level
    const parentItem = itemUid ? findItemInCollection(collection, itemUid) : collection;
    const resolvedFilename = resolveRequestFilename(filename, collection.format);

    if (!parentItem) {
      return reject(new Error('Parent item not found'));
    }

    const reqWithSameNameExists = find(parentItem.items,
      (i) => i.type !== 'folder' && trim(i.filename) === trim(resolvedFilename));

    if (reqWithSameNameExists) {
      return reject(new Error('Duplicate request names are not allowed under the same folder'));
    }

    const items = filter(parentItem.items, (i) => isItemAFolder(i) || isItemARequest(i));
    item.seq = items.length + 1;
    const fullName = path.join(parentItem.pathname, resolvedFilename);
    const { ipcRenderer } = window;
    ipcRenderer
      .invoke('renderer:new-request', fullName, item)
      .then(() => {
        // task middleware will track this and open the new request in a new tab once request is created
        dispatch(insertTaskIntoQueue({
          uid: uuid(),
          type: 'OPEN_REQUEST',
          collectionUid,
          itemPathname: fullName
        }));
        resolve();
      })
      .catch(reject);
  });
};

interface NewWsRequestParams {
  requestName: string;
  requestMethod: string;
  filename: string;
  requestUrl: string;
  collectionUid: string;
  body?: Record<string, unknown>;
  auth?: Record<string, unknown>;
  headers?: unknown[];
  itemUid?: string | null;
}

export const newWsRequest = (params: NewWsRequestParams): ThunkAction<Promise<void>> => (dispatch, getState) => {
  const { requestName, requestMethod, filename, requestUrl, collectionUid, body, auth, headers, itemUid } = params;

  return new Promise<void>((resolve, reject) => {
    const state = getState();
    const collection = findCollectionByUid(state.collections.collections, collectionUid);
    if (!collection) {
      return reject(new Error('Collection not found'));
    }

    const item: Record<string, unknown> = {
      uid: uuid(),
      name: requestName,
      filename,
      type: 'ws-request',
      headers: headers ?? [],
      request: {
        url: requestUrl,
        method: requestMethod,
        params: [] as unknown[],
        body: body ?? {
          mode: 'ws',
          ws: [
            {
              name: 'message 1',
              type: 'json',
              content: '{}'
            }
          ]
        },
        auth: auth ?? {
          mode: 'inherit'
        },
        vars: {
          req: [] as unknown[],
          res: [] as unknown[]
        },
        script: {
          req: null as string | null,
          res: null as string | null
        },
        assertions: [] as unknown[],
        tests: null as string | null
      }
    };

    // itemUid is null when we are creating a new request at the root level
    const parentItem = itemUid ? findItemInCollection(collection, itemUid) : collection;
    const resolvedFilename = resolveRequestFilename(filename, collection.format);

    if (!parentItem) {
      return reject(new Error('Parent item not found'));
    }

    const reqWithSameNameExists = find(parentItem.items,
      (i) => i.type !== 'folder' && trim(i.filename) === trim(resolvedFilename));

    if (reqWithSameNameExists) {
      return reject(new Error('Duplicate request names are not allowed under the same folder'));
    }

    const items = filter(parentItem.items, (i) => isItemAFolder(i) || isItemARequest(i));
    item.seq = items.length + 1;
    const fullName = path.join(parentItem.pathname, resolvedFilename);
    const { ipcRenderer } = window;
    ipcRenderer
      .invoke('renderer:new-request', fullName, item)
      .then(() => {
        // task middleware will track this and open the new request in a new tab once request is created
        dispatch(insertTaskIntoQueue({
          uid: uuid(),
          type: 'OPEN_REQUEST',
          collectionUid,
          itemPathname: fullName
        }));
        resolve();
      })
      .catch(reject);
  });
};

export const loadGrpcMethodsFromReflection = (item: AppItem, collectionUid: string, url: string): ThunkAction<Promise<void>> => async (dispatch, getState) => {
  const state = getState();
  const collection = findCollectionByUid(state.collections.collections, collectionUid);
  const { globalEnvironments, activeGlobalEnvironmentUid } = state.globalEnvironments;

  return new Promise<void>(async (resolve, reject) => {
    if (!collection) {
      return reject(new Error('Collection not found'));
    }

    const itemCopy = safeCloneItem(item);
    const requestItem = itemCopy.draft ? itemCopy.draft : itemCopy;
    requestItem.request.url = url;
    const collectionCopy = safeCloneCollection(collection);
    const globalEnvironmentVariables = getGlobalEnvironmentVariables({
      globalEnvironments,
      activeGlobalEnvironmentUid
    });
    collectionCopy.globalEnvironmentVariables = globalEnvironmentVariables;
    const environment = findEnvironmentInCollection(collectionCopy, collectionCopy.activeEnvironmentUid);
    const runtimeVariables = collectionCopy.runtimeVariables;

    try {
      const promptVariables = await extractPromptVariablesForRequest(itemCopy, collectionCopy);
      if (promptVariables) {
        collectionCopy.promptVariables = promptVariables;
      }
    } catch (error) {
      if (error === 'cancelled') {
        return resolve(); // Resolve without error if user cancels prompt
      }
      return reject(error);
    }

    const { ipcRenderer } = window;
    ipcRenderer
      .invoke('grpc:load-methods-reflection', {
        request: requestItem,
        collection: collectionCopy,
        environment,
        runtimeVariables
      })
      .then(resolve)
      .catch(reject);
  });
};

export const generateGrpcurlCommand = (item: AppItem, collectionUid: string): ThunkAction<Promise<unknown>> => async (dispatch, getState) => {
  const state = getState();
  const collection = findCollectionByUid(state.collections.collections, collectionUid);
  const { globalEnvironments, activeGlobalEnvironmentUid } = state.globalEnvironments;

  return new Promise((resolve, reject) => {
    if (!collection) {
      return reject(new Error('Collection not found'));
    }

    const itemCopy = safeCloneItem(item);
    const collectionCopy = safeCloneCollection(collection);

    const globalEnvironmentVariables = getGlobalEnvironmentVariables({
      globalEnvironments,
      activeGlobalEnvironmentUid
    });
    collectionCopy.globalEnvironmentVariables = globalEnvironmentVariables;
    const environment = findEnvironmentInCollection(collectionCopy, collectionCopy.activeEnvironmentUid);
    const runtimeVariables = collectionCopy.runtimeVariables;

    const { ipcRenderer } = window;
    ipcRenderer
      .invoke('grpc:generate-grpcurl', { request: itemCopy, collection: collectionCopy, environment, runtimeVariables })
      .then(resolve)
      .catch(reject);
  });
};

export const addEnvironment = (name: string, collectionUid: string): ThunkAction<Promise<unknown>> => (dispatch, getState) => {
  return new Promise((resolve, reject) => {
    const state = getState();
    const collection = findCollectionByUid(state.collections.collections, collectionUid);
    if (!collection) {
      return reject(new Error('Collection not found'));
    }

    const { ipcRenderer } = window;
    ipcRenderer
      .invoke('renderer:create-environment', collection.pathname, name)
      .then(() => {
        dispatch(
          updateLastAction({
            collectionUid,
            lastAction: {
              type: 'ADD_ENVIRONMENT',
              payload: name
            }
          })
        );
      })
      .then(resolve)
      .catch(reject);
  });
};

interface ImportEnvironmentParams {
  name: string;
  variables: Array<{ name: string; value: string; secret?: boolean }>;
  collectionUid: string;
}

export const importEnvironment = ({
  name,
  variables,
  collectionUid
}: ImportEnvironmentParams): ThunkAction<Promise<unknown>> => (dispatch, getState) => {
  return new Promise((resolve, reject) => {
    const state = getState();
    const collection = findCollectionByUid(state.collections.collections, collectionUid);
    if (!collection) {
      return reject(new Error('Collection not found'));
    }

    const sanitizedName = sanitizeName(name);

    const { ipcRenderer } = window;
    ipcRenderer
      .invoke('renderer:create-environment', collection.pathname, sanitizedName, variables)
      .then(() => {
        dispatch(
          updateLastAction({
            collectionUid,
            lastAction: {
              type: 'ADD_ENVIRONMENT',
              payload: sanitizedName
            }
          })
        );
      })
      .then(resolve)
      .catch(reject);
  });
};

interface EnvironmentVariable {
  name: string;
  value: string;
  secret?: boolean;
  ephemeral?: boolean;
}

export const copyEnvironment = (name: string, baseEnvUid: string, collectionUid: string): ThunkAction<Promise<unknown>> => (dispatch, getState) => {
  return new Promise((resolve, reject) => {
    const state = getState();
    const collection = findCollectionByUid(state.collections.collections, collectionUid);
    if (!collection) {
      return reject(new Error('Collection not found'));
    }

    const baseEnv = findEnvironmentInCollection(collection, baseEnvUid);
    if (!collection) {
      return reject(new Error('Environment not found'));
    }

    const sanitizedName = sanitizeName(name);

    const { ipcRenderer } = window;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const variablesToCopy = (baseEnv.variables || [])
      .filter((v: any) => !v.ephemeral)
      .map(({ ephemeral, ...rest }: any) => rest);

    ipcRenderer
      .invoke('renderer:create-environment', collection.pathname, sanitizedName, variablesToCopy)
      .then(() => {
        dispatch(
          updateLastAction({
            collectionUid,
            lastAction: {
              type: 'ADD_ENVIRONMENT',
              payload: sanitizedName
            }
          })
        );
      })
      .then(resolve)
      .catch(reject);
  });
};

export const renameEnvironment = (newName: string, environmentUid: string, collectionUid: string): ThunkAction<Promise<unknown>> => (dispatch, getState) => {
  return new Promise((resolve, reject) => {
    const state = getState();
    const collection = findCollectionByUid(state.collections.collections, collectionUid);
    if (!collection) {
      return reject(new Error('Collection not found'));
    }

    const collectionCopy = safeCloneCollection(collection);
    const environment = findEnvironmentInCollection(collectionCopy, environmentUid);
    if (!environment) {
      return reject(new Error('Environment not found'));
    }

    const sanitizedName = sanitizeName(newName);
    const oldName = environment.name;
    environment.name = sanitizedName;

    const { ipcRenderer } = window;
    environmentSchema
      .validate(environment)
      .then(() => ipcRenderer.invoke('renderer:rename-environment', collection.pathname, oldName, sanitizedName))
      .then(resolve)
      .catch(reject);
  });
};

export const deleteEnvironment = (environmentUid: string, collectionUid: string): ThunkAction<Promise<unknown>> => (dispatch, getState) => {
  return new Promise((resolve, reject) => {
    const state = getState();
    const collection = findCollectionByUid(state.collections.collections, collectionUid);
    if (!collection) {
      return reject(new Error('Collection not found'));
    }

    const collectionCopy = safeCloneCollection(collection);

    const environment = findEnvironmentInCollection(collectionCopy, environmentUid);
    if (!environment) {
      return reject(new Error('Environment not found'));
    }

    const { ipcRenderer } = window;
    ipcRenderer
      .invoke('renderer:delete-environment', collection.pathname, environment.name)
      .then(resolve)
      .catch(reject);
  });
};

export const saveEnvironment = (variables: any, environmentUid: any, collectionUid: any) => (dispatch: any, getState: any) => {
  return new Promise((resolve, reject) => {
    const state = getState();
    const collection = findCollectionByUid(state.collections.collections, collectionUid);
    if (!collection) {
      return reject(new Error('Collection not found'));
    }

    const collectionCopy = safeCloneCollection(collection);
    const environment = findEnvironmentInCollection(collectionCopy, environmentUid);
    if (!environment) {
      return reject(new Error('Environment not found'));
    }

    /*
     Modal Save writes what the user sees:
     - Non-ephemeral vars are saved as-is (without metadata)
     - Ephemeral vars:
       - if persistedValue exists, save that (explicit persisted case)
       - otherwise save the current UI value (treat as user-authored)
     */
    const persisted = buildPersistedEnvVariables(variables, { mode: 'save' });
    environment.variables = persisted as any[];

    const { ipcRenderer } = window;
    const envForValidation = cloneDeep(environment);

    environmentSchema
      .validate(environment)
      .then(() => ipcRenderer.invoke('renderer:save-environment', collection.pathname, envForValidation))
      .then(() => {
        // Immediately sync Redux to the saved (persisted) set so old ephemerals
        // aren’t around when the watcher event arrives.
        dispatch(_saveEnvironment({ variables: persisted as any[], environmentUid, collectionUid }));
      })
      .then(resolve)
      .catch(reject);
  });
};

/**
 * Update a variable value in its detected scope (inline editing)
 * @param {string} variableName - Name of the variable to update
 * @param {string} newValue - New value for the variable
 * @param {Object} scopeInfo - Scope information from getVariableScope()
 * @param {string} collectionUid - Collection UID
 */
export const updateVariableInScope = (variableName: any, newValue: any, scopeInfo: any, collectionUid: any) => (dispatch: any, getState: any) => {
  return new Promise((resolve, reject) => {
    if (!scopeInfo || !variableName) {
      return reject(new Error('Invalid scope information or variable name'));
    }

    const state = getState();
    const collection = findCollectionByUid(state.collections.collections, collectionUid);

    try {
      const { type, data } = scopeInfo;

      if (type === 'process.env') {
        toast.error('Process environment variables cannot be edited');
        return reject(new Error('Process environment variables are read-only'));
      }

      if (type === 'runtime') {
        toast.error('Runtime variables are set by scripts and cannot be edited');
        return reject(new Error('Runtime variables are read-only'));
      }

      if (type !== 'global' && !collection) {
        return reject(new Error('Collection not found'));
      }

      switch (type) {
        case 'environment': {
          const { environment, variable } = data;

          if (!variable) {
            return reject(new Error('Variable not found'));
          }

          const updatedVariables = environment.variables.map((v: any) => v.uid === variable.uid ? { ...v, value: newValue } : v);

          return dispatch(saveEnvironment(updatedVariables, environment.uid, collectionUid))
            .then(() => {
              toast.success(`Variable "${variableName}" updated`);
            })
            .then(resolve)
            .catch(reject);
        }

        case 'collection': {
          const { variable } = data;

          if (variable) {
            dispatch(updateCollectionVar({
              collectionUid,
              varType: 'req',
              variable: { ...variable, value: newValue }
            }));
          } else {
            dispatch(addCollectionVar({
              collectionUid,
              varType: 'req',
              varData: { name: variableName, value: newValue, enabled: true }
            } as any));
          }

          return dispatch(saveCollectionRoot(collectionUid))
            .then(resolve)
            .catch(reject);
        }

        case 'folder': {
          const { folder, variable } = data;

          if (variable) {
            dispatch(updateFolderVar({
              collectionUid,
              folderUid: folder.uid,
              varType: 'req',
              variable: { ...variable, value: newValue }
            }));
          } else {
            dispatch(addFolderVar({
              collectionUid,
              folderUid: folder.uid,
              varType: 'req',
              varData: { name: variableName, value: newValue, enabled: true }
            } as any));
          }

          return dispatch(saveFolderRoot(collectionUid, folder.uid))
            .then(resolve)
            .catch(reject);
        }

        case 'request': {
          const { item, variable } = data;

          if (variable) {
            dispatch(updateVar({
              collectionUid,
              itemUid: item.uid,
              varType: 'req',
              variable: { ...variable, value: newValue }
            }));
          } else {
            dispatch(addVar({
              collectionUid,
              itemUid: item.uid,
              varType: 'req',
              varData: { name: variableName, value: newValue, local: false, enabled: true }
            } as any));
          }

          return dispatch(saveRequest(item.uid, collectionUid, true))
            .then(resolve)
            .catch(reject);
        }

        case 'global': {
          const globalEnvironments = state.globalEnvironments?.globalEnvironments || [];
          const activeGlobalEnvUid = state.globalEnvironments?.activeGlobalEnvironmentUid;

          if (!activeGlobalEnvUid) {
            return reject(new Error('No active global environment'));
          }

          const environment = globalEnvironments.find((env: any) => env.uid === activeGlobalEnvUid);

          if (!environment) {
            return reject(new Error('Global environment not found'));
          }

          const variable = environment.variables.find((v: any) => v.name === variableName && v.enabled);

          if (!variable) {
            return reject(new Error('Variable not found'));
          }

          const updatedVariables = environment.variables.map((v: any) => v.uid === variable.uid ? { ...v, value: newValue } : v);

          return dispatch(saveGlobalEnvironment({ variables: updatedVariables, environmentUid: activeGlobalEnvUid }))
            .then(() => {
              toast.success(`Variable "${variableName}" updated`);
            })
            .then(resolve)
            .catch(reject);
        }

        default:
          return reject(new Error(`Unknown scope type: ${type}`));
      }
    } catch (error) {
      toast.error(`Failed to update variable: ${error.message}`);
      reject(error);
    }
  });
};

export const mergeAndPersistEnvironment
  = ({
  persistentEnvVariables,
  collectionUid
}: any) =>
    (_dispatch: any, getState: any) => {
      return new Promise<void>((resolve, reject) => {
        const state = getState();
        const collection = findCollectionByUid(state.collections.collections, collectionUid);

        if (!collection) {
          return reject(new Error('Collection not found'));
        }

        const environmentUid = collection.activeEnvironmentUid;
        if (!environmentUid) {
          return reject(new Error('No active environment found'));
        }

        const collectionCopy = safeCloneCollection(collection);
        const environment = findEnvironmentInCollection(collectionCopy, environmentUid);
        if (!environment) {
          return reject(new Error('Environment not found'));
        }

        // Only proceed if there are persistent variables to save
        if (!persistentEnvVariables || Object.keys(persistentEnvVariables).length === 0) {
          return resolve();
        }

        let existingVars = environment.variables || [];

        let normalizedNewVars = Object.entries(persistentEnvVariables).map(([name, value]) => ({
          uid: uuid(),
          name,
          value,
          type: 'text',
          enabled: true,
          secret: false
        }));

        const merged = existingVars.map((v: any) => {
          const found = normalizedNewVars.find((nv) => nv.name === v.name);
          if (found) {
            return { ...v, value: found.value };
          }
          return v;
        });
        normalizedNewVars.forEach((nv) => {
          if (!merged.some((v: any) => v.name === nv.name)) {
            merged.push(nv);
          }
        });

        const persistedNames = new Set(Object.keys(persistentEnvVariables));

        existingVars.forEach((v: any) => {
          if (!v.ephemeral) {
            persistedNames.add(v.name);
          }
        });

        const environmentToSave = cloneDeep(environment);
        environmentToSave.variables = buildPersistedEnvVariables(merged, { mode: 'merge', persistedNames }) as any[];

        const { ipcRenderer } = window;
        environmentSchema
          .validate(environmentToSave)
          .then(() => ipcRenderer.invoke('renderer:save-environment', collection.pathname, environmentToSave))
          .then(resolve)
          .catch(reject);
      });
    };

export const selectEnvironment = (environmentUid: any, collectionUid: any) => (dispatch: any, getState: any) => {
  return new Promise<void>((resolve, reject) => {
    const state = getState();
    const collection = findCollectionByUid(state.collections.collections, collectionUid);
    if (!collection) {
      return reject(new Error('Collection not found'));
    }

    const collectionCopy = safeCloneCollection(collection);

    const environmentName = environmentUid ? findEnvironmentInCollection(collectionCopy, environmentUid)?.name : null;

    if (environmentUid && !environmentName) {
      return reject(new Error('Environment not found'));
    }

    const { ipcRenderer } = window;
    ipcRenderer.invoke('renderer:update-ui-state-snapshot', {
      type: 'COLLECTION_ENVIRONMENT',
      data: { collectionPath: collection?.pathname, environmentName }
    });

    dispatch(_selectEnvironment({ environmentUid, collectionUid }));
    resolve();
  });
};

export const removeCollection = (collectionUid: any) => (dispatch: any, getState: any) => {
  return new Promise((resolve, reject) => {
    const state = getState();
    const collection = findCollectionByUid(state.collections.collections, collectionUid);
    if (!collection) {
      return reject(new Error('Collection not found'));
    }
    const { ipcRenderer } = window;

    const { workspaces } = state;
    const activeWorkspace = workspaces.workspaces.find((w: any) => w.uid === workspaces.activeWorkspaceUid);

    let workspaceId = 'default';
    if (activeWorkspace) {
      if (activeWorkspace.pathname) {
        workspaceId = activeWorkspace.pathname;
      } else {
        workspaceId = activeWorkspace.uid;
      }
    }

    ipcRenderer
      .invoke('renderer:remove-collection', collection.pathname, collectionUid, workspaceId)
      .then(() => {
        return ipcRenderer.invoke('renderer:get-collection-workspaces', collection.pathname);
      })
      .then((remainingWorkspaces: unknown[]) => {
        dispatch(closeAllCollectionTabs({ collectionUid }));

        if (activeWorkspace) {
          dispatch(removeCollectionFromWorkspace({
            workspaceUid: activeWorkspace.uid,
            collectionLocation: collection.pathname
          }));
        }

        // Only remove from Redux if no workspaces remain
        if (!remainingWorkspaces || remainingWorkspaces.length === 0) {
          return waitForNextTick().then(() => {
            dispatch(_removeCollection({
              collectionUid: collectionUid
            }));
          });
        } else {
          // Collection still exists in other workspaces
        }
      })
      .then(resolve)
      .catch(reject);
  });
};

export const browseDirectory = () => (dispatch: any, getState: any) => {
  const { ipcRenderer } = window;

  return new Promise((resolve, reject) => {
    ipcRenderer.invoke('renderer:browse-directory').then(resolve).catch(reject);
  });
};

export const browseFiles = (filters: any, properties: any) => (_dispatch: any, _getState: any) => {
  const { ipcRenderer } = window;

  return new Promise((resolve, reject) => {
    ipcRenderer.invoke('renderer:browse-files', filters, properties).then(resolve).catch(reject);
  });
};

export const saveCollectionSettings = (collectionUid: any, brunoConfig: Record<string, unknown> | null = null, silent = false) => (dispatch: any, getState: any) => {
  const state = getState();
  const collection = findCollectionByUid(state.collections.collections, collectionUid);

  return new Promise((resolve, reject) => {
    if (!collection) {
      return reject(new Error('Collection not found'));
    }

    const collectionCopy = safeCloneCollection(collection);

    const collectionRootToSave = transformCollectionRootToSave(collectionCopy);
    const { ipcRenderer } = window;

    const savePromises = [];

    savePromises.push(ipcRenderer.invoke('renderer:save-collection-root', collectionCopy.pathname, collectionRootToSave, collectionCopy.brunoConfig));

    const brunoConfigToSave = brunoConfig || (collectionCopy.draft && collectionCopy.draft.brunoConfig);
    if (brunoConfigToSave) {
      // Pass transformed collectionRootToSave instead of collectionCopy.root
      // For YML format, update-bruno-config also writes to opencollection.yml,
      // so it needs the transformed root data to avoid overwriting headers/auth/scripts
      savePromises.push(ipcRenderer.invoke('renderer:update-bruno-config', brunoConfigToSave, collectionCopy.pathname, collectionRootToSave));
    }

    Promise.all(savePromises)
      .then(() => {
        if (!silent) {
          toast.success('Collection Settings saved successfully');
        }
        dispatch(saveCollectionDraft({ collectionUid }));
      })
      .then(resolve)
      .catch((err) => {
        toast.error('Failed to save collection settings!');
        reject(err);
      });
  });
};

export const updateBrunoConfig = (brunoConfig: any, collectionUid: any) => (dispatch: any, getState: any) => {
  const state = getState();

  const collection = findCollectionByUid(state.collections.collections, collectionUid);

  return new Promise((resolve, reject) => {
    if (!collection) {
      return reject(new Error('Collection not found'));
    }

    // Use transformed collection root to preserve headers/auth/scripts for YML format
    const collectionRootToSave = transformCollectionRootToSave(collection);

    const { ipcRenderer } = window;
    ipcRenderer
      .invoke('renderer:update-bruno-config', brunoConfig, collection.pathname, collectionRootToSave)
      .then(resolve)
      .catch(reject);
  });
};

export const openCollectionEvent = (uid: any, pathname: any, brunoConfig: any, shouldPersist = true) => (dispatch: any, getState: any) => {
  const { ipcRenderer } = window;

  return new Promise<void>((resolve, reject) => {
    // In sidebar mode, skip auto-opened collections (shouldPersist=false)
    // Sidebar should only show manually opened/created collections
    const isSidebar = (window as any).BRUNO_WEBVIEW_MODE === 'sidebar';
    if (isSidebar && !shouldPersist) {
      resolve();
      return;
    }

    const state = getState();

    const existingCollection = state.collections.collections.find(
      (c: any) => normalizePath(c.pathname) === normalizePath(pathname)
    );

    // If collection already exists in Redux, just return silently
    // Note: We don't show a toast here because this event can be triggered in many scenarios
    // (startup, clicking existing requests, broadcasting to multiple webviews) where the collection
    // is already loaded. Showing a toast in these cases causes noise.
    if (existingCollection) {
      resolve();
      return;
    }

    // Collection doesn't exist - create it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const collection: any = {
      version: '1',
      uid: uid,
      name: brunoConfig.name,
      pathname: pathname,
      items: [],
      environments: [],
      runtimeVariables: {},
      brunoConfig: brunoConfig
    };

    ipcRenderer.invoke('renderer:get-collection-security-config', pathname).then((securityConfig: any) => {
      collectionSchema
        .validate(collection)
        .then(() => dispatch(_createCollection({ ...collection, securityConfig })))
        .then(() => {
          // Only persist to VS Code storage if shouldPersist is true
          // This is false for auto-opened collections (when clicking .bru files)
          // and true for manually opened collections (via Open Collection button)
          if (shouldPersist) {
            ipcRenderer.invoke('renderer:add-last-opened-collection', pathname).catch((err) => {
              console.error('Failed to persist collection to storage', err);
            });

            // The extension side handles persisting to workspace.yml and sends
            // main:workspace-config-updated which will also update Redux eventually.
            const currentState = getState();
            const activeWorkspaceUid = currentState.workspaces.activeWorkspaceUid;
            const activeWorkspace = currentState.workspaces.workspaces.find(
              (w: any) => w.uid === activeWorkspaceUid
            );

            if (activeWorkspace) {
              dispatch(addCollectionToWorkspace({
                workspaceUid: activeWorkspaceUid,
                collection: { uid, path: pathname }
              }));
            }
          }
          resolve();
        })
        .catch(reject);
    });
  });
};

export const createCollection = (collectionName: any, collectionFolderName: any, collectionLocation: any, options = {}) => (dispatch: any, getState: any) => {
  const { ipcRenderer } = window;

  return ipcRenderer
    .invoke('renderer:create-collection', collectionName, collectionFolderName, collectionLocation, options)
    .then(async (result: any) => {
      const { uid, brunoConfig, collectionPath } = result;
      if (!uid || !collectionPath) return result;

      const collection: any = {
        version: '1',
        uid,
        name: brunoConfig.name,
        pathname: collectionPath,
        items: [],
        environments: [],
        runtimeVariables: {},
        brunoConfig
      };

      let securityConfig = {};
      try {
        securityConfig = await ipcRenderer.invoke('renderer:get-collection-security-config', collectionPath);
      } catch (e) {
      }

      try {
        await collectionSchema.validate(collection);
        dispatch(_createCollection({ ...collection, securityConfig }));
      } catch (e) {
        // If validation fails, still try to add without validation
        dispatch(_createCollection({ ...collection, securityConfig }));
      }

      const state = getState();
      const activeWorkspaceUid = state.workspaces.activeWorkspaceUid;
      if (activeWorkspaceUid) {
        dispatch(addCollectionToWorkspace({
          workspaceUid: activeWorkspaceUid,
          collection: { uid, path: collectionPath }
        }));
      }

      return result;
    });
};
export const cloneCollection = (collectionName: any, collectionFolderName: any, collectionLocation: any, previousPath: any) => () => {
  const { ipcRenderer } = window;

  return ipcRenderer.invoke(
    'renderer:clone-collection',
    collectionName,
    collectionFolderName,
    collectionLocation,
    previousPath
  );
};
export const openCollection = () => () => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;

    ipcRenderer.invoke('renderer:open-collection')
      .then((result) => {
        resolve(result);
      })
      .catch(reject);
  });
};

export const openMultipleCollections = (collectionPaths: any, options = {}) => () => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;

    ipcRenderer.invoke('renderer:open-multiple-collections', collectionPaths, options)
      .then(resolve)
      .catch((err) => {
        reject();
      });
  });
};

export const collectionAddEnvFileEvent = (payload: any) => (dispatch: any, getState: any) => {
  const { data: environment, meta } = payload;

  return new Promise((resolve, reject) => {
    const state = getState();
    const collection = findCollectionByUid(state.collections.collections, meta.collectionUid);
    if (!collection) {
      return reject(new Error('Collection not found'));
    }

    environmentSchema
      .validate(environment)
      .then(() =>
        dispatch(
          _collectionAddEnvFileEvent({
            environment,
            collectionUid: meta.collectionUid
          })
        )
      )
      .then(resolve)
      .catch(reject);
  });
};

export const importCollection = (collection: any, collectionLocation: any, options: { format?: string } = {}) => (dispatch: any, getState: any) => {
  return new Promise(async (resolve, reject) => {
    const { ipcRenderer } = window;

    try {
      const state = getState();
      const activeWorkspace = state.workspaces.workspaces.find((w: any) => w.uid === state.workspaces.activeWorkspaceUid);

      const collectionPath = await ipcRenderer.invoke('renderer:import-collection', collection, collectionLocation, options.format || 'yml');

      if (activeWorkspace && activeWorkspace.pathname && activeWorkspace.type !== 'default') {
        const workspaceCollection = {
          name: collection.name,
          path: collectionPath
        };

        await ipcRenderer.invoke('renderer:add-collection-to-workspace', activeWorkspace.pathname, workspaceCollection);
      }

      resolve(collectionPath);
    } catch (error) {
      reject(error);
    }
  });
};

export const importCollectionFromZip = (zipFilePath: string, collectionLocation: string) => async (dispatch: AppDispatch, getState: () => RootState) => {
  const { ipcRenderer } = window;
  const state = getState();
  const activeWorkspace = state.workspaces.workspaces.find((w) => w.uid === state.workspaces.activeWorkspaceUid);

  const collectionPath = await ipcRenderer.invoke('renderer:import-collection-zip', zipFilePath, collectionLocation) as string;

  if (activeWorkspace && activeWorkspace.pathname && activeWorkspace.uid !== 'default') {
    const collectionName = collectionPath.split('/').pop() || collectionPath.split('\\').pop() || 'Collection';
    await ipcRenderer.invoke('renderer:add-collection-to-workspace', activeWorkspace.pathname, {
      name: collectionName,
      path: collectionPath
    });
  }

  return collectionPath;
};

export const moveCollectionAndPersist
  = ({
  draggedItem,
  targetItem
}: any) =>
    (dispatch: any, getState: any) => {
      dispatch(moveCollection({ draggedItem, targetItem }));
      return Promise.resolve();
    };

export const saveCollectionSecurityConfig = (collectionUid: any, securityConfig: any) => (dispatch: any, getState: any) => {
  return new Promise<void>((resolve, reject) => {
    const { ipcRenderer } = window;
    const state = getState();
    const collection = findCollectionByUid(state.collections.collections, collectionUid);

    ipcRenderer
      .invoke('renderer:save-collection-security-config', collection?.pathname, securityConfig)
      .then(async () => {
        await dispatch(setCollectionSecurityConfig({ collectionUid, securityConfig }));
        resolve();
      })
      .catch(reject);
  });
};

export const hydrateCollectionSecurityConfig = (payload: any) => (dispatch: any, getState: any) => {
  const { collectionPath, securityConfig } = payload || {};
  if (!collectionPath || !securityConfig) return;

  const state = getState();
  const collection = findCollectionByPathname(state.collections.collections, collectionPath);
  if (collection) {
    dispatch(setCollectionSecurityConfig({ collectionUid: collection.uid, securityConfig }));
  }
};

export const hydrateCollectionWithUiStateSnapshot = (payload: any) => (dispatch: any, getState: any) => {
  const collectionSnapshotData = payload;
  return new Promise<void>((resolve, reject) => {
    const state = getState();
    try {
      if (!collectionSnapshotData) return resolve();
      const { pathname, selectedEnvironment } = collectionSnapshotData;
      const collection = findCollectionByPathname(state.collections.collections, pathname);
      const collectionCopy = safeCloneCollection(collection);
      const collectionUid = collectionCopy?.uid;

      if (selectedEnvironment) {
        const environment = findEnvironmentInCollectionByName(collectionCopy, selectedEnvironment);
        if (environment) {
          dispatch(_selectEnvironment({ environmentUid: environment?.uid, collectionUid }));
        }
      } else {
        dispatch(_selectEnvironment({ environmentUid: null, collectionUid }));
      }

      // todo: add any other redux state that you want to save

      resolve();
    } catch (error) {
      reject(error);
    }
  });
};

export const fetchOauth2Credentials = (payload: any) => async (dispatch: any, getState: any) => {
  const { request, collection, itemUid, folderUid } = payload;
  const state = getState();
  const { globalEnvironments, activeGlobalEnvironmentUid } = state.globalEnvironments;
  const globalEnvironmentVariables = getGlobalEnvironmentVariables({ globalEnvironments, activeGlobalEnvironmentUid });
  request.globalEnvironmentVariables = globalEnvironmentVariables;
  return new Promise((resolve, reject) => {
    window.ipcRenderer
      .invoke('renderer:fetch-oauth2-credentials', { itemUid, request, collection })
      .then(({ credentials, url, collectionUid, credentialsId, debugInfo }) => {
        dispatch(
          collectionAddOauth2CredentialsByUrl({
            credentials,
            url,
            collectionUid,
            credentialsId,
            debugInfo: safeParseJSON(safeStringifyJSON(debugInfo)),
            folderUid: folderUid || null,
            itemUid: !folderUid ? itemUid : null
          })
        );
        resolve(credentials);
      })
      .catch(reject);
  });
};

export const refreshOauth2Credentials = (payload: any) => async (dispatch: any, getState: any) => {
  const { request, collection, folderUid, itemUid } = payload;
  const state = getState();
  const { globalEnvironments, activeGlobalEnvironmentUid } = state.globalEnvironments;
  const globalEnvironmentVariables = getGlobalEnvironmentVariables({ globalEnvironments, activeGlobalEnvironmentUid });
  request.globalEnvironmentVariables = globalEnvironmentVariables;
  return new Promise((resolve, reject) => {
    window.ipcRenderer
      .invoke('renderer:refresh-oauth2-credentials', { itemUid, request, collection })
      .then(({ credentials, url, collectionUid, debugInfo, credentialsId }) => {
        dispatch(
          collectionAddOauth2CredentialsByUrl({
            credentials,
            url,
            collectionUid,
            credentialsId,
            debugInfo: safeParseJSON(safeStringifyJSON(debugInfo)),
            folderUid: folderUid || null,
            itemUid: !folderUid ? itemUid : null
          })
        );
        resolve(credentials);
      })
      .catch(reject);
  });
};

export const clearOauth2Cache = (payload: any) => async (dispatch: any, getState: any) => {
  const { collectionUid, url, credentialsId } = payload;
  return new Promise<void>((resolve, reject) => {
    window.ipcRenderer
      .invoke('clear-oauth2-cache', collectionUid, url, credentialsId)
      .then(() => {
        dispatch(
          collectionClearOauth2CredentialsByUrl({
            collectionUid
          })
        );
        resolve();
      })
      .catch(reject);
  });
};

export const isOauth2AuthorizationRequestInProgress = () => async () => {
  return new Promise((resolve, reject) => {
    window.ipcRenderer
      .invoke('renderer:is-oauth2-authorization-request-in-progress')
      .then(resolve)
      .catch(reject);
  });
};

export const cancelOauth2AuthorizationRequest = () => async () => {
  return new Promise((resolve, reject) => {
    window.ipcRenderer
      .invoke('renderer:cancel-oauth2-authorization-request')
      .then(resolve)
      .catch(reject);
  });
};

// todo: could be removed
export const loadRequestViaWorker
  = ({
  collectionUid,
  pathname
}: any) =>
    (dispatch: any, getState: any) => {
      return new Promise(async (resolve, reject) => {
        const { ipcRenderer } = window;
        ipcRenderer.invoke('renderer:load-request-via-worker', { collectionUid, pathname }).then(resolve).catch(reject);
      });
    };

// todo: could be removed
export const loadRequest
  = ({
  collectionUid,
  pathname
}: any) =>
    (dispatch: any, getState: any) => {
      return new Promise(async (resolve, reject) => {
        const { ipcRenderer } = window;
        ipcRenderer.invoke('renderer:load-request', { collectionUid, pathname }).then(resolve).catch(reject);
      });
    };

export const loadLargeRequest
  = ({
  collectionUid,
  pathname
}: any) =>
    (dispatch: any, getState: any) => {
      return new Promise(async (resolve, reject) => {
        const { ipcRenderer } = window;
        ipcRenderer.invoke('renderer:load-large-request', { collectionUid, pathname }).then(resolve).catch(reject);
      });
    };

export const mountCollection
  = ({
  collectionUid,
  collectionPathname,
  brunoConfig
}: any) =>
    (dispatch: any, getState: any) => {
      dispatch(updateCollectionMountStatus({ collectionUid, mountStatus: 'mounting' }));
      return new Promise(async (resolve, reject) => {
        callIpc('renderer:mount-collection', { collectionUid, collectionPathname, brunoConfig })
          .then(() => dispatch(updateCollectionMountStatus({ collectionUid, mountStatus: 'mounted' })))
          .then(resolve)
          .catch(() => {
            dispatch(updateCollectionMountStatus({ collectionUid, mountStatus: 'unmounted' }));
            reject();
          });
      });
    };

export const showInFolder = (collectionPath: any) => () => {
  return new Promise((resolve, reject) => {
    const { ipcRenderer } = window;
    ipcRenderer.invoke('renderer:show-in-folder', collectionPath).then(resolve).catch(reject);
  });
};

export const updateRunnerConfiguration
  = (collectionUid: any, selectedRequestItems: any, requestItemsOrder: any, delay?: any) => (dispatch: any) => {
    dispatch(
      _updateRunnerConfiguration({
        collectionUid,
        selectedRequestItems,
        requestItemsOrder,
        delay
      })
    );
  };

export const updateActiveConnectionsInStore = (activeConnectionIds: any) => (dispatch: any, getState: any) => {
  dispatch(updateActiveConnections(activeConnectionIds));
};

export const openCollectionSettings
  = (collectionUid: any, tabName = 'overview') =>
    (dispatch: any, getState: any) => {
      const state = getState();
      const collection = findCollectionByUid(state.collections.collections, collectionUid);

      return new Promise<void>((resolve, reject) => {
        if (!collection) {
          return reject(new Error('Collection not found'));
        }

        dispatch(updateSettingsSelectedTab({
          collectionUid: collection.uid,
          tab: tabName
        }));

        dispatch(addTab({
          uid: collection.uid,
          collectionUid: collection.uid,
          type: 'collection-settings'
        }));

        resolve();
      });
    };
