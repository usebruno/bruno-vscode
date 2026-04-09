import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { find, filter, each, cloneDeep, get, set, map, concat } from 'lodash';
import mime from 'mime-types';
import path from 'path';
import {
  addDepth,
  collapseAllItemsInCollection,
  findCollectionByUid,
  findCollectionByPathname,
  findItemInCollection,
  findItemInCollectionByPathname,
  findEnvironmentInCollection,
  isItemAFolder,
  isItemARequest,
  deleteItemInCollection,
  deleteItemInCollectionByPathname,
  getUniqueTagsFromItems
} from 'utils/collections';
import { getSubdirectoriesFromRoot } from 'utils/common/platform';
import { uuid, generateUidBasedOnHash } from 'utils/common';
import { splitOnFirst, parsePathParams } from 'utils/url';
import { parseQueryParams } from '@usebruno/common/utils';
// @ts-expect-error - @usebruno/common/utils may not export buildQueryString in types
import { buildQueryString as stringifyQueryParams } from '@usebruno/common/utils';
import type { AppCollection, AppItem, UID, KeyValue, DraftRequestBody, HttpRequestParam, ResponseState, AuthMode, OAuth2CredentialEntry } from '@bruno-types';
import type {
  CollectionUidPayload,
  ItemUidPayload,
  FolderUidPayload,
  UpdateCollectionMountStatusPayload,
  UpdateCollectionLoadingStatePayload,
  SetCollectionSecurityConfigPayload,
  BrunoConfigUpdateEventPayload,
  RenameCollectionPayload,
  UpdateCollectionPathnamePayload,
  SortCollectionsPayload,
  UpdateLastActionPayload,
  UpdateSettingsSelectedTabPayload,
  SaveEnvironmentPayload,
  SelectEnvironmentPayload,
  NewItemPayload,
  DeleteItemPayload,
  RenameItemPayload,
  CloneItemPayload,
  ScriptEnvironmentUpdateEventPayload,
  ProcessEnvUpdateEventPayload,
  RequestCancelledPayload,
  ResponseReceivedPayload,
  ResponseClearedPayload,
  ClearTimelinePayload,
  ClearRequestTimelinePayload,
  SetEnvironmentsDraftPayload,
  ClearEnvironmentsDraftPayload,
  NewEphemeralHttpRequestPayload,
  RequestUrlChangedPayload,
  UpdateItemSettingsPayload,
  UpdateAuthPayload,
  AddQueryParamPayload,
  SetQueryParamsPayload,
  MoveQueryParamPayload,
  UpdateQueryParamPayload,
  DeleteQueryParamPayload,
  UpdatePathParamPayload,
  AddRequestHeaderPayload,
  UpdateRequestHeaderPayload,
  DeleteRequestHeaderPayload,
  SetRequestHeadersPayload,
  MoveRequestHeaderPayload,
  UpdateRequestBodyPayload,
  UpdateRequestBodyModePayload,
  UpdateRequestGraphqlQueryPayload,
  UpdateRequestGraphqlVariablesPayload,
  UpdateRequestMethodPayload,
  AddFormUrlEncodedParamPayload,
  UpdateFormUrlEncodedParamPayload,
  DeleteFormUrlEncodedParamPayload,
  AddMultipartFormParamPayload,
  UpdateMultipartFormParamPayload,
  DeleteMultipartFormParamPayload,
  UpdateRequestScriptPayload,
  AddRequestVarPayload,
  UpdateRequestVarPayload,
  DeleteRequestVarPayload,
  AddAssertionPayload,
  UpdateAssertionPayload,
  DeleteAssertionPayload,
  UpdateRequestTestsPayload,
  UpdateRequestDocsPayload,
  UpdateCollectionAuthPayload,
  UpdateCollectionAuthModePayload,
  UpdateCollectionScriptPayload,
  UpdateCollectionTestsPayload,
  UpdateCollectionDocsPayload,
  AddCollectionHeaderPayload,
  UpdateCollectionHeaderPayload,
  DeleteCollectionHeaderPayload,
  UpdateFolderAuthPayload,
  UpdateFolderAuthModePayload,
  UpdateFolderScriptPayload,
  AddFolderHeaderPayload,
  UpdateFolderHeaderPayload,
  DeleteFolderHeaderPayload,
  CollectionAddFileEventPayload,
  CollectionChangeFileEventPayload,
  CollectionUnlinkFileEventPayload,
  CollectionAddDirectoryEventPayload,
  CollectionUnlinkDirectoryEventPayload,
  CollectionRenamedEventPayload,
  CollectionUnlinkEnvFileEventPayload,
  RunFolderEventPayload,
  RunRequestEventPayload,
  StreamDataReceivedPayload,
  CollectionAddOauth2CredentialsByUrlPayload,
  CollectionClearOauth2CredentialsByUrlPayload,
  CollectionAddEnvFileEventPayload,
  MoveCollectionPayload,
  ResetRunResultsPayload,
  InitRunRequestEventPayload,
  UpdateRunnerConfigurationPayload,
  UpdateActiveConnectionsPayload,
  AddFolderVarPayload,
  UpdateFolderVarPayload,
  AddCollectionVarPayload,
  UpdateCollectionVarPayload,
  SetFolderVarsPayload,
  SetCollectionVarsPayload,
  AddFilePayload,
  UpdateFilePayload,
  DeleteFilePayload,
  SetFormUrlEncodedParamsPayload,
  MoveFormUrlEncodedParamPayload,
  SetMultipartFormParamsPayload,
  MoveMultipartFormParamPayload,
  UpdateRunnerTagsPayload,
  ToggleRunnerTagsPayload,
  ToggleCollectionPayload,
  ToggleCollectionItemPayload,
  RunGrpcRequestEventPayload,
  GrpcResponseReceivedPayload,
  WsResponseReceivedPayload
} from './types';

interface CollectionsState {
  collections: AppCollection[];
  collectionSortOrder: 'default' | 'alphabetical' | 'reverseAlphabetical';
  activeConnections: Array<{
    uid: UID;
    collectionUid: UID;
    itemUid: UID;
    type: 'websocket' | 'grpc';
    connectedAt: number;
  }>;
}

// gRPC status code mappings
const grpcStatusCodes: Record<number, string> = {
  0: 'OK', 1: 'CANCELLED', 2: 'UNKNOWN', 3: 'INVALID_ARGUMENT',
  4: 'DEADLINE_EXCEEDED', 5: 'NOT_FOUND', 6: 'ALREADY_EXISTS',
  7: 'PERMISSION_DENIED', 8: 'RESOURCE_EXHAUSTED', 9: 'FAILED_PRECONDITION',
  10: 'ABORTED', 11: 'OUT_OF_RANGE', 12: 'UNIMPLEMENTED',
  13: 'INTERNAL', 14: 'UNAVAILABLE', 15: 'DATA_LOSS', 16: 'UNAUTHENTICATED'
};

const wsStatusCodes: Record<number, string> = {
  1000: 'NORMAL_CLOSURE', 1001: 'GOING_AWAY', 1002: 'PROTOCOL_ERROR',
  1003: 'UNSUPPORTED_DATA', 1004: 'RESERVED', 1005: 'NO_STATUS_RECEIVED',
  1006: 'ABNORMAL_CLOSURE', 1007: 'INVALID_FRAME_PAYLOAD_DATA',
  1008: 'POLICY_VIOLATION', 1009: 'MESSAGE_TOO_BIG', 1010: 'MANDATORY_EXTENSION',
  1011: 'INTERNAL_ERROR', 1012: 'SERVICE_RESTART', 1013: 'TRY_AGAIN_LATER',
  1014: 'BAD_GATEWAY', 1015: 'TLS_HANDSHAKE'
};

const initialState: CollectionsState = {
  collections: [],
  collectionSortOrder: 'default',
  activeConnections: []
};

const getRequestFromItem = (item: AppItem) => {
  return item.draft?.request || item.request;
};

const ensureDraft = (item: AppItem) => {
  if (!item.draft) {
    item.draft = cloneDeep(item);
  }
  return item.draft;
};

const ensureCollectionRootDraft = (collection: AppCollection) => {
  if (!collection.draft) {
    collection.draft = {
      root: cloneDeep(collection.root),
      brunoConfig: cloneDeep(collection.brunoConfig)
    };
  }
  if (!collection.draft.root) {
    collection.draft.root = cloneDeep(collection.root);
  }
  if (!collection.draft.brunoConfig) {
    collection.draft.brunoConfig = cloneDeep(collection.brunoConfig);
  }
  return collection.draft;
};

const ensureFolderRootDraft = (item: AppItem) => {
  if (!item.draft) {
    item.draft = {
      root: cloneDeep(item.root)
    };
  }
  if (!item.draft.root) {
    item.draft.root = cloneDeep(item.root);
  }
  return item.draft;
};

export const collectionsSlice = createSlice({
  name: 'collections',
  initialState,
  reducers: {
    createCollection: (state, action: PayloadAction<AppCollection>) => {
      const collection = action.payload;
      collection.settingsSelectedTab = 'overview';
      collection.folderLevelSettingsSelectedTab = {};
      collection.allTags = [];
      collection.mountStatus = 'unmounted';

      if (collection.brunoConfig?.opencollection) {
        collection.format = 'yml';
      } else {
        collection.format = 'bru';
      }

      collection.importedAt = new Date().getTime();
      collection.lastAction = null;

      collapseAllItemsInCollection(collection);
      addDepth(collection.items);

      const exists = state.collections.find(c => c.uid === collection.uid);
      if (!exists) {
        state.collections.push(collection);
      }
    },

    collapseFullCollection: (state, action: PayloadAction<CollectionUidPayload>) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);
      if (collection) {
        collapseAllItemsInCollection(collection);
      }
    },

    updateCollectionMountStatus: (state, action: PayloadAction<UpdateCollectionMountStatusPayload>) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);
      if (collection && action.payload.mountStatus) {
        collection.mountStatus = action.payload.mountStatus;
      }
    },

    updateCollectionLoadingState: (state, action: PayloadAction<UpdateCollectionLoadingStatePayload>) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);
      if (collection) {
        collection.isLoading = action.payload.isLoading;
      }
    },

    setCollectionSecurityConfig: (state, action: PayloadAction<SetCollectionSecurityConfigPayload>) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);
      if (collection) {
        collection.securityConfig = action.payload.securityConfig;
      }
    },

    brunoConfigUpdateEvent: (state, action: PayloadAction<BrunoConfigUpdateEventPayload>) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);
      if (collection) {
        collection.brunoConfig = action.payload.brunoConfig;
      }
    },

    renameCollection: (state, action: PayloadAction<RenameCollectionPayload>) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);
      if (collection) {
        collection.name = action.payload.newName;
      }
    },

    updateCollectionPathname: (state, action: PayloadAction<UpdateCollectionPathnamePayload>) => {
      const { collectionUid, oldPath, newPath } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        collection.pathname = newPath;

        const newFolderName = path.basename(newPath);
        collection.name = newFolderName;

        const updateItemPathnames = (items: AppItem[]) => {
          for (const item of items) {
            if (item.pathname && item.pathname.startsWith(oldPath)) {
              item.pathname = item.pathname.replace(oldPath, newPath);
            }
            if (item.items && item.items.length > 0) {
              updateItemPathnames(item.items);
            }
          }
        };

        if (collection.items) {
          updateItemPathnames(collection.items);
        }
      }
    },

    removeCollection: (state, action: PayloadAction<CollectionUidPayload>) => {
      state.collections = state.collections.filter(c => c.uid !== action.payload.collectionUid);
    },

    sortCollections: (state, action: PayloadAction<SortCollectionsPayload>) => {
      state.collectionSortOrder = action.payload.order;
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

      switch (action.payload.order) {
        case 'default':
          state.collections.sort((a, b) => (a.importedAt || 0) - (b.importedAt || 0));
          break;
        case 'alphabetical':
          state.collections.sort((a, b) => collator.compare(a.name, b.name));
          break;
        case 'reverseAlphabetical':
          state.collections.sort((a, b) => collator.compare(b.name, a.name));
          break;
      }
    },

    updateLastAction: (state, action: PayloadAction<UpdateLastActionPayload>) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);
      if (collection) {
        collection.lastAction = action.payload.lastAction;
      }
    },

    updateSettingsSelectedTab: (state, action: PayloadAction<UpdateSettingsSelectedTabPayload>) => {
      const { collectionUid, tab, folderUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        if (folderUid) {
          if (!collection.folderLevelSettingsSelectedTab) {
            collection.folderLevelSettingsSelectedTab = {};
          }
          collection.folderLevelSettingsSelectedTab[folderUid] = tab;
        } else {
          collection.settingsSelectedTab = tab;
        }
      }
    },

    updatedFolderSettingsSelectedTab: (state, action: PayloadAction<UpdateSettingsSelectedTabPayload>) => {
      const { collectionUid, tab, folderUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection && folderUid) {
        if (!collection.folderLevelSettingsSelectedTab) {
          collection.folderLevelSettingsSelectedTab = {};
        }
        collection.folderLevelSettingsSelectedTab[folderUid] = tab;
      }
    },

    toggleCollection: (state, action: PayloadAction<ToggleCollectionPayload>) => {
      const collection = findCollectionByUid(state.collections, action.payload);
      if (collection) {
        collection.collapsed = !collection.collapsed;
      }
    },

    toggleCollectionItem: (state, action: PayloadAction<ToggleCollectionItemPayload>) => {
      const { collectionUid, itemUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          item.collapsed = !item.collapsed;
        }
      }
    },

    saveEnvironment: (state, action: PayloadAction<SaveEnvironmentPayload>) => {
      const { collectionUid, environmentUid, variables } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const environment = findEnvironmentInCollection(collection, environmentUid);
        if (environment) {
          environment.variables = variables as typeof environment.variables;
        }
      }
    },

    selectEnvironment: (state, action: PayloadAction<SelectEnvironmentPayload>) => {
      const { collectionUid, environmentUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        collection.activeEnvironmentUid = environmentUid;
      }
    },

    setEnvironmentsDraft: (state, action: PayloadAction<SetEnvironmentsDraftPayload>) => {
      const { collectionUid, environmentUid, variables } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        collection.environmentsDraft = { environmentUid, variables };
      }
    },

    clearEnvironmentsDraft: (state, action: PayloadAction<ClearEnvironmentsDraftPayload>) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);
      if (collection) {
        collection.environmentsDraft = null;
      }
    },

    newItem: (state, action: PayloadAction<NewItemPayload>) => {
      const { collectionUid, item, currentItemUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        if (currentItemUid) {
          const parentItem = findItemInCollection(collection, currentItemUid);
          if (parentItem && isItemAFolder(parentItem)) {
            if (!parentItem.items) parentItem.items = [];
            parentItem.items.push(item);
          } else {
            collection.items.push(item);
          }
        } else {
          collection.items.push(item);
        }
        addDepth(collection.items);
      }
    },

    deleteItem: (state, action: PayloadAction<DeleteItemPayload>) => {
      const { collectionUid, itemUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        deleteItemInCollection(collection, itemUid);
      }
    },

    renameItem: (state, action: PayloadAction<RenameItemPayload>) => {
      const { collectionUid, itemUid, newName } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          item.name = newName;
        }
      }
    },

    cloneItem: (state, action: PayloadAction<CloneItemPayload>) => {
      const { collectionUid, clonedItem, parentItemUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        if (parentItemUid) {
          const parentItem = findItemInCollection(collection, parentItemUid);
          if (parentItem && parentItem.items) {
            parentItem.items.push(clonedItem);
          }
        } else {
          collection.items.push(clonedItem);
        }
        addDepth(collection.items);
      }
    },

    // Request URL and method
    requestUrlChanged: (state, action: PayloadAction<RequestUrlChangedPayload>) => {
      const { collectionUid, itemUid, url } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item && isItemARequest(item)) {
          const draft = ensureDraft(item);
          if (draft.request && 'params' in draft.request) {
            type ParamType = { uid?: string; name: string; value: string; enabled?: boolean; type?: string };
            const httpRequest = draft.request as { url: string; params: ParamType[] };
            httpRequest.url = url;
            httpRequest.params = httpRequest.params ?? [];

            const parts = splitOnFirst(url, '?');
            const urlQueryParams: ParamType[] = parseQueryParams(parts[1] || '').map(({ name, value }) => ({
              name,
              value: value ?? ''
            }));
            let urlPathParams: Array<{ name: string; value: string }> = [];

            try {
              urlPathParams = parsePathParams(parts[0] || '');
            } catch (err) {
              console.error('Error parsing path params:', err);
            }

            const disabledQueryParams = filter(httpRequest.params, (p) => !p.enabled && p.type === 'query');
            let enabledQueryParams = filter(httpRequest.params, (p) => p.enabled && p.type === 'query');
            let oldPathParams = filter(httpRequest.params, (p) => p.type === 'path');
            let newPathParams: ParamType[] = [];

            // Try to connect old query param UIDs to new params
            urlQueryParams.forEach((urlQueryParam) => {
              const existingQueryParam = find(
                enabledQueryParams,
                (p) => p?.name === urlQueryParam?.name || p?.value === urlQueryParam?.value
              );
              urlQueryParam.uid = existingQueryParam?.uid || uuid();
              urlQueryParam.enabled = true;
              urlQueryParam.type = 'query';

              // Once found, remove it - to accommodate duplicate query params
              if (existingQueryParam) {
                enabledQueryParams = filter(enabledQueryParams, (p) => p?.uid !== existingQueryParam?.uid);
              }
            });

            // Filter new path params and compare with existing ones
            newPathParams = urlPathParams.filter((urlPath) => {
              const existingPathParam = find(oldPathParams, (p) => p.name === urlPath.name);
              if (existingPathParam) {
                return false;
              }
              return true;
            }).map((urlPath) => ({
              ...urlPath,
              uid: uuid(),
              enabled: true,
              type: 'path'
            }));

            // Remove path params that are no longer in URL
            const filteredOldPathParams = oldPathParams.filter((pathParam) => {
              return urlPathParams.some((p) => p.name === pathParam.name);
            });

            // Combine all params: query params + new path params + disabled query params + old path params
            httpRequest.params = [
              ...urlQueryParams,
              ...newPathParams,
              ...disabledQueryParams,
              ...filteredOldPathParams
            ];
          }
        }
      }
    },

    updateRequestMethod: (state, action: PayloadAction<UpdateRequestMethodPayload>) => {
      const { collectionUid, itemUid, method } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request) {
            (draft.request as { method?: string }).method = method;
          }
        }
      }
    },

    updateRequestProtoPath: (state, action: PayloadAction<ItemUidPayload & { protoPath: string }>) => {
      const { collectionUid, itemUid, protoPath } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request) {
            set(draft.request, 'grpc.protoPath', protoPath);
          }
        }
      }
    },

    updateItemSettings: (state, action: PayloadAction<UpdateItemSettingsPayload>) => {
      const { collectionUid, itemUid, settings } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          draft.settings = { ...draft.settings, ...settings };
        }
      }
    },

    updateAuth: (state, action: PayloadAction<UpdateAuthPayload>) => {
      const { collectionUid, itemUid, mode, content } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request) {
            // Reset auth to empty object and set mode + content to clear any null values
            draft.request.auth = { mode };
            (draft.request.auth as Record<string, unknown>)[mode] = content;
          }
        }
      }
    },

    updateRequestAuthMode: (state, action: PayloadAction<ItemUidPayload & { mode: AuthMode }>) => {
      const { collectionUid, itemUid, mode } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request) {
            // Reset auth to empty object to clear any null values from YAML parsing
            draft.request.auth = { mode };
          }
        }
      }
    },

    addRequestHeader: (state, action: PayloadAction<AddRequestHeaderPayload>) => {
      const { collectionUid, itemUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request) {
            if (!draft.request.headers) draft.request.headers = [];
            draft.request.headers.push({
              uid: uuid(),
              name: '',
              value: '',
              description: '',
              enabled: true
            });
          }
        }
      }
    },

    updateRequestHeader: (state, action: PayloadAction<UpdateRequestHeaderPayload>) => {
      const { collectionUid, itemUid, header } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request?.headers) {
            const existingHeader = draft.request.headers.find((h: KeyValue) => h.uid === header.uid);
            if (existingHeader) {
              Object.assign(existingHeader, header);
            }
          }
        }
      }
    },

    deleteRequestHeader: (state, action: PayloadAction<DeleteRequestHeaderPayload>) => {
      const { collectionUid, itemUid, headerUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request?.headers) {
            draft.request.headers = draft.request.headers.filter((h: KeyValue) => h.uid !== headerUid);
          }
        }
      }
    },

    setRequestHeaders: (state, action: PayloadAction<SetRequestHeadersPayload>) => {
      const { collectionUid, itemUid, headers } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request) {
            draft.request.headers = map(headers, ({ uid, name = '', value = '', description = '', enabled = true }: any) => ({
              uid: uid || uuid(),
              name,
              value,
              description,
              enabled
            })) as KeyValue[];
          }
        }
      }
    },

    moveRequestHeader: (state, action: PayloadAction<MoveRequestHeaderPayload>) => {
      const { collectionUid, itemUid, updateReorderedItem } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request?.headers) {
            const reorderedHeaders = updateReorderedItem.map(uid =>
              draft.request!.headers!.find((h: KeyValue) => h.uid === uid)
            ).filter(Boolean);
            draft.request.headers = reorderedHeaders;
          }
        }
      }
    },

    updateRequestBody: (state, action: PayloadAction<UpdateRequestBodyPayload>) => {
      const { collectionUid, itemUid, content } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request) {
            if (!draft.request.body) draft.request.body = {};
            const mode = draft.request.body.mode;
            if (mode && (typeof content === 'string' || Array.isArray(content))) {
              (draft.request.body as Record<string, unknown>)[mode] = content;
            } else if (typeof content === 'object' && content !== null) {
              Object.assign(draft.request.body, content);
            }
          }
        }
      }
    },

    updateRequestBodyMode: (state, action: PayloadAction<UpdateRequestBodyModePayload>) => {
      const { collectionUid, itemUid, mode } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request) {
            if (!draft.request.body) draft.request.body = {};
            draft.request.body.mode = mode;
          }
        }
      }
    },

    updateRequestGraphqlQuery: (state, action: PayloadAction<UpdateRequestGraphqlQueryPayload>) => {
      const { collectionUid, itemUid, query } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request) {
            if (!draft.request.body) draft.request.body = {};
            const body = draft.request.body as { graphql?: { query?: string; variables?: string } };
            if (!body.graphql) body.graphql = {};
            body.graphql.query = query;
          }
        }
      }
    },

    updateRequestGraphqlVariables: (state, action: PayloadAction<UpdateRequestGraphqlVariablesPayload>) => {
      const { collectionUid, itemUid, variables } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request) {
            if (!draft.request.body) draft.request.body = {};
            const body = draft.request.body as { graphql?: { query?: string; variables?: string } };
            if (!body.graphql) body.graphql = {};
            body.graphql.variables = variables;
          }
        }
      }
    },

    updateRequestScript: (state, action: PayloadAction<UpdateRequestScriptPayload>) => {
      const { collectionUid, itemUid, script, scriptType } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request) {
            if (!draft.request.script) draft.request.script = {};
            if (scriptType === 'pre-request') {
              draft.request.script.req = script;
            } else {
              draft.request.script.res = script;
            }
          }
        }
      }
    },

    updateResponseScript: (state, action: PayloadAction<UpdateRequestScriptPayload>) => {
      const { collectionUid, itemUid, script } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request) {
            if (!draft.request.script) draft.request.script = {};
            draft.request.script.res = script;
          }
        }
      }
    },

    updateRequestTests: (state, action: PayloadAction<UpdateRequestTestsPayload>) => {
      const { collectionUid, itemUid, tests } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request) {
            draft.request.tests = tests;
          }
        }
      }
    },

    updateRequestDocs: (state, action: PayloadAction<UpdateRequestDocsPayload>) => {
      const { collectionUid, itemUid, docs } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request) {
            draft.request.docs = docs;
          }
        }
      }
    },

    addAssertion: (state, action: PayloadAction<AddAssertionPayload>) => {
      const { collectionUid, itemUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request) {
            if (!draft.request.assertions) draft.request.assertions = [];
            draft.request.assertions.push({
              uid: uuid(),
              name: '',
              value: '',
              enabled: true
            });
          }
        }
      }
    },

    updateAssertion: (state, action: PayloadAction<UpdateAssertionPayload>) => {
      const { collectionUid, itemUid, assertion } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request?.assertions) {
            const existingAssertion = draft.request.assertions.find((a: { uid: UID }) => a.uid === assertion.uid);
            if (existingAssertion) {
              Object.assign(existingAssertion, assertion);
            }
          }
        }
      }
    },

    deleteAssertion: (state, action: PayloadAction<DeleteAssertionPayload>) => {
      const { collectionUid, itemUid, assertionUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request?.assertions) {
            draft.request.assertions = draft.request.assertions.filter((a: { uid: UID }) => a.uid !== assertionUid);
          }
        }
      }
    },

    setRequestAssertions: (state, action: PayloadAction<ItemUidPayload & { assertions: unknown[] }>) => {
      const { collectionUid, itemUid, assertions } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request) {
            draft.request.assertions = map(assertions, ({ uid, name = '', value = '', operator = 'eq', enabled = true }: any) => ({
              uid: uid || uuid(),
              name,
              value,
              operator,
              enabled
            })) as KeyValue[];
          }
        }
      }
    },

    moveAssertion: (state, action: PayloadAction<ItemUidPayload & { updateReorderedItem: UID[] }>) => {
      const { collectionUid, itemUid, updateReorderedItem } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request?.assertions) {
            const reordered = updateReorderedItem.map(uid =>
              draft.request!.assertions!.find((a: { uid: UID }) => a.uid === uid)
            ).filter(Boolean);
            draft.request.assertions = reordered;
          }
        }
      }
    },

    addVar: (state, action: PayloadAction<AddRequestVarPayload>) => {
      const { collectionUid, itemUid, varType } = action.payload;
      const varData = (action.payload as any).varData || {};
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item && isItemARequest(item)) {
          const draft = ensureDraft(item);
          if (draft.request) {
            draft.request.vars = draft.request.vars || { req: [], res: [] };
            if (varType === 'req') {
              draft.request.vars.req = draft.request.vars.req || [];
              draft.request.vars.req.push({
                uid: uuid(),
                name: varData.name || '',
                value: varData.value || '',
                local: varData.local === true,
                enabled: varData.enabled !== false
              });
            } else {
              draft.request.vars.res = draft.request.vars.res || [];
              draft.request.vars.res.push({
                uid: uuid(),
                name: varData.name || '',
                value: varData.value || '',
                enabled: varData.enabled !== false
              });
            }
          }
        }
      }
    },

    updateVar: (state, action: PayloadAction<UpdateRequestVarPayload>) => {
      const { collectionUid, itemUid, variable, varType } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item && isItemARequest(item)) {
          const draft = ensureDraft(item);
          if (draft.request) {
            draft.request.vars = draft.request.vars || { req: [], res: [] };
            if (varType === 'req') {
              draft.request.vars.req = draft.request.vars.req || [];
              const existingVar = draft.request.vars.req.find((v: { uid: UID }) => v.uid === variable.uid);
              if (existingVar) {
                existingVar.name = variable.name;
                existingVar.value = variable.value;
                existingVar.enabled = variable.enabled;
              }
            } else {
              draft.request.vars.res = draft.request.vars.res || [];
              const existingVar = draft.request.vars.res.find((v: { uid: UID }) => v.uid === variable.uid);
              if (existingVar) {
                existingVar.name = variable.name;
                existingVar.value = variable.value;
                existingVar.enabled = variable.enabled;
              }
            }
          }
        }
      }
    },

    deleteVar: (state, action: PayloadAction<DeleteRequestVarPayload>) => {
      const { collectionUid, itemUid, varUid, varType } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request?.vars) {
            if (varType === 'req') {
              draft.request.vars.req = (draft.request.vars.req || []).filter((v: { uid: UID }) => v.uid !== varUid);
            } else {
              draft.request.vars.res = (draft.request.vars.res || []).filter((v: { uid: UID }) => v.uid !== varUid);
            }
          }
        }
      }
    },

    setRequestVars: (state, action: PayloadAction<ItemUidPayload & { vars: { req: unknown[]; res: unknown[] } }>) => {
      const { collectionUid, itemUid, vars } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request) {
            draft.request.vars = {
              req: map(vars.req || [], ({ uid, name = '', value = '', enabled = true }: any) => ({
                uid: uid || uuid(),
                name,
                value,
                enabled
              })),
              res: map(vars.res || [], ({ uid, name = '', value = '', enabled = true, local = false }: any) => ({
                uid: uid || uuid(),
                name,
                value,
                enabled,
                local
              }))
            } as typeof draft.request.vars;
          }
        }
      }
    },

    moveVar: (state, action: PayloadAction<ItemUidPayload & { updateReorderedItem: UID[]; varType: 'req' | 'res' }>) => {
      const { collectionUid, itemUid, updateReorderedItem, varType } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const draft = ensureDraft(item);
          if (draft.request?.vars) {
            const varArray = varType === 'req' ? draft.request.vars.req : draft.request.vars.res;
            const reordered = updateReorderedItem.map(uid =>
              varArray.find((v: { uid: UID }) => v.uid === uid)
            ).filter(Boolean);
            if (varType === 'req') {
              draft.request.vars.req = reordered;
            } else {
              draft.request.vars.res = reordered;
            }
          }
        }
      }
    },

    // Draft management
    saveRequest: (state, action: PayloadAction<ItemUidPayload>) => {
      const { collectionUid, itemUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item && item.draft) {
          if (item.draft.request) {
            item.request = cloneDeep(item.draft.request) as typeof item.request;
          }
          if (item.draft.settings) {
            item.settings = cloneDeep(item.draft.settings);
          }
          item.draft = null;
        }
      }
    },

    deleteRequestDraft: (state, action: PayloadAction<ItemUidPayload>) => {
      const { collectionUid, itemUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          item.draft = null;
        }
      }
    },

    saveCollectionDraft: (state, action: PayloadAction<CollectionUidPayload>) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);
      if (collection && collection.draft) {
        if (collection.draft.root) {
          collection.root = cloneDeep(collection.draft.root);
        }
        if (collection.draft.brunoConfig) {
          collection.brunoConfig = cloneDeep(collection.draft.brunoConfig);
        }
        collection.draft = null;
      }
    },

    saveFolderDraft: (state, action: PayloadAction<FolderUidPayload>) => {
      const { collectionUid, folderUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const folder = findItemInCollection(collection, folderUid);
        if (folder && folder.draft) {
          if (folder.draft.root) {
            folder.root = cloneDeep(folder.draft.root);
          }
          folder.draft = null;
        }
      }
    },

    deleteCollectionDraft: (state, action: PayloadAction<CollectionUidPayload>) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);
      if (collection) {
        collection.draft = null;
      }
    },

    deleteFolderDraft: (state, action: PayloadAction<FolderUidPayload>) => {
      const { collectionUid, folderUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const folder = findItemInCollection(collection, folderUid);
        if (folder) {
          folder.draft = null;
        }
      }
    },

    updateCollectionAuth: (state, action: PayloadAction<UpdateCollectionAuthPayload>) => {
      const { collectionUid, mode, content } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const draft = ensureCollectionRootDraft(collection);
        if (!draft.root!.request) draft.root!.request = {};
        // Reset auth to empty object and set mode + content to clear any null values
        draft.root!.request.auth = { mode };
        (draft.root!.request.auth as unknown as Record<string, unknown>)[mode] = content;
      }
    },

    updateCollectionAuthMode: (state, action: PayloadAction<UpdateCollectionAuthModePayload>) => {
      const { collectionUid, mode } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const draft = ensureCollectionRootDraft(collection);
        if (!draft.root!.request) draft.root!.request = {};
        // Reset auth to empty object to clear any null values from YAML parsing
        draft.root!.request.auth = { mode };
      }
    },

    updateCollectionRequestScript: (state, action: PayloadAction<UpdateCollectionScriptPayload>) => {
      const { collectionUid, script } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const draft = ensureCollectionRootDraft(collection);
        if (!draft.root!.request) draft.root!.request = {};
        if (!draft.root!.request.script) draft.root!.request.script = {};
        draft.root!.request.script.req = script;
      }
    },

    updateCollectionResponseScript: (state, action: PayloadAction<UpdateCollectionScriptPayload>) => {
      const { collectionUid, script } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const draft = ensureCollectionRootDraft(collection);
        if (!draft.root!.request) draft.root!.request = {};
        if (!draft.root!.request.script) draft.root!.request.script = {};
        draft.root!.request.script.res = script;
      }
    },

    updateCollectionTests: (state, action: PayloadAction<UpdateCollectionTestsPayload>) => {
      const { collectionUid, tests } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const draft = ensureCollectionRootDraft(collection);
        if (!draft.root!.request) draft.root!.request = {};
        draft.root!.request.tests = tests;
      }
    },

    updateCollectionDocs: (state, action: PayloadAction<UpdateCollectionDocsPayload>) => {
      const { collectionUid, docs } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const draft = ensureCollectionRootDraft(collection);
        if (!draft.root!) draft.root = {};
        draft.root!.docs = docs;
      }
    },

    setCollectionHeaders: (state, action: PayloadAction<CollectionUidPayload & { headers: unknown[] }>) => {
      const { collectionUid, headers } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const draft = ensureCollectionRootDraft(collection);
        if (!draft.root!.request) draft.root!.request = {};
        draft.root!.request.headers = map(headers, ({ uid, name = '', value = '', description = '', enabled = true }: any) => ({
          uid: uid || uuid(),
          name,
          value,
          description,
          enabled
        })) as KeyValue[];
      }
    },

    addCollectionHeader: (state, action: PayloadAction<AddCollectionHeaderPayload>) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);
      if (collection) {
        const draft = ensureCollectionRootDraft(collection);
        if (!draft.root!.request) draft.root!.request = {};
        if (!draft.root!.request.headers) draft.root!.request.headers = [];
        draft.root!.request.headers.push({
          uid: uuid(),
          name: '',
          value: '',
          description: '',
          enabled: true
        });
      }
    },

    updateCollectionHeader: (state, action: PayloadAction<UpdateCollectionHeaderPayload>) => {
      const { collectionUid, header } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const draft = ensureCollectionRootDraft(collection);
        if (draft.root!.request?.headers) {
          const existingHeader = draft.root!.request.headers.find((h: KeyValue) => h.uid === header.uid);
          if (existingHeader) {
            Object.assign(existingHeader, header);
          }
        }
      }
    },

    deleteCollectionHeader: (state, action: PayloadAction<DeleteCollectionHeaderPayload>) => {
      const { collectionUid, headerUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const draft = ensureCollectionRootDraft(collection);
        if (draft.root!.request?.headers) {
          draft.root!.request.headers = draft.root!.request.headers.filter((h: KeyValue) => h.uid !== headerUid);
        }
      }
    },

    updateCollectionProxy: (state, action: PayloadAction<CollectionUidPayload & { proxy: unknown }>) => {
      const { collectionUid, proxy } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const draft = ensureCollectionRootDraft(collection);
        if (!draft.brunoConfig) draft.brunoConfig = {};
        draft.brunoConfig.proxy = proxy;
      }
    },

    updateCollectionClientCertificates: (state, action: PayloadAction<CollectionUidPayload & { clientCertificates: unknown }>) => {
      const { collectionUid, clientCertificates } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const draft = ensureCollectionRootDraft(collection);
        if (!draft.brunoConfig) draft.brunoConfig = {};
        draft.brunoConfig.clientCertificates = clientCertificates;
      }
    },

    updateCollectionPresets: (state, action: PayloadAction<CollectionUidPayload & { presets: unknown }>) => {
      const { collectionUid, presets } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const draft = ensureCollectionRootDraft(collection);
        if (!draft.brunoConfig) draft.brunoConfig = {};
        draft.brunoConfig.presets = presets;
      }
    },

    updateCollectionProtobuf: (state, action: PayloadAction<CollectionUidPayload & { protobuf: unknown }>) => {
      const { collectionUid, protobuf } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const draft = ensureCollectionRootDraft(collection);
        if (!draft.brunoConfig) draft.brunoConfig = {};
        draft.brunoConfig.protobuf = protobuf;
      }
    },

    updateFolderAuth: (state, action: PayloadAction<UpdateFolderAuthPayload>) => {
      const { collectionUid, folderUid, mode, content } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const folder = findItemInCollection(collection, folderUid);
        if (folder) {
          const draft = ensureFolderRootDraft(folder);
          if (!draft.root!.request) draft.root!.request = {};
          // Reset auth to empty object and set mode + content to clear any null values
          draft.root!.request.auth = { mode };
          (draft.root!.request.auth as unknown as Record<string, unknown>)[mode] = content;
        }
      }
    },

    updateFolderAuthMode: (state, action: PayloadAction<UpdateFolderAuthModePayload>) => {
      const { collectionUid, folderUid, mode } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const folder = findItemInCollection(collection, folderUid);
        if (folder) {
          const draft = ensureFolderRootDraft(folder);
          if (!draft.root!.request) draft.root!.request = {};
          // Reset auth to empty object to clear any null values from YAML parsing
          draft.root!.request.auth = { mode };
        }
      }
    },

    updateFolderRequestScript: (state, action: PayloadAction<UpdateFolderScriptPayload>) => {
      const { collectionUid, folderUid, script } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const folder = findItemInCollection(collection, folderUid);
        if (folder) {
          const draft = ensureFolderRootDraft(folder);
          if (!draft.root!.request) draft.root!.request = {};
          if (!draft.root!.request.script) draft.root!.request.script = {};
          draft.root!.request.script.req = script;
        }
      }
    },

    updateFolderResponseScript: (state, action: PayloadAction<UpdateFolderScriptPayload>) => {
      const { collectionUid, folderUid, script } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const folder = findItemInCollection(collection, folderUid);
        if (folder) {
          const draft = ensureFolderRootDraft(folder);
          if (!draft.root!.request) draft.root!.request = {};
          if (!draft.root!.request.script) draft.root!.request.script = {};
          draft.root!.request.script.res = script;
        }
      }
    },

    updateFolderTests: (state, action: PayloadAction<FolderUidPayload & { tests: string }>) => {
      const { collectionUid, folderUid, tests } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const folder = findItemInCollection(collection, folderUid);
        if (folder) {
          const draft = ensureFolderRootDraft(folder);
          if (!draft.root!.request) draft.root!.request = {};
          draft.root!.request.tests = tests;
        }
      }
    },

    updateFolderDocs: (state, action: PayloadAction<FolderUidPayload & { docs: string }>) => {
      const { collectionUid, folderUid, docs } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const folder = findItemInCollection(collection, folderUid);
        if (folder) {
          const draft = ensureFolderRootDraft(folder);
          if (!draft.root!) draft.root = {};
          draft.root!.docs = docs;
        }
      }
    },

    setFolderHeaders: (state, action: PayloadAction<FolderUidPayload & { headers: unknown[] }>) => {
      const { collectionUid, folderUid, headers } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const folder = findItemInCollection(collection, folderUid);
        if (folder) {
          const draft = ensureFolderRootDraft(folder);
          if (!draft.root!.request) draft.root!.request = {};
          draft.root!.request.headers = map(headers, ({ uid, name = '', value = '', description = '', enabled = true }: any) => ({
            uid: uid || uuid(),
            name,
            value,
            description,
            enabled
          })) as KeyValue[];
        }
      }
    },

    addFolderHeader: (state, action: PayloadAction<AddFolderHeaderPayload>) => {
      const { collectionUid, folderUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const folder = findItemInCollection(collection, folderUid);
        if (folder) {
          const draft = ensureFolderRootDraft(folder);
          if (!draft.root!.request) draft.root!.request = {};
          if (!draft.root!.request.headers) draft.root!.request.headers = [];
          draft.root!.request.headers.push({
            uid: uuid(),
            name: '',
            value: '',
            description: '',
            enabled: true
          });
        }
      }
    },

    updateFolderHeader: (state, action: PayloadAction<UpdateFolderHeaderPayload>) => {
      const { collectionUid, folderUid, header } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const folder = findItemInCollection(collection, folderUid);
        if (folder) {
          const draft = ensureFolderRootDraft(folder);
          if (draft.root!.request?.headers) {
            const existingHeader = draft.root!.request.headers.find((h: KeyValue) => h.uid === header.uid);
            if (existingHeader) {
              Object.assign(existingHeader, header);
            }
          }
        }
      }
    },

    deleteFolderHeader: (state, action: PayloadAction<DeleteFolderHeaderPayload>) => {
      const { collectionUid, folderUid, headerUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const folder = findItemInCollection(collection, folderUid);
        if (folder) {
          const draft = ensureFolderRootDraft(folder);
          if (draft.root!.request?.headers) {
            draft.root!.request.headers = draft.root!.request.headers.filter((h: KeyValue) => h.uid !== headerUid);
          }
        }
      }
    },

    addRequestTag: (state, action: PayloadAction<ItemUidPayload & { tag: string }>) => {
      const { collectionUid, itemUid, tag } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          if (!item.tags) item.tags = [];
          if (!item.tags.includes(tag)) {
            item.tags.push(tag);
          }
        }
      }
    },

    deleteRequestTag: (state, action: PayloadAction<ItemUidPayload & { tag: string }>) => {
      const { collectionUid, itemUid, tag } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item && item.tags) {
          item.tags = item.tags.filter(t => t !== tag);
        }
      }
    },

    updateCollectionTagsList: (state, action: PayloadAction<CollectionUidPayload>) => {
      const { collectionUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        collection.allTags = getUniqueTagsFromItems(collection.items);
      }
    },

    resetCollectionRunner: (state, action: PayloadAction<CollectionUidPayload>) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);
      if (collection) {
        collection.runnerResult = undefined;
        collection.runnerTags = undefined;
        collection.runnerTagsEnabled = false;
        collection.runnerConfiguration = undefined;
        collection.showRunner = false;
      }
    },

    updateRunnerTagsDetails: (state, action: PayloadAction<UpdateRunnerTagsPayload>) => {
      const { collectionUid, tags, tagsEnabled } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        if (tags !== undefined) {
          collection.runnerTags = tags;
        }
        if (tagsEnabled !== undefined) {
          collection.runnerTagsEnabled = tagsEnabled;
        }
      }
    },

    collectionAddFileEvent: (state, action: PayloadAction<CollectionAddFileEventPayload>) => {
      const { meta, data, partial, loading, size, error } = action.payload;
      const isCollectionRoot = meta.collectionRoot ? true : false;
      const isFolderRoot = meta.folderRoot ? true : false;
      const collection = findCollectionByUid(state.collections, meta.collectionUid);

      if (!collection) return;

      if (isCollectionRoot) {
        collection.root = data as any;
        return;
      }

      if (isFolderRoot) {
        const folderPath = path.dirname(meta.pathname);
        let folderItem = findItemInCollectionByPathname(collection, folderPath);

        // If folder doesn't exist in the tree yet, create the folder hierarchy
        // This handles the case where a new folder is created and folder.bru triggers
        // the watcher before an addDir event is received (VS Code FileSystemWatcher
        // only watches file patterns, not directories)
        if (!folderItem) {
          const subDirectories = getSubdirectoriesFromRoot(collection.pathname, folderPath);
          let currentPath = collection.pathname;
          let currentSubItems = collection.items;

          for (const directoryName of subDirectories) {
            let childItem = currentSubItems.find((f) => f.type === 'folder' && f.filename === directoryName);
            currentPath = path.join(currentPath, directoryName);
            if (!childItem) {
              childItem = {
                uid: generateUidBasedOnHash(currentPath) as UID,
                pathname: currentPath,
                name: directoryName,
                filename: directoryName,
                collapsed: true,
                type: 'folder',
                items: []
              } as AppItem;
              currentSubItems.push(childItem);
            }
            if (!childItem.items) {
              childItem.items = [];
            }
            currentSubItems = childItem.items;
          }
          addDepth(collection.items);
          folderItem = findItemInCollectionByPathname(collection, folderPath);
        }

        if (folderItem) {
          // Only update name if it's a real name (not the default "Untitled Folder")
          const parsedName = (data as any)?.meta?.name;
          if (parsedName && parsedName !== 'Untitled Folder') {
            folderItem.name = parsedName;
          }
          folderItem.root = data as any;
          if ((data as any)?.meta?.seq) {
            folderItem.seq = (data as any).meta.seq;
          }
        }
        return;
      }

      const dirname = path.dirname(meta.pathname);
      const subDirectories = getSubdirectoriesFromRoot(collection.pathname, dirname);
      let currentPath = collection.pathname;
      let currentSubItems = collection.items;

      for (const directoryName of subDirectories) {
        let childItem = currentSubItems.find((f) => f.type === 'folder' && f.filename === directoryName);
        currentPath = path.join(currentPath, directoryName);
        if (!childItem) {
          childItem = {
            uid: generateUidBasedOnHash(currentPath) as UID,
            pathname: currentPath,
            name: directoryName,
            filename: directoryName,
            collapsed: true,
            type: 'folder',
            items: []
          } as AppItem;
          currentSubItems.push(childItem);
        }
        if (!childItem.items) {
          childItem.items = [];
        }
        currentSubItems = childItem.items;
      }

      if (meta.name !== 'folder.bru' && !currentSubItems.find((f) => f.name === data?.name)) {
        const currentItem = find(currentSubItems, (i) => i.uid === data?.uid);
        if (currentItem) {
          // Preserve existing draft and response if they exist (don't overwrite unsaved changes)
          const existingDraft = currentItem.draft;
          const existingResponse = currentItem.response;
          currentItem.name = data?.name;
          currentItem.type = data?.type;
          currentItem.seq = data?.seq;
          currentItem.tags = (data as any)?.tags;
          currentItem.request = data?.request;
          currentItem.filename = meta.name;
          currentItem.pathname = meta.pathname;
          currentItem.settings = data?.settings;
          currentItem.examples = (data as any)?.examples;
          currentItem.partial = partial;
          currentItem.loading = loading;
          currentItem.size = size;
          currentItem.error = error;
          // Restore preserved draft and response
          if (existingDraft) currentItem.draft = existingDraft;
          if (existingResponse) currentItem.response = existingResponse;
        } else {
          currentSubItems.push({
            uid: data?.uid as UID,
            name: data?.name,
            type: data?.type,
            seq: data?.seq,
            tags: (data as any)?.tags,
            request: data?.request,
            settings: data?.settings,
            examples: (data as any)?.examples,
            filename: meta.name,
            pathname: meta.pathname,
            draft: null,
            partial,
            loading,
            size,
            error
          } as AppItem);
        }
      }
      addDepth(collection.items);
    },

    collectionChangeFileEvent: (state, action: PayloadAction<CollectionChangeFileEventPayload>) => {
      const { meta, data, partial, loading, size, error } = action.payload;
      const isCollectionRoot = meta.collectionRoot ? true : false;
      const isFolderRoot = meta.folderRoot ? true : false;
      const collection = findCollectionByUid(state.collections, meta.collectionUid);

      if (!collection) return;

      if (isCollectionRoot) {
        // Preserve existing draft if it exists (don't overwrite unsaved changes)
        const existingDraft = collection.draft;
        collection.root = data as any;
        if (existingDraft) {
          collection.draft = existingDraft;
        }
        return;
      }

      if (isFolderRoot) {
        const folderPath = path.dirname(meta.pathname);
        const folderItem = findItemInCollectionByPathname(collection, folderPath);
        if (folderItem) {
          // Only update name if it's a real name (not the default "Untitled Folder")
          const parsedName = (data as any)?.meta?.name;
          if (parsedName && parsedName !== 'Untitled Folder') {
            folderItem.name = parsedName;
          }
          // Preserve existing draft if it exists (don't overwrite unsaved changes)
          const existingDraft = folderItem.draft;
          folderItem.root = data as any;
          if (existingDraft) {
            folderItem.draft = existingDraft;
          }
          if ((data as any)?.meta?.seq) {
            folderItem.seq = (data as any).meta.seq;
          }
        }
        return;
      }

      if (meta.pathname) {
        const existingItem = findItemInCollectionByPathname(collection, meta.pathname);
        if (existingItem) {
          const existingDraft = existingItem.draft;
          const existingResponse = existingItem.response;

          existingItem.name = data?.name;
          existingItem.type = data?.type;
          existingItem.seq = data?.seq;
          existingItem.tags = (data as any)?.tags;
          existingItem.request = data?.request;
          existingItem.settings = data?.settings;
          existingItem.examples = (data as any)?.examples;
          existingItem.filename = meta.name;
          existingItem.pathname = meta.pathname;
          existingItem.partial = partial;
          existingItem.loading = loading;
          existingItem.size = size;
          existingItem.error = error;

          // Preserve draft and response if they existed
          if (existingDraft) existingItem.draft = existingDraft;
          if (existingResponse) existingItem.response = existingResponse;
        }
      }
    },

    collectionUnlinkFileEvent: (state, action: PayloadAction<CollectionUnlinkFileEventPayload>) => {
      const { meta } = action.payload;
      const collection = findCollectionByUid(state.collections, meta.collectionUid);
      if (collection) {
        // The watcher sends pathname inside meta (not as a separate file object)
        const pathname = action.payload.file?.pathname || meta.pathname;
        if (pathname) {
          deleteItemInCollectionByPathname(pathname, collection);
        }
      }
    },

    collectionAddDirectoryEvent: (state, action: PayloadAction<CollectionAddDirectoryEventPayload>) => {
      const { meta } = action.payload;
      const collection = findCollectionByUid(state.collections, meta.collectionUid);

      if (!collection) return;

      const subDirectories = getSubdirectoriesFromRoot(collection.pathname, meta.pathname);
      let currentPath = collection.pathname;
      let currentSubItems = collection.items;
      const lastIndex = subDirectories.length - 1;

      for (let i = 0; i < subDirectories.length; i++) {
        const directoryName = subDirectories[i];
        let childItem = currentSubItems.find((f) => f.type === 'folder' && f.filename === directoryName);
        currentPath = path.join(currentPath, directoryName);
        if (!childItem) {
          // Only use meta.name and meta.seq for the target directory (last one in the path)
          // Intermediate directories use their directory name from the path
          const isTargetDirectory = i === lastIndex;
          const folderName = isTargetDirectory ? (meta.name || directoryName) : directoryName;
          // Don't use "Untitled Folder" default - always prefer actual directory name
          const safeName = folderName === 'Untitled Folder' ? directoryName : folderName;

          childItem = {
            uid: isTargetDirectory ? (meta.uid || generateUidBasedOnHash(currentPath)) as UID : generateUidBasedOnHash(currentPath) as UID,
            pathname: currentPath,
            name: safeName,
            filename: directoryName,
            seq: isTargetDirectory ? meta.seq : undefined,
            collapsed: true,
            type: 'folder',
            items: []
          } as AppItem;
          currentSubItems.push(childItem);
        }
        if (!childItem.items) {
          childItem.items = [];
        }
        currentSubItems = childItem.items;
      }
      addDepth(collection.items);
    },

    collectionUnlinkDirectoryEvent: (state, action: PayloadAction<CollectionUnlinkDirectoryEventPayload>) => {
      const { directory, meta } = action.payload;
      const collection = findCollectionByUid(state.collections, meta.collectionUid);
      if (collection) {
        deleteItemInCollectionByPathname(directory.pathname, collection);
      }
    },

    collectionRenamedEvent: (state, action: PayloadAction<CollectionRenamedEventPayload>) => {
      const { collectionPathname, newName } = action.payload;
      const collection = findCollectionByPathname(state.collections, collectionPathname);
      if (collection) {
        collection.name = newName;
      }
    },

    requestCancelled: (state, action: PayloadAction<ItemUidPayload>) => {
      const { collectionUid, itemUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          item.requestState = 'cancelled';
          item.loading = false;
        }
      }
    },

    responseReceived: (state, action: PayloadAction<ResponseReceivedPayload>) => {
      const { collectionUid, itemUid, response } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          item.response = response;
          item.requestState = 'received';
          item.loading = false;
        }
      }
    },

    responseCleared: (state, action: PayloadAction<ResponseClearedPayload>) => {
      const { collectionUid, itemUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          item.response = null;
          item.requestState = 'idle';
        }
      }
    },

    scriptEnvironmentUpdateEvent: (state, action: PayloadAction<ScriptEnvironmentUpdateEventPayload>) => {
      const { collectionUid, envVariables, runtimeVariables } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        collection.runtimeVariables = runtimeVariables;
        if (collection.activeEnvironmentUid && envVariables) {
          const env = findEnvironmentInCollection(collection, collection.activeEnvironmentUid);
          if (env) {
          }
        }
      }
    },

    processEnvUpdateEvent: (state, action: PayloadAction<ProcessEnvUpdateEventPayload>) => {
      const { collectionUid, processEnvVariables } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        collection.processEnvVariables = processEnvVariables;
      }
    },

    clearTimeline: (state, action: PayloadAction<ClearTimelinePayload>) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);
      if (collection) {
        collection.timeline = [];
      }
    },

    clearRequestTimeline: (state, action: PayloadAction<ClearRequestTimelinePayload>) => {
      const { collectionUid, itemUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection && itemUid) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
        }
      }
    },

    collectionUnlinkEnvFileEvent: (state, action: PayloadAction<CollectionUnlinkEnvFileEventPayload>) => {
      const { data, meta } = action.payload;
      const collection = findCollectionByUid(state.collections, meta.collectionUid);
      if (collection && data?.uid) {
        collection.environments = filter(collection.environments, (e) => e.uid !== data.uid);
      }
    },

    runFolderEvent: (state, action: PayloadAction<RunFolderEventPayload>) => {
      const { collectionUid, folderUid, itemUid, type, isRecursive, cancelTokenUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);

      if (collection) {
        const request = itemUid ? findItemInCollection(collection, itemUid) : null;

        if (!collection.runnerResult) {
          collection.runnerResult = { info: {}, items: [] } as any;
        }

        const runnerResult = collection.runnerResult as { info: Record<string, unknown>; items: any[] };

        if (type === 'testrun-started') {
          runnerResult.info.collectionUid = collectionUid;
          runnerResult.info.folderUid = folderUid;
          runnerResult.info.isRecursive = isRecursive;
          runnerResult.info.cancelTokenUid = cancelTokenUid;
          runnerResult.info.status = 'started';
        }

        if (type === 'testrun-ended') {
          runnerResult.info.status = 'ended';
          if (action.payload.runCompletionTime) {
            runnerResult.info.runCompletionTime = action.payload.runCompletionTime;
          }
          if (action.payload.statusText) {
            runnerResult.info.statusText = action.payload.statusText;
          }
        }

        if (type === 'request-queued' && request) {
          runnerResult.items.push({
            uid: request.uid,
            status: 'queued'
          });
        }

        if (type === 'request-sent' && request) {
          const item = runnerResult.items.findLast((i: any) => i.uid === request.uid);
          if (item) {
            item.status = 'running';
            item.requestSent = action.payload.requestSent;
          }
        }

        if (type === 'response-received' && request) {
          const item = runnerResult.items.findLast((i: any) => i.uid === request.uid);
          if (item) {
            item.status = 'completed';
            item.responseReceived = action.payload.responseReceived;
          }
        }

        if (type === 'test-results' && request) {
          const item = runnerResult.items.findLast((i: any) => i.uid === request.uid);
          if (item) {
            item.testResults = action.payload.testResults;
          }
        }

        if (type === 'test-results-pre-request' && request) {
          const item = runnerResult.items.findLast((i: any) => i.uid === request.uid);
          if (item) {
            item.preRequestTestResults = action.payload.preRequestTestResults;
          }
        }

        if (type === 'test-results-post-response' && request) {
          const item = runnerResult.items.findLast((i: any) => i.uid === request.uid);
          if (item) {
            item.postResponseTestResults = action.payload.postResponseTestResults;
          }
        }

        if (type === 'assertion-results' && request) {
          const item = runnerResult.items.findLast((i: any) => i.uid === request.uid);
          if (item) {
            item.assertionResults = action.payload.assertionResults;
          }
        }

        if (type === 'error' && request) {
          const item = runnerResult.items.findLast((i: any) => i.uid === request.uid);
          if (item) {
            item.error = action.payload.error;
            item.responseReceived = action.payload.responseReceived;
            item.status = 'error';
          }
        }

        if (type === 'runner-request-skipped' && request) {
          const item = runnerResult.items.findLast((i: any) => i.uid === request.uid);
          if (item) {
            item.status = 'skipped';
            item.responseReceived = action.payload.responseReceived;
          }
        }

        if (type === 'post-response-script-execution' && request) {
          const item = runnerResult.items.findLast((i: any) => i.uid === request.uid);
          if (item) {
            item.postResponseScriptErrorMessage = action.payload.errorMessage;
          }
        }

        if (type === 'test-script-execution' && request) {
          const item = runnerResult.items.findLast((i: any) => i.uid === request.uid);
          if (item) {
            item.testScriptErrorMessage = action.payload.errorMessage;
          }
        }

        if (type === 'pre-request-script-execution' && request) {
          const item = runnerResult.items.findLast((i: any) => i.uid === request.uid);
          if (item) {
            item.preRequestScriptErrorMessage = action.payload.errorMessage;
          }
        }
      }
    },

    runRequestEvent: (state, action: PayloadAction<RunRequestEventPayload>) => {
      const { collectionUid, itemUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          // WS/gRPC use their own event-driven reducers for state management
          // They should never show the loading overlay (requestState = 'sending')
          const isStreamingRequest = item.type === 'ws-request' || item.type === 'grpc-request';
          item.requestState = isStreamingRequest ? null : 'sending';

          (item as any).testResults = [];
          (item as any).assertionResults = [];
          (item as any).preRequestTestResults = [];
          (item as any).postResponseTestResults = [];
        }
      }
    },

    testResultsReceived: (state, action: PayloadAction<{ collectionUid: string; itemUid: string; results: unknown[] }>) => {
      const { collectionUid, itemUid, results } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          (item as any).testResults = results;
        }
      }
    },

    assertionResultsReceived: (state, action: PayloadAction<{ collectionUid: string; itemUid: string; results: unknown[] }>) => {
      const { collectionUid, itemUid, results } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          (item as any).assertionResults = results;
        }
      }
    },

    preRequestTestResultsReceived: (state, action: PayloadAction<{ collectionUid: string; itemUid: string; results: unknown[] }>) => {
      const { collectionUid, itemUid, results } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          (item as any).preRequestTestResults = results;
        }
      }
    },

    postResponseTestResultsReceived: (state, action: PayloadAction<{ collectionUid: string; itemUid: string; results: unknown[] }>) => {
      const { collectionUid, itemUid, results } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          (item as any).postResponseTestResults = results;
        }
      }
    },

    runGrpcRequestEvent: (state, action: PayloadAction<RunGrpcRequestEventPayload>) => {
      const { collectionUid, itemUid, eventType, eventData } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (!collection) return;

      const item = findItemInCollection(collection, itemUid);
      if (!item) return;

      if (eventType === 'request') {
        (item as any).requestSent = eventData;
        (item as any).requestSent.timestamp = Date.now();
        const request = (item as any).draft ? (item as any).draft.request : (item as any).request;
        const isUnary = request?.methodType === 'unary';
        item.response = {
          statusCode: null,
          statusText: isUnary ? 'PENDING' : 'STREAMING',
          statusDescription: null,
          headers: [],
          metadata: null,
          trailers: null,
          statusDetails: null,
          error: null,
          isError: false,
          duration: 0,
          responses: [],
          timestamp: Date.now()
        } as any;
      }
    },

    grpcResponseReceived: (state, action: PayloadAction<GrpcResponseReceivedPayload>) => {
      const { collectionUid, itemUid, eventType, eventData } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (!collection) return;

      const item = findItemInCollection(collection, itemUid);
      if (!item) return;

      const currentResponse = (item.response || {
        statusCode: null, statusText: 'STREAMING', statusDescription: null,
        headers: [], metadata: null, trailers: null, statusDetails: null,
        error: null, isError: false, duration: 0, responses: [], timestamp: Date.now()
      }) as any;
      const timestamp = (item as any).requestSent?.timestamp;
      const updatedResponse = { ...currentResponse, duration: Date.now() - (timestamp || Date.now()) };
      const data = eventData as any;

      switch (eventType) {
        case 'response': {
          const { error, res } = data || {};
          if (error) {
            const errorCode = error.code || 2;
            updatedResponse.error = error.details || 'gRPC error occurred';
            updatedResponse.statusCode = errorCode;
            updatedResponse.statusText = grpcStatusCodes[errorCode] || 'UNKNOWN';
            updatedResponse.errorDetails = error;
            updatedResponse.isError = true;
          }
          updatedResponse.responses = res
            ? [...(currentResponse.responses || []), res]
            : [...(currentResponse.responses || [])];
          break;
        }
        case 'metadata':
          updatedResponse.headers = data?.metadata;
          updatedResponse.metadata = data?.metadata;
          break;
        case 'status': {
          const statusCode = data?.status?.code;
          const statusDetails = data?.status?.details;
          const statusMetadata = data?.status?.metadata;
          updatedResponse.statusCode = statusCode;
          updatedResponse.statusText = grpcStatusCodes[statusCode] || 'UNKNOWN';
          updatedResponse.statusDescription = statusDetails;
          updatedResponse.statusDetails = data?.status;
          if (statusMetadata) updatedResponse.trailers = statusMetadata;
          if (statusCode !== 0) {
            updatedResponse.isError = true;
            updatedResponse.error = statusDetails || `gRPC error with code ${statusCode} (${updatedResponse.statusText})`;
          }
          break;
        }
        case 'error': {
          const errorCode = data?.error?.code || 2;
          const errorDetails = data?.error?.details || data?.error?.message;
          const errorMetadata = data?.error?.metadata;
          updatedResponse.isError = true;
          updatedResponse.error = errorDetails || 'Unknown gRPC error';
          updatedResponse.statusCode = errorCode;
          updatedResponse.statusText = grpcStatusCodes[errorCode] || 'UNKNOWN';
          updatedResponse.statusDescription = errorDetails;
          if (errorMetadata) updatedResponse.trailers = errorMetadata;
          break;
        }
        case 'end':
          state.activeConnections = (state.activeConnections || []).filter((id: any) => id !== itemUid);
          break;
        case 'cancel':
          updatedResponse.statusCode = 1;
          updatedResponse.statusText = 'CANCELLED';
          updatedResponse.statusDescription = 'Stream cancelled by client or server';
          state.activeConnections = (state.activeConnections || []).filter((id: any) => id !== itemUid);
          break;
      }

      item.response = updatedResponse;
    },

    runWsRequestEvent: (state, action: PayloadAction<RunGrpcRequestEventPayload>) => {
      const { collectionUid, itemUid, eventType, eventData } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (!collection) return;

      const item = findItemInCollection(collection, itemUid);
      if (!item) return;

      if (eventType === 'request') {
        (item as any).requestSent = eventData;
        (item as any).requestSent.timestamp = Date.now();
        item.response = {
          status: 'CONNECTING',
          statusText: 'CONNECTING',
          statusCode: 0,
          headers: [],
          body: '',
          size: 0,
          duration: 0,
          sortOrder: -1,
          responses: [],
          isError: false,
          error: null,
          errorDetails: null,
          metadata: [],
          trailers: []
        } as any;
      }
    },

    wsResponseReceived: (state, action: PayloadAction<WsResponseReceivedPayload>) => {
      const { collectionUid, itemUid, eventType, eventData } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (!collection) return;

      const item = findItemInCollection(collection, itemUid);
      if (!item) return;

      const currentResponse = (item.response || {
        status: 'PENDING', statusText: 'PENDING', statusCode: 0, headers: [],
        body: '', size: 0, duration: 0, sortOrder: -1, responses: [],
        isError: false, error: null, errorDetails: null, metadata: [], trailers: []
      }) as any;
      const timestamp = (item as any).requestSent?.timestamp;
      const updatedResponse = {
        ...currentResponse,
        isError: false,
        error: '',
        duration: Date.now() - (timestamp || Date.now())
      };
      const data = eventData as any;

      switch (eventType) {
        case 'message':
          updatedResponse.responses = (currentResponse.responses || []).concat(data);
          break;
        case 'redirect':
          updatedResponse.requestHeaders = data?.headers;
          updatedResponse.responses = [...(currentResponse.responses || []), {
            message: data?.message,
            type: data?.type,
            timestamp: data?.timestamp
          }];
          break;
        case 'upgrade':
          updatedResponse.headers = data?.headers;
          break;
        case 'open':
          updatedResponse.status = 'CONNECTED';
          updatedResponse.statusText = 'CONNECTED';
          updatedResponse.statusCode = 0;
          updatedResponse.responses = [...(currentResponse.responses || []), {
            message: `Connected to ${data?.url}`,
            type: 'info',
            timestamp: data?.timestamp
          }];
          break;
        case 'close': {
          const code = data?.code;
          const reason = data?.reason || '';
          updatedResponse.isError = false;
          updatedResponse.error = '';
          updatedResponse.status = 'CLOSED';
          updatedResponse.statusCode = code;
          updatedResponse.statusText = wsStatusCodes[code] || 'CLOSED';
          updatedResponse.statusDescription = reason;
          updatedResponse.responses = [...(currentResponse.responses || []), {
            type: code !== 1000 ? 'info' : 'error',
            message: reason.trim().length ? ['Closed:', reason.trim()].join(' ') : 'Closed',
            timestamp
          }];
          break;
        }
        case 'error': {
          const errorDetails = data?.error || data?.message;
          updatedResponse.isError = true;
          updatedResponse.error = errorDetails || 'WebSocket error occurred';
          updatedResponse.status = 'ERROR';
          updatedResponse.statusCode = wsStatusCodes[1011];
          updatedResponse.statusText = 'ERROR';
          updatedResponse.responses = [...(currentResponse.responses || []), {
            type: 'error',
            message: errorDetails || 'WebSocket error occurred',
            timestamp
          }];
          break;
        }
        case 'connecting':
          updatedResponse.status = 'CONNECTING';
          updatedResponse.statusText = 'CONNECTING';
          break;
      }

      item.response = updatedResponse;
    },

    streamDataReceived: (state, action: PayloadAction<StreamDataReceivedPayload>) => {
      const { collectionUid, itemUid, data } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          // Append stream data to response
          if (!item.response) {
            item.response = { data: '', dataBuffer: '' };
          }
          if (typeof item.response === 'object' && item.response !== null) {
            const resp = item.response as Record<string, unknown>;
            resp.dataBuffer = ((resp.dataBuffer as string) || '') + data;
          }
        }
      }
    },

    collectionAddOauth2CredentialsByUrl: (state, action: PayloadAction<CollectionAddOauth2CredentialsByUrlPayload>) => {
      const { collectionUid, folderUid, itemUid, url, credentials, credentialsId, debugInfo } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (!collection) return;

      if (!collection.oauth2Credentials || !Array.isArray(collection.oauth2Credentials)) {
        collection.oauth2Credentials = [];
      }

      // Remove existing credentials for the same combination
      const filtered = collection.oauth2Credentials.filter(
        (creds: OAuth2CredentialEntry) => !(creds.url === url && creds.collectionUid === collectionUid && creds.credentialsId === credentialsId)
      );

      // Add the new credential
      filtered.push({ collectionUid, folderUid: folderUid || null, itemUid: itemUid || null, url, credentials, credentialsId, debugInfo });
      collection.oauth2Credentials = filtered;
    },

    collectionClearOauth2CredentialsByUrl: (state, action: PayloadAction<CollectionClearOauth2CredentialsByUrlPayload>) => {
      const { collectionUid, url, credentialsId } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (!collection) return;
      if (!collection.oauth2Credentials || !Array.isArray(collection.oauth2Credentials)) return;

      collection.oauth2Credentials = collection.oauth2Credentials.filter(
        (creds: OAuth2CredentialEntry) => !(creds.url === url && creds.collectionUid === collectionUid && creds.credentialsId === credentialsId)
      );
    },

    collectionAddEnvFileEvent: (state, action: PayloadAction<CollectionAddEnvFileEventPayload>) => {
      const { environment, collectionUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);

      if (collection) {
        collection.environments = collection.environments || [];

        const existingEnv = collection.environments.find((e) => e.uid === environment.uid);

        if (existingEnv) {
          // Preserve ephemeral variables when updating environment
          // ephemeral is a runtime property added to variables
          const prevEphemerals = (existingEnv.variables || []).filter((v) => (v as { ephemeral?: boolean }).ephemeral);
          existingEnv.name = environment.name;
          // Cast variables since KeyValue type from save payload should include type field at runtime
          existingEnv.variables = environment.variables as typeof existingEnv.variables;
          (existingEnv as { color?: string }).color = (environment as { color?: string }).color;

          // Apply temporary (ephemeral) values only to variables that exist in the file
          prevEphemerals.forEach((ev: any) => {
            const target = existingEnv.variables?.find((v) => v.name === ev.name);
            if (target) {
              if (target.value !== ev.value) {
                if ((target as any).persistedValue === undefined) (target as any).persistedValue = target.value;
                target.value = ev.value;
              }
              (target as any).ephemeral = true;
            }
          });
        } else {
          collection.environments.push(environment as AppCollection['environments'][number]);
          collection.environments.sort((a, b) => a.name.localeCompare(b.name));

          // Handle newly created environment selection
          const lastAction = (collection as any).lastAction;
          if (lastAction && lastAction.type === 'ADD_ENVIRONMENT') {
            (collection as any).lastAction = null;
            if (lastAction.payload === environment.name) {
              collection.activeEnvironmentUid = environment.uid;
            }
          }
        }
      }
    },

    moveCollection: (state, action: PayloadAction<MoveCollectionPayload>) => {
      const { draggedItem, targetItem } = action.payload;
      const draggedIndex = state.collections.findIndex(c => c.uid === draggedItem.uid);
      const targetIndex = state.collections.findIndex(c => c.uid === targetItem.uid);
      if (draggedIndex !== -1 && targetIndex !== -1) {
        const [removed] = state.collections.splice(draggedIndex, 1);
        state.collections.splice(targetIndex, 0, removed);
      }
    },

    resetRunResults: (state, action: PayloadAction<ResetRunResultsPayload>) => {
      const { collectionUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        collection.runnerResult = undefined;
      }
    },

    initRunRequestEvent: (state, action: PayloadAction<InitRunRequestEventPayload>) => {
      const { collectionUid, itemUid } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          // WS/gRPC use their own event-driven reducers for state management
          // They should never show the loading overlay
          const isStreamingRequest = item.type === 'ws-request' || item.type === 'grpc-request';
          if (!isStreamingRequest) {
            item.requestState = 'queued';
          }
        }
      }
    },

    updateRunnerConfiguration: (state, action: PayloadAction<UpdateRunnerConfigurationPayload>) => {
      const { collectionUid, selectedRequestItems, requestItemsOrder, delay } = action.payload as any;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        collection.runnerConfiguration = {
          selectedRequestItems: selectedRequestItems || [],
          requestItemsOrder: requestItemsOrder || [],
          delay: delay
        };
      }
    },

    updateActiveConnections: (state, action: PayloadAction<UpdateActiveConnectionsPayload>) => {
      state.activeConnections = action.payload.activeConnectionIds;
    },

    addFolderVar: (state, action: PayloadAction<AddFolderVarPayload>) => {
      const { collectionUid, folderUid, varType } = action.payload;
      const varData = (action.payload as any).varData || {};
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const folder = findItemInCollection(collection, folderUid);
        if (folder) {
          const draft = ensureFolderRootDraft(folder);
          if (varType === 'req') {
            const vars = get(draft, 'root.request.vars.req', []) as any[];
            vars.push({
              uid: uuid(),
              name: varData.name || '',
              value: varData.value || '',
              enabled: varData.enabled !== false
            });
            set(draft, 'root.request.vars.req', vars);
          } else {
            const vars = get(draft, 'root.request.vars.res', []) as any[];
            vars.push({
              uid: uuid(),
              name: varData.name || '',
              value: varData.value || '',
              enabled: varData.enabled !== false
            });
            set(draft, 'root.request.vars.res', vars);
          }
        }
      }
    },

    updateFolderVar: (state, action: PayloadAction<UpdateFolderVarPayload>) => {
      const { collectionUid, folderUid, variable, varType } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const folder = findItemInCollection(collection, folderUid);
        if (folder) {
          const draft = ensureFolderRootDraft(folder);
          if (varType === 'req') {
            const vars = get(draft, 'root.request.vars.req', []) as any[];
            const _var = vars.find((v: { uid: UID }) => v.uid === variable.uid);
            if (_var) {
              _var.name = variable.name;
              _var.value = variable.value;
              _var.enabled = variable.enabled;
            }
            set(draft, 'root.request.vars.req', vars);
          } else {
            const vars = get(draft, 'root.request.vars.res', []) as any[];
            const _var = vars.find((v: { uid: UID }) => v.uid === variable.uid);
            if (_var) {
              _var.name = variable.name;
              _var.value = variable.value;
              _var.enabled = variable.enabled;
            }
            set(draft, 'root.request.vars.res', vars);
          }
        }
      }
    },

    addCollectionVar: (state, action: PayloadAction<AddCollectionVarPayload>) => {
      const { collectionUid, varType } = action.payload;
      const varData = (action.payload as any).varData || {};
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const draft = ensureCollectionRootDraft(collection);
        if (varType === 'req') {
          const vars = get(draft, 'root.request.vars.req', []) as any[];
          vars.push({
            uid: uuid(),
            name: varData.name || '',
            value: varData.value || '',
            enabled: varData.enabled !== false
          });
          set(draft, 'root.request.vars.req', vars);
        } else {
          const vars = get(draft, 'root.request.vars.res', []) as any[];
          vars.push({
            uid: uuid(),
            name: varData.name || '',
            value: varData.value || '',
            enabled: varData.enabled !== false
          });
          set(draft, 'root.request.vars.res', vars);
        }
      }
    },

    updateCollectionVar: (state, action: PayloadAction<UpdateCollectionVarPayload>) => {
      const { collectionUid, variable, varType } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (collection) {
        const draft = ensureCollectionRootDraft(collection);
        if (varType === 'req') {
          const vars = get(draft, 'root.request.vars.req', []) as any[];
          const _var = vars.find((v: { uid: UID }) => v.uid === variable.uid);
          if (_var) {
            _var.name = variable.name;
            _var.value = variable.value;
            _var.enabled = variable.enabled;
          }
          set(draft, 'root.request.vars.req', vars);
        } else {
          const vars = get(draft, 'root.request.vars.res', []) as any[];
          const _var = vars.find((v: { uid: UID }) => v.uid === variable.uid);
          if (_var) {
            _var.name = variable.name;
            _var.value = variable.value;
            _var.enabled = variable.enabled;
          }
          set(draft, 'root.request.vars.res', vars);
        }
      }
    },

    setFolderVars: (state, action: PayloadAction<SetFolderVarsPayload>) => {
      const { collectionUid, folderUid, vars, type } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      const folder = collection ? findItemInCollection(collection, folderUid) : null;
      if (!folder) {
        return;
      }
      if (!folder.draft) {
        folder.draft = { root: cloneDeep(folder.root) };
      }
      const mappedVars = map(vars, ({ uid, name = '', value = '', enabled = true, local = false }) => ({
        uid: uid || uuid(),
        name,
        value,
        enabled,
        ...(type === 'response' ? { local } : {})
      }));
      if (type === 'request') {
        set(folder, 'draft.request.vars.req', mappedVars);
      } else if (type === 'response') {
        set(folder, 'draft.request.vars.res', mappedVars);
      }
    },

    setCollectionVars: (state, action: PayloadAction<SetCollectionVarsPayload>) => {
      const { collectionUid, vars, type } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (!collection) {
        return;
      }
      if (!collection.draft) {
        collection.draft = {
          root: cloneDeep(collection.root)
        };
      }
      const mappedVars = map(vars, ({ uid, name = '', value = '', enabled = true, local = false }) => ({
        uid: uid || uuid(),
        name,
        value,
        enabled,
        ...(type === 'response' ? { local } : {})
      }));
      if (type === 'request') {
        set(collection, 'draft.root.request.vars.req', mappedVars);
      } else if (type === 'response') {
        set(collection, 'draft.root.request.vars.res', mappedVars);
      }
    },

    addFile: (state, action: PayloadAction<AddFilePayload>) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && item.type === 'http-request') {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }
          if (!item.draft.request.body) {
            item.draft.request.body = {};
          }
          const body = item.draft.request.body as DraftRequestBody;
          body.file = body.file || [];

          (body.file as Array<{ uid: string; filePath: string; contentType: string; selected: boolean }>).push({
            uid: uuid(),
            filePath: '',
            contentType: '',
            selected: false
          });
        }
      }
    },

    updateFile: (state, action: PayloadAction<UpdateFilePayload>) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && item.type === 'http-request') {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }

          const body = item.draft.request.body as DraftRequestBody;
          type FileParam = { uid: UID; filePath?: string; contentType?: string; selected?: boolean };
          const param = find(body.file as FileParam[], (p) => p.uid === action.payload.param.uid);

          if (param) {
            const contentType = mime.contentType(path.extname(action.payload.param.filePath));
            param.filePath = action.payload.param.filePath;
            param.contentType = action.payload.param.contentType || contentType || '';
            param.selected = action.payload.param.selected;

            body.file = (body.file as FileParam[]).map((p) => {
              p.selected = p.uid === param.uid;
              return p;
            });
          }
        }
      }
    },

    deleteFile: (state, action: PayloadAction<DeleteFilePayload>) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }

          const body = item.draft.request.body as DraftRequestBody;
          body.file = filter(
            body.file as Array<{ uid: UID }>,
            (p) => p.uid !== action.payload.paramUid
          );

          const fileArray = body.file as Array<{ uid: UID; selected?: boolean }>;
          if (fileArray.length > 0) {
            fileArray[0].selected = true;
          }
        }
      }
    },

    setFormUrlEncodedParams: (state, action: PayloadAction<SetFormUrlEncodedParamsPayload>) => {
      const { collectionUid, itemUid, params } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (!collection) return;

      const item = findItemInCollection(collection, itemUid);
      if (!item || !isItemARequest(item)) return;

      if (!item.draft) {
        item.draft = cloneDeep(item);
      }
      const body = item.draft.request.body as DraftRequestBody;
      body.formUrlEncoded = map(params, ({ uid, name = '', value = '', description = '', enabled = true }) => ({
        uid: uid || uuid(),
        name,
        value,
        description,
        enabled
      }));
    },

    moveFormUrlEncodedParam: (state, action: PayloadAction<MoveFormUrlEncodedParamPayload>) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }

          const { updateReorderedItem } = action.payload;
          const body = item.draft.request.body as DraftRequestBody;
          const formParams = body.formUrlEncoded as Array<{ uid: UID }>;

          body.formUrlEncoded = updateReorderedItem.map((uid: UID) => {
            return formParams.find((param) => param.uid === uid);
          });
        }
      }
    },

    setMultipartFormParams: (state, action: PayloadAction<SetMultipartFormParamsPayload>) => {
      const { collectionUid, itemUid, params } = action.payload;
      const collection = findCollectionByUid(state.collections, collectionUid);
      if (!collection) return;

      const item = findItemInCollection(collection, itemUid);
      if (!item || !isItemARequest(item)) return;

      if (!item.draft) {
        item.draft = cloneDeep(item);
      }
      const body = item.draft.request.body as DraftRequestBody;
      body.multipartForm = map(params, ({ uid, name = '', value = '', contentType = '', type = 'text', enabled = true }) => ({
        uid: uid || uuid(),
        name,
        value,
        contentType,
        type,
        enabled
      }));
    },

    moveMultipartFormParam: (state, action: PayloadAction<MoveMultipartFormParamPayload>) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }

          const { updateReorderedItem } = action.payload;
          const body = item.draft.request.body as DraftRequestBody;
          const formParams = body.multipartForm as Array<{ uid: UID }>;

          body.multipartForm = updateReorderedItem.map((uid: UID) => {
            return formParams.find((param) => param.uid === uid);
          });
        }
      }
    },

    setQueryParams: (state, action: PayloadAction<SetQueryParamsPayload>) => {
      const { collectionUid, itemUid, params } = action.payload;

      const collection = findCollectionByUid(state.collections, collectionUid);
      if (!collection) {
        return;
      }

      const item = findItemInCollection(collection, itemUid);
      if (!item || !isItemARequest(item)) {
        return;
      }

      if (!item.draft) {
        item.draft = cloneDeep(item);
      }
      const draftRequest = item.draft.request as { params?: Array<KeyValue & { type?: string }>; url?: string };
      const existingOtherParams = draftRequest.params?.filter((p) => p.type !== 'query') || [];
      const newQueryParams = map(params, ({ uid, name = '', value = '', description = '', type = 'query', enabled = true }) => ({
        uid: uid || uuid(),
        name,
        value,
        description,
        type,
        enabled
      }));

      draftRequest.params = [...newQueryParams, ...existingOtherParams];

      const parts = splitOnFirst(draftRequest.url || '', '?');
      const query = stringifyQueryParams(
        filter(draftRequest.params, (p) => p.enabled && p.type === 'query')
      );

      // If there are enabled query params, append them to the URL
      if (query && query.length) {
        draftRequest.url = parts[0] + '?' + query;
      } else {
        // If no enabled query params, remove the query part from URL
        draftRequest.url = parts[0];
      }
    },

    moveQueryParam: (state, action: PayloadAction<MoveQueryParamPayload>) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }

          const { updateReorderedItem } = action.payload;
          const draftRequest = item.draft.request as { params?: Array<KeyValue & { type?: string; uid?: UID }>; url?: string };
          const params = draftRequest.params || [];

          const queryParams = params.filter((param) => param.type === 'query');
          const pathParams = params.filter((param) => param.type === 'path');

          // Reorder only query params based on updateReorderedItem
          const reorderedQueryParams = updateReorderedItem.map((uid: UID) => {
            return queryParams.find((param) => param.uid === uid);
          });
          draftRequest.params = [...reorderedQueryParams, ...pathParams];

          const parts = splitOnFirst(draftRequest.url || '', '?');
          const query = stringifyQueryParams(filter(draftRequest.params, (p) => p.enabled && p.type === 'query'));
          if (query && query.length) {
            draftRequest.url = parts[0] + '?' + query;
          } else {
            draftRequest.url = parts[0];
          }
        }
      }
    },

    updatePathParam: (state, action: PayloadAction<UpdatePathParamPayload>) => {
      const collection = findCollectionByUid(state.collections, action.payload.collectionUid);

      if (collection) {
        const item = findItemInCollection(collection, action.payload.itemUid);

        if (item && isItemARequest(item)) {
          if (!item.draft) {
            item.draft = cloneDeep(item);
          }

          const draftRequest = item.draft.request as { params?: Array<KeyValue & { type?: string; uid?: UID }> };
          const param = find(
            draftRequest.params,
            (p) => p.uid === action.payload.pathParam.uid && p.type === 'path'
          );

          if (param) {
            param.name = action.payload.pathParam.name;
            param.value = action.payload.pathParam.value;
          }
        }
      }
    }
  }
});

export const {
  createCollection,
  collapseFullCollection,
  updateCollectionMountStatus,
  updateCollectionLoadingState,
  setCollectionSecurityConfig,
  brunoConfigUpdateEvent,
  renameCollection,
  updateCollectionPathname,
  removeCollection,
  sortCollections,
  updateLastAction,
  updateSettingsSelectedTab,
  updatedFolderSettingsSelectedTab,
  toggleCollection,
  toggleCollectionItem,
  saveEnvironment,
  selectEnvironment,
  setEnvironmentsDraft,
  clearEnvironmentsDraft,
  newItem,
  deleteItem,
  renameItem,
  cloneItem,
  requestUrlChanged,
  updateRequestMethod,
  updateRequestProtoPath,
  updateItemSettings,
  updateAuth,
  updateRequestAuthMode,
  addRequestHeader,
  updateRequestHeader,
  deleteRequestHeader,
  setRequestHeaders,
  moveRequestHeader,
  updateRequestBody,
  updateRequestBodyMode,
  updateRequestGraphqlQuery,
  updateRequestGraphqlVariables,
  updateRequestScript,
  updateResponseScript,
  updateRequestTests,
  updateRequestDocs,
  addAssertion,
  updateAssertion,
  deleteAssertion,
  setRequestAssertions,
  moveAssertion,
  addVar,
  updateVar,
  deleteVar,
  setRequestVars,
  moveVar,
  saveRequest,
  deleteRequestDraft,
  saveCollectionDraft,
  saveFolderDraft,
  deleteCollectionDraft,
  deleteFolderDraft,
  updateCollectionAuth,
  updateCollectionAuthMode,
  updateCollectionRequestScript,
  updateCollectionResponseScript,
  updateCollectionTests,
  updateCollectionDocs,
  setCollectionHeaders,
  addCollectionHeader,
  updateCollectionHeader,
  deleteCollectionHeader,
  updateCollectionProxy,
  updateCollectionClientCertificates,
  updateCollectionPresets,
  updateCollectionProtobuf,
  updateFolderAuth,
  updateFolderAuthMode,
  updateFolderRequestScript,
  updateFolderResponseScript,
  updateFolderTests,
  updateFolderDocs,
  setFolderHeaders,
  addFolderHeader,
  updateFolderHeader,
  deleteFolderHeader,
  addRequestTag,
  deleteRequestTag,
  updateCollectionTagsList,
  resetCollectionRunner,
  updateRunnerTagsDetails,
  collectionAddFileEvent,
  collectionChangeFileEvent,
  collectionUnlinkFileEvent,
  collectionAddDirectoryEvent,
  collectionUnlinkDirectoryEvent,
  collectionRenamedEvent,
  requestCancelled,
  responseReceived,
  responseCleared,
  scriptEnvironmentUpdateEvent,
  processEnvUpdateEvent,
  clearTimeline,
  clearRequestTimeline,
  collectionUnlinkEnvFileEvent,
  runFolderEvent,
  runRequestEvent,
  runGrpcRequestEvent,
  grpcResponseReceived,
  runWsRequestEvent,
  wsResponseReceived,
  streamDataReceived,
  collectionAddOauth2CredentialsByUrl,
  collectionClearOauth2CredentialsByUrl,
  collectionAddEnvFileEvent,
  moveCollection,
  resetRunResults,
  initRunRequestEvent,
  updateRunnerConfiguration,
  updateActiveConnections,
  addFolderVar,
  updateFolderVar,
  addCollectionVar,
  updateCollectionVar,
  setFolderVars,
  setCollectionVars,
  addFile,
  updateFile,
  deleteFile,
  setFormUrlEncodedParams,
  moveFormUrlEncodedParam,
  setMultipartFormParams,
  moveMultipartFormParam,
  setQueryParams,
  moveQueryParam,
  updatePathParam,
  testResultsReceived,
  assertionResultsReceived,
  preRequestTestResultsReceived,
  postResponseTestResultsReceived
} = collectionsSlice.actions;

export default collectionsSlice.reducer;
