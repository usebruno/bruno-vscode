import type { UID } from '../common';

export type TabType =
  | 'request'
  | 'http-request'
  | 'graphql-request'
  | 'grpc-request'
  | 'ws-request'
  | 'folder'
  | 'variables'
  | 'collection-runner'
  | 'collection-settings'
  | 'folder-settings'
  | 'environment-settings'
  | 'global-environment-settings';

export type RequestPaneTab =
  | 'params'
  | 'body'
  | 'headers'
  | 'auth'
  | 'query'
  | 'vars'
  | 'script'
  | 'assert'
  | 'tests'
  | 'docs'
  | 'settings';

export type ResponsePaneTab =
  | 'response'
  | 'headers'
  | 'timeline'
  | 'tests'
  | 'docs';

export type ResponseViewTab =
  | 'raw'
  | 'preview'
  | 'pretty';

export type ResponseFormat =
  | 'json'
  | 'xml'
  | 'html'
  | 'text'
  | 'binary'
  | 'auto';

export interface Tab {
  uid: UID;
  collectionUid: UID;
  type: TabType;
  requestPaneWidth: number | null;
  requestPaneHeight: number | null;
  requestPaneTab: RequestPaneTab;
  responsePaneTab: ResponsePaneTab;
  responsePaneScrollPosition: number | null;
  responseFormat: ResponseFormat | null;
  responseViewTab: ResponseViewTab | null;
  preview: boolean;
  folderUid?: UID;
  exampleUid?: UID;
  itemUid?: UID;
}

export interface TabsState {
  tabs: Tab[];
  activeTabUid: UID | null;
}
