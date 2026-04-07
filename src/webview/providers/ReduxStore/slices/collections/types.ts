/**
 * Payload types for collection slice reducers
 */
import type { UID, KeyValue, AuthMode } from '@bruno-types';
import type { AppCollection, AppItem, SecurityConfig } from '@bruno-types';

export interface CollectionUidPayload {
  collectionUid: UID;
}

export interface ItemUidPayload extends CollectionUidPayload {
  itemUid: UID;
}

export interface FolderUidPayload extends CollectionUidPayload {
  folderUid: UID;
}

export interface CreateCollectionPayload extends AppCollection {}

export interface UpdateCollectionMountStatusPayload extends CollectionUidPayload {
  mountStatus?: 'unmounted' | 'mounting' | 'mounted';
}

export interface UpdateCollectionLoadingStatePayload extends CollectionUidPayload {
  isLoading: boolean;
}

export interface SetCollectionSecurityConfigPayload extends CollectionUidPayload {
  securityConfig: SecurityConfig;
}

export interface BrunoConfigUpdateEventPayload extends CollectionUidPayload {
  brunoConfig: Record<string, unknown>;
}

export interface RenameCollectionPayload extends CollectionUidPayload {
  newName: string;
}

export interface UpdateCollectionPathnamePayload extends CollectionUidPayload {
  oldPath: string;
  newPath: string;
}

export interface SortCollectionsPayload {
  order: 'default' | 'alphabetical' | 'reverseAlphabetical';
}

export interface MoveCollectionPayload {
  draggedItem: AppCollection;
  targetItem: AppCollection;
}

export interface UpdateLastActionPayload extends CollectionUidPayload {
  lastAction: unknown;
}

export interface UpdateSettingsSelectedTabPayload extends CollectionUidPayload {
  folderUid?: UID;
  tab: string;
}

export interface CollectionUnlinkEnvFileEventPayload {
  data: { uid: UID };
  meta: { collectionUid: UID };
}

export interface SaveEnvironmentPayload extends CollectionUidPayload {
  environmentUid: UID;
  variables: KeyValue[];
}

export interface SelectEnvironmentPayload extends CollectionUidPayload {
  environmentUid: UID | null;
}

export interface NewItemPayload extends CollectionUidPayload {
  currentItemUid?: UID | null;
  item: AppItem;
}

export interface DeleteItemPayload extends CollectionUidPayload {
  itemUid: UID;
}

export interface RenameItemPayload extends ItemUidPayload {
  newName: string;
}

export interface CloneItemPayload extends CollectionUidPayload {
  clonedItem: AppItem;
  parentItemUid?: UID | null;
}

// Script/Environment update events
export interface ScriptEnvironmentUpdateEventPayload extends CollectionUidPayload {
  envVariables: Record<string, unknown>;
  runtimeVariables: Record<string, unknown>;
  persistentEnvVariables?: Record<string, unknown>;
}

export interface ProcessEnvUpdateEventPayload extends CollectionUidPayload {
  processEnvVariables: Record<string, unknown>;
}

export interface RequestCancelledPayload extends ItemUidPayload {}

export interface ResponseReceivedPayload extends ItemUidPayload {
  response: Record<string, unknown>;
}

export interface RunGrpcRequestEventPayload extends ItemUidPayload {
  eventType: string;
  eventData?: unknown;
}

export interface GrpcResponseReceivedPayload extends ItemUidPayload {
  eventType: string;
  eventData: unknown;
}

export interface ResponseClearedPayload extends ItemUidPayload {
  response?: null;
}

export interface ClearTimelinePayload extends CollectionUidPayload {}

export interface ClearRequestTimelinePayload extends CollectionUidPayload {
  itemUid?: UID;
}

// Draft actions
export interface SaveRequestPayload extends ItemUidPayload {}

export interface DeleteRequestDraftPayload extends ItemUidPayload {}

export interface SaveCollectionDraftPayload extends CollectionUidPayload {}

export interface SaveFolderDraftPayload extends FolderUidPayload {}

export interface DeleteCollectionDraftPayload extends CollectionUidPayload {}

export interface DeleteFolderDraftPayload extends FolderUidPayload {}

export interface SetEnvironmentsDraftPayload extends CollectionUidPayload {
  environmentUid: UID;
  variables: KeyValue[];
}

export interface ClearEnvironmentsDraftPayload extends CollectionUidPayload {}

export interface NewEphemeralHttpRequestPayload extends CollectionUidPayload {
  uid: UID;
  requestName: string;
  requestType: string;
  requestUrl: string;
  requestMethod: string;
}

export type ToggleCollectionPayload = UID;

export interface ToggleCollectionItemPayload extends ItemUidPayload {}

export interface RequestUrlChangedPayload extends ItemUidPayload {
  url: string;
}

export interface UpdateItemSettingsPayload extends ItemUidPayload {
  settings: Record<string, unknown>;
}

export interface UpdateAuthPayload extends ItemUidPayload {
  mode: AuthMode;
  content: unknown;
}

export interface AddQueryParamPayload extends ItemUidPayload {}

export interface SetQueryParamsPayload extends ItemUidPayload {
  params: Array<{
    uid?: UID;
    name?: string;
    value?: string;
    description?: string;
    type?: string;
    enabled?: boolean;
  }>;
}

export interface MoveQueryParamPayload extends ItemUidPayload {
  updateReorderedItem: UID[];
}

export interface UpdateQueryParamPayload extends ItemUidPayload {
  queryParam: {
    uid: UID;
    name: string;
    value: string;
    enabled: boolean;
  };
}

export interface DeleteQueryParamPayload extends ItemUidPayload {
  paramUid: UID;
}

export interface UpdatePathParamPayload extends ItemUidPayload {
  pathParam: {
    uid: UID;
    name: string;
    value: string;
  };
}

export interface AddRequestHeaderPayload extends ItemUidPayload {}

export interface UpdateRequestHeaderPayload extends ItemUidPayload {
  header: {
    uid: UID;
    name: string;
    value: string;
    description?: string;
    enabled: boolean;
  };
}

export interface DeleteRequestHeaderPayload extends ItemUidPayload {
  headerUid: UID;
}

export interface SetRequestHeadersPayload extends ItemUidPayload {
  headers: Array<{
    uid?: UID;
    name?: string;
    value?: string;
    description?: string;
    enabled?: boolean;
  }>;
}

export interface MoveRequestHeaderPayload extends ItemUidPayload {
  updateReorderedItem: UID[];
}

export interface UpdateRequestBodyPayload extends ItemUidPayload {
  content: unknown;
}

export interface UpdateRequestBodyModePayload extends ItemUidPayload {
  mode: string;
}

export interface UpdateRequestGraphqlQueryPayload extends ItemUidPayload {
  query: string;
}

export interface UpdateRequestGraphqlVariablesPayload extends ItemUidPayload {
  variables: string;
}

export interface UpdateRequestMethodPayload extends ItemUidPayload {
  method: string;
}

export interface AddFormUrlEncodedParamPayload extends ItemUidPayload {}

export interface UpdateFormUrlEncodedParamPayload extends ItemUidPayload {
  param: {
    uid: UID;
    name: string;
    value: string;
    description?: string;
    enabled: boolean;
  };
}

export interface DeleteFormUrlEncodedParamPayload extends ItemUidPayload {
  paramUid: UID;
}

export interface AddMultipartFormParamPayload extends ItemUidPayload {}

export interface UpdateMultipartFormParamPayload extends ItemUidPayload {
  param: {
    uid: UID;
    name: string;
    value: string;
    description?: string;
    enabled: boolean;
    type?: string;
    contentType?: string;
  };
}

export interface DeleteMultipartFormParamPayload extends ItemUidPayload {
  paramUid: UID;
}

export interface UpdateRequestScriptPayload extends ItemUidPayload {
  script: string;
  scriptType: 'pre-request' | 'post-response';
}

export interface AddRequestVarPayload extends ItemUidPayload {
  varType: 'req' | 'res';
}

export interface UpdateRequestVarPayload extends ItemUidPayload {
  varType: 'req' | 'res';
  variable: {
    uid: UID;
    name: string;
    value: string;
    enabled: boolean;
    local?: boolean;
  };
}

export interface DeleteRequestVarPayload extends ItemUidPayload {
  varUid: UID;
  varType: 'req' | 'res';
}

export interface AddAssertionPayload extends ItemUidPayload {}

export interface UpdateAssertionPayload extends ItemUidPayload {
  assertion: {
    uid: UID;
    name: string;
    value: string;
    enabled: boolean;
  };
}

export interface DeleteAssertionPayload extends ItemUidPayload {
  assertionUid: UID;
}

export interface UpdateRequestTestsPayload extends ItemUidPayload {
  tests: string;
}

export interface UpdateRequestDocsPayload extends ItemUidPayload {
  docs: string;
}

export interface UpdateCollectionAuthPayload extends CollectionUidPayload {
  mode: AuthMode;
  content: unknown;
}

export interface UpdateCollectionAuthModePayload extends CollectionUidPayload {
  mode: AuthMode;
}

export interface UpdateCollectionScriptPayload extends CollectionUidPayload {
  script: string;
}

export interface UpdateCollectionTestsPayload extends CollectionUidPayload {
  tests: string;
}

export interface UpdateCollectionDocsPayload extends CollectionUidPayload {
  docs: string;
}

export interface AddCollectionHeaderPayload extends CollectionUidPayload {}

export interface UpdateCollectionHeaderPayload extends CollectionUidPayload {
  header: {
    uid: UID;
    name: string;
    value: string;
    description?: string;
    enabled: boolean;
  };
}

export interface DeleteCollectionHeaderPayload extends CollectionUidPayload {
  headerUid: UID;
}

export interface UpdateFolderAuthPayload extends FolderUidPayload {
  mode: AuthMode;
  content: unknown;
}

export interface UpdateFolderAuthModePayload extends FolderUidPayload {
  mode: AuthMode;
}

export interface UpdateFolderScriptPayload extends FolderUidPayload {
  script: string;
}

export interface AddFolderHeaderPayload extends FolderUidPayload {}

export interface UpdateFolderHeaderPayload extends FolderUidPayload {
  header: {
    uid: UID;
    name: string;
    value: string;
    description?: string;
    enabled: boolean;
  };
}

export interface DeleteFolderHeaderPayload extends FolderUidPayload {
  headerUid: UID;
}

export interface CollectionRunnerStartPayload extends CollectionUidPayload {}

export interface CollectionRunnerUpdatePayload extends CollectionUidPayload {
  result: unknown;
}

export interface CollectionRunnerEndPayload extends CollectionUidPayload {}

export interface UpdateRunnerTagsPayload extends CollectionUidPayload {
  tags?: string[];
  tagsEnabled?: boolean;
}

export interface ToggleRunnerTagsPayload extends CollectionUidPayload {
  enabled: boolean;
}

export interface UpdateCollectionTagsListPayload extends CollectionUidPayload {}

// File system events - structure sent from watcher
export interface FileEventMeta {
  collectionUid: UID;
  pathname: string;
  name: string;
  collectionRoot?: boolean;
  folderRoot?: boolean;
  uid?: string;
  seq?: number;
}

export interface CollectionAddFileEventPayload {
  meta: FileEventMeta;
  data: AppItem;
  partial?: boolean;
  loading?: boolean;
  size?: number;
  error?: { message: string };
}

export interface CollectionChangeFileEventPayload {
  meta: FileEventMeta;
  data: AppItem;
  partial?: boolean;
  loading?: boolean;
  size?: number;
  error?: { message: string };
}

export interface CollectionUnlinkFileEventPayload {
  file?: { pathname: string };
  meta: { collectionUid: UID; pathname?: string; name?: string };
}

export interface DirectoryEventMeta {
  collectionUid: UID;
  pathname: string;
  uid?: string;
  name?: string;
  seq?: number;
}

export interface CollectionAddDirectoryEventPayload {
  meta: DirectoryEventMeta;
}

export interface CollectionUnlinkDirectoryEventPayload {
  directory: { pathname: string };
  meta: { collectionUid: UID };
}

export interface CollectionRenamedEventPayload {
  collectionPathname: string;
  newName: string;
}

export interface SetOAuthTokenPayload extends CollectionUidPayload {
  token: Record<string, unknown>;
}

export interface ClearOAuthTokenPayload extends CollectionUidPayload {}

export interface AddExamplePayload extends ItemUidPayload {
  example: unknown;
}

export interface UpdateExamplePayload extends ItemUidPayload {
  exampleUid: UID;
  example: unknown;
}

export interface DeleteExamplePayload extends ItemUidPayload {
  exampleUid: UID;
}

export interface WsConnectPayload extends ItemUidPayload {}

export interface WsDisconnectPayload extends ItemUidPayload {}

export interface WsSendPayload extends ItemUidPayload {
  message: unknown;
}

export interface WsResponseReceivedPayload extends ItemUidPayload {
  eventType: string;
  eventData?: unknown;
  response?: unknown;
}

export interface UpdateGrpcMethodPayload extends ItemUidPayload {
  method: string;
  methodType?: string;
}

export interface UpdateGrpcProtoPayload extends ItemUidPayload {
  proto: string;
}

export interface UpdateGrpcMetadataPayload extends ItemUidPayload {
  metadata: KeyValue[];
}

export interface MoveItemPayload extends CollectionUidPayload {
  draggedItemUid: UID;
  targetItemUid: UID;
}

export interface ReorderItemsPayload extends CollectionUidPayload {
  items: Array<{ uid: UID; seq: number }>;
}

export interface RunFolderEventPayload extends CollectionUidPayload {
  folderUid?: UID;
  itemUid?: UID;
  type?: 'testrun-started' | 'testrun-ended' | 'request-queued' | 'request-sent' | 'response-received' |
         'test-results' | 'test-results-pre-request' | 'test-results-post-response' | 'assertion-results' |
         'error' | 'runner-request-skipped' | 'post-response-script-execution' | 'test-script-execution' |
         'pre-request-script-execution';
  isRecursive?: boolean;
  cancelTokenUid?: UID;
  error?: string;
  requestSent?: Record<string, unknown>;
  responseReceived?: Record<string, unknown>;
  testResults?: unknown[];
  preRequestTestResults?: unknown[];
  postResponseTestResults?: unknown[];
  assertionResults?: unknown[];
  errorMessage?: string;
  runCompletionTime?: number;
  statusText?: string;
  [key: string]: unknown;
}

export interface RunRequestEventPayload extends ItemUidPayload {
  [key: string]: unknown;
}

export interface StreamDataReceivedPayload extends ItemUidPayload {
  data: string;
  [key: string]: unknown;
}

export interface CollectionAddOauth2CredentialsByUrlPayload extends CollectionUidPayload {
  itemUid?: UID | null;
  folderUid?: UID | null;
  credentialsId: string;
  [key: string]: unknown;
}

export interface CollectionClearOauth2CredentialsByUrlPayload extends CollectionUidPayload {
  itemUid?: UID | null;
  folderUid?: UID | null;
}

export interface CollectionAddEnvFileEventPayload {
  environment: {
    uid: UID;
    name: string;
    variables: KeyValue[];
  };
  collectionUid: UID;
}

export interface ResetRunResultsPayload extends CollectionUidPayload {}

export interface InitRunRequestEventPayload extends ItemUidPayload {
  [key: string]: unknown;
}

export interface UpdateRunnerConfigurationPayload extends CollectionUidPayload {
  [key: string]: unknown;
}

export interface UpdateActiveConnectionsPayload {
  activeConnectionIds: Array<{
    uid: UID;
    collectionUid: UID;
    itemUid: UID;
    type: 'websocket' | 'grpc';
    connectedAt: number;
  }>;
}

export interface AddFolderVarPayload extends FolderUidPayload {
  varType: 'req' | 'res';
}

export interface UpdateFolderVarPayload extends FolderUidPayload {
  varType: 'req' | 'res';
  variable: {
    uid: UID;
    name: string;
    value: string;
    enabled: boolean;
    local?: boolean;
  };
}

export interface AddCollectionVarPayload extends CollectionUidPayload {
  varType: 'req' | 'res';
}

export interface UpdateCollectionVarPayload extends CollectionUidPayload {
  varType: 'req' | 'res';
  variable: {
    uid: UID;
    name: string;
    value: string;
    enabled: boolean;
    local?: boolean;
  };
}

export interface SetFolderVarsPayload extends FolderUidPayload {
  vars: Array<{
    uid?: UID;
    name?: string;
    value?: string;
    enabled?: boolean;
    local?: boolean;
  }>;
  type: 'request' | 'response';
}

export interface SetCollectionVarsPayload extends CollectionUidPayload {
  vars: Array<{
    uid?: UID;
    name?: string;
    value?: string;
    enabled?: boolean;
    local?: boolean;
  }>;
  type: 'request' | 'response';
}

export interface AddFilePayload extends ItemUidPayload {}

export interface UpdateFilePayload extends ItemUidPayload {
  param: {
    uid: UID;
    filePath: string;
    contentType?: string;
    selected: boolean;
  };
}

export interface DeleteFilePayload extends ItemUidPayload {
  paramUid: UID;
}

export interface SetFormUrlEncodedParamsPayload extends ItemUidPayload {
  params: Array<{
    uid?: UID;
    name?: string;
    value?: string;
    description?: string;
    enabled?: boolean;
  }>;
}

export interface MoveFormUrlEncodedParamPayload extends ItemUidPayload {
  updateReorderedItem: UID[];
}

export interface SetMultipartFormParamsPayload extends ItemUidPayload {
  params: Array<{
    uid?: UID;
    name?: string;
    value?: string;
    contentType?: string;
    type?: string;
    enabled?: boolean;
  }>;
}

export interface MoveMultipartFormParamPayload extends ItemUidPayload {
  updateReorderedItem: UID[];
}

export interface SetQueryParamsPayload extends ItemUidPayload {
  params: Array<{
    uid?: UID;
    name?: string;
    value?: string;
    description?: string;
    type?: string;
    enabled?: boolean;
  }>;
}

export interface MoveQueryParamPayload extends ItemUidPayload {
  updateReorderedItem: UID[];
}

export interface UpdatePathParamPayload extends ItemUidPayload {
  pathParam: {
    uid: UID;
    name: string;
    value: string;
  };
}
