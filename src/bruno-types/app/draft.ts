import type { Request, HttpRequestBody, HttpRequestBodyMode } from '../requests';
import type { ItemSettings, Example, FolderRoot } from '../collection';
import type { KeyValue, Auth, AuthMode, Script, Variables, GraphqlBody } from '../common';

export interface DraftRequestBody {
  mode?: HttpRequestBodyMode | string;
  json?: string | null;
  text?: string | null;
  xml?: string | null;
  sparql?: string | null;
  formUrlEncoded?: KeyValue[] | null;
  multipartForm?: unknown | null;
  graphql?: GraphqlBody | null;
  file?: unknown | null;
}

export interface DraftAuth extends Auth {
  [key: string]: unknown;
}

export interface DraftRequest {
  url?: string;
  method?: string;
  headers?: KeyValue[];
  params?: Array<KeyValue & { type?: string }>;
  auth?: DraftAuth | null;
  body?: DraftRequestBody | null;
  script?: Script | null;
  vars?: {
    req: Variables;
    res: Variables;
  } | null;
  assertions?: KeyValue[] | null;
  tests?: string | null;
  docs?: string | null;
  grpc?: {
    protoPath?: string;
    method?: string;
    methodType?: string;
    metadata?: KeyValue[];
  };
  ws?: unknown;
}

export interface ItemDraft {
  uid?: string;
  name?: string;
  type?: string;
  seq?: number | null;
  filename?: string | null;
  pathname?: string | null;
  request?: Request | DraftRequest | null;
  settings?: ItemSettings;
  examples?: Example[];
  tags?: string[];
  root?: FolderRoot | null;
}

export interface PendingChanges {
  isDirty: boolean;
  lastModified?: number;
}
