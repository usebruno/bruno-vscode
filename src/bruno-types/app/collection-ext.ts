import type { UID, KeyValue } from '../common';
import type { Collection, Item, Environments, FolderRoot } from '../collection';
import type { ItemDraft } from './draft';
import type { ResponseState, TestResult, AssertionResult } from './response';

export interface RequestSent {
  url?: string;
  method?: string;
  headers?: KeyValue[];
  body?: unknown;
  timestamp?: number;
  [key: string]: unknown;
}

export interface OAuth2CredentialEntry {
  collectionUid: UID;
  folderUid?: UID | null;
  itemUid?: UID | null;
  url: string;
  credentialsId: string;
  credentials: Record<string, unknown>;
  debugInfo?: { data: unknown[] };
}

export interface TimelineEntry {
  type: 'request' | 'response' | 'error';
  eventType?: string;
  collectionUid: UID;
  folderUid: UID | null;
  itemUid: UID;
  timestamp: number;
  data: {
    request?: unknown;
    response?: unknown;
    eventData?: unknown;
    timestamp?: number;
  };
}

export interface RunnerConfiguration {
  recursive?: boolean;
  delay?: number;
  bail?: boolean;
  [key: string]: unknown;
}

export interface RunnerResultItem {
  uid: UID;
  status: 'pass' | 'fail' | 'error' | 'skipped';
  testResults?: TestResult[];
  assertionResults?: AssertionResult[];
  error?: string | null;
  duration?: number;
  [key: string]: unknown;
}

export interface RunnerResult {
  items?: RunnerResultItem[] | null;
  status?: 'running' | 'completed' | 'cancelled';
  startTime?: number;
  endTime?: number;
  [key: string]: unknown;
}

export interface OAuthState {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: number | null;
  [key: string]: unknown;
}

export interface CollectionDraft {
  root?: FolderRoot | null;
  brunoConfig?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface EnvironmentsDraft {
  environmentUid: UID;
  variables: KeyValue[];
}

export interface SecurityConfig {
  jsSandboxMode?: 'safe' | 'unsafe' | 'developer';
  [key: string]: unknown;
}

export interface AppItem extends Item {
  draft?: ItemDraft | null;
  response?: ResponseState | Record<string, unknown> | null;
  collapsed?: boolean;
  depth?: number;
  loading?: boolean;
  items?: AppItem[] | null;
  requestState?: 'idle' | 'queued' | 'sending' | 'received' | 'error' | 'cancelled' | 'connected';
  cancelTokenUid?: UID | null;
  requestStartTime?: number | null;
  requestUid?: UID | null;
  requestSent?: RequestSent | null;
  /** Only metadata loaded, no full content yet */
  partial?: boolean;
  /** File size in MB (for large files) */
  size?: number;
  error?: { message: string } | null;
}

export interface AppCollection extends Omit<Collection, 'items'> {
  items: AppItem[];
  collapsed?: boolean;
  loading?: boolean;
  showRunner?: boolean;
  activeRequestUid?: UID | null;
  tags?: string[];
  selectedEnvironment?: string | null;
  runtimeVariables?: Record<string, unknown>;
  isDirty?: boolean;
  importedAt?: number;
  lastAction?: unknown;
  settingsSelectedTab?: string;
  folderLevelSettingsSelectedTab?: Record<UID, string>;
  allTags?: string[];
  mountStatus?: 'unmounted' | 'mounting' | 'mounted';
  format?: 'bru' | 'yml';
  isLoading?: boolean;
  securityConfig?: SecurityConfig;
  processEnvVariables?: Record<string, unknown>;
  timeline?: TimelineEntry[];
  draft?: CollectionDraft | null;
  environmentsDraft?: EnvironmentsDraft | null;
  oauth?: OAuthState;
  runnerConfiguration?: RunnerConfiguration;
  runnerResult?: RunnerResult;
  runnerTags?: string[];
  runnerTagsEnabled?: boolean;
  oauth2Credentials?: OAuth2CredentialEntry[];
  runnerConfig?: Record<string, unknown>;
  globalEnvironmentVariables?: Record<string, string>;
  promptVariables?: Record<string, string> | null;
}

export interface CollectionsState {
  collections: AppCollection[];
  collectionSortOrder: 'default' | 'alphabetical' | 'reverseAlphabetical';
  activeConnections: ActiveConnection[];
}

export interface ActiveConnection {
  uid: UID;
  collectionUid: UID;
  itemUid: UID;
  type: 'websocket' | 'grpc';
  connectedAt: number;
}
