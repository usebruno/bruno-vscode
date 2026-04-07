import { useEffect } from 'react';
import {
  updateCookies,
  updatePreferences,
  updateSystemProxyEnvVariables
} from 'providers/ReduxStore/slices/app';
import {
  brunoConfigUpdateEvent,
  collectionAddDirectoryEvent,
  collectionAddFileEvent,
  collectionChangeFileEvent,
  collectionRenamedEvent,
  collectionUnlinkDirectoryEvent,
  collectionUnlinkEnvFileEvent,
  collectionUnlinkFileEvent,
  processEnvUpdateEvent,
  requestCancelled,
  runFolderEvent,
  runRequestEvent,
  scriptEnvironmentUpdateEvent,
  streamDataReceived
} from 'providers/ReduxStore/slices/collections';
import {
  collectionAddEnvFileEvent,
  openCollectionEvent,
  hydrateCollectionWithUiStateSnapshot,
  mergeAndPersistEnvironment,
  hydrateCollectionSecurityConfig
} from 'providers/ReduxStore/slices/collections/actions';
import { workspaceOpenedEvent, workspaceConfigUpdatedEvent } from 'providers/ReduxStore/slices/workspaces/actions';
import toast from 'react-hot-toast';
import { useDispatch, useStore } from 'react-redux';
import { hasPlatformSupport } from 'utils/common/platform';
import { globalEnvironmentsUpdateEvent, updateGlobalEnvironments } from 'providers/ReduxStore/slices/global-environments';
import {
  collectionAddOauth2CredentialsByUrl,
  updateCollectionLoadingState,
  updateCollectionPathname,
  testResultsReceived,
  assertionResultsReceived,
  preRequestTestResultsReceived,
  postResponseTestResultsReceived
} from 'providers/ReduxStore/slices/collections/index';
import { addLog } from 'providers/ReduxStore/slices/logs';
import { addTab } from 'providers/ReduxStore/slices/tabs';
import { findItemInCollectionByPathname, findCollectionByUid, getDefaultRequestPaneTab } from 'utils/collections';
import { uuid } from 'utils/common';
import type { Preferences } from '@bruno-types';
import type {
  CollectionAddFileEventPayload,
  CollectionChangeFileEventPayload,
  CollectionUnlinkFileEventPayload,
  CollectionAddDirectoryEventPayload,
  CollectionUnlinkDirectoryEventPayload,
  CollectionUnlinkEnvFileEventPayload,
  CollectionRenamedEventPayload,
  ScriptEnvironmentUpdateEventPayload,
  ProcessEnvUpdateEventPayload,
  BrunoConfigUpdateEventPayload,
  RunFolderEventPayload,
  RunRequestEventPayload,
  StreamDataReceivedPayload,
  CollectionAddOauth2CredentialsByUrlPayload,
  UpdateCollectionLoadingStatePayload,
  ItemUidPayload
} from 'providers/ReduxStore/slices/collections/types';

interface WorkspaceState {
  activeWorkspaceUid: string | null;
  workspaces: Array<{ uid: string; pathname: string }>;
}

// Minimal RootState for this hook - actual RootState is more complex
interface RootState {
  collections: { collections: AppCollection[] };
  workspaces: WorkspaceState;
}

import type { AppCollection } from '@bruno-types';

interface DisplayError {
  message?: string;
}

interface ConsoleLogEvent {
  type?: string;
  args?: unknown[];
}

interface OpenTabData {
  requestFilePath?: string;
  collectionUid?: string;
  folderPath?: string;
}

const useIpcEvents = () => {
  const dispatch = useDispatch();
  const store = useStore();

  useEffect(() => {
    if (!hasPlatformSupport()) {
      return () => {};
    }

    const { ipcRenderer } = window;

    const pendingTreeEvents: Array<{ type: string; val: unknown; collectionUid: string; retryCount: number }> = [];
    let processingPendingEvents = false;

    const processTreeEvent = (type: string, val: unknown) => {
      if (type === 'addDir') {
        dispatch(collectionAddDirectoryEvent(val as CollectionAddDirectoryEventPayload));
      }
      if (type === 'addFile') {
        dispatch(collectionAddFileEvent(val as CollectionAddFileEventPayload));
      }
      if (type === 'change') {
        dispatch(collectionChangeFileEvent(val as CollectionChangeFileEventPayload));
      }
      if (type === 'unlink') {
        setTimeout(() => {
          dispatch(collectionUnlinkFileEvent(val as CollectionUnlinkFileEventPayload));
        }, 100);
      }
      if (type === 'unlinkDir') {
        dispatch(collectionUnlinkDirectoryEvent(val as CollectionUnlinkDirectoryEventPayload));
      }
      if (type === 'addEnvironmentFile') {
        dispatch(collectionAddEnvFileEvent(val));
      }
      if (type === 'unlinkEnvironmentFile') {
        dispatch(collectionUnlinkEnvFileEvent(val as CollectionUnlinkEnvFileEventPayload));
      }
    };

    const collectionExists = (collectionUid: string): boolean => {
      const state = store.getState() as RootState;
      const collections = state.collections?.collections || [];
      return collections.some((c) => c.uid === collectionUid);
    };

    // Process pending events that were queued because their collection didn't exist
    const processPendingEvents = () => {
      if (processingPendingEvents || pendingTreeEvents.length === 0) {
        return;
      }

      processingPendingEvents = true;
      const stillPending: typeof pendingTreeEvents = [];

      for (const event of pendingTreeEvents) {
        if (collectionExists(event.collectionUid)) {
          processTreeEvent(event.type, event.val);
        } else if (event.retryCount < 80) {
          // Keep retrying for up to 80 * 50ms = 4 seconds
          event.retryCount++;
          stillPending.push(event);
        } else {
          console.warn('[DEBUG Webview] Dropping tree event after max retries:', event.type, 'for collection:', event.collectionUid);
        }
      }

      pendingTreeEvents.length = 0;
      pendingTreeEvents.push(...stillPending);
      processingPendingEvents = false;

      if (stillPending.length > 0) {
        setTimeout(processPendingEvents, 50);
      }
    };

    const _collectionTreeUpdated = (type: string, val: unknown) => {
      const eventData = val as { meta?: { collectionUid?: string }; collectionUid?: string };
      const collectionUid = eventData?.meta?.collectionUid || eventData?.collectionUid;

      if (!collectionUid) {
        console.warn('[DEBUG Webview] Tree event missing collectionUid:', type, val);
        processTreeEvent(type, val);
        return;
      }

      // If collection exists, process immediately
      if (collectionExists(collectionUid)) {
        processTreeEvent(type, val);
        return;
      }

      // Collection doesn't exist yet - queue the event
      pendingTreeEvents.push({ type, val, collectionUid, retryCount: 0 });

      setTimeout(processPendingEvents, 200);
    };

    ipcRenderer.invoke('renderer:ready').catch((err) => {
      console.error('[DEBUG Webview] renderer:ready error:', err);
    });

    // IMPORTANT: Register main:collection-opened and main:workspace-opened listeners FIRST
    // because queued events are replayed in listener registration order.
    // The collection must exist before tree-updated events can populate it.
    const removeOpenCollectionListener = ipcRenderer.on('main:collection-opened', (pathname: unknown, uid: unknown, brunoConfig: unknown, shouldPersist: unknown = true) => {
      dispatch(openCollectionEvent(uid as string, pathname as string, brunoConfig, shouldPersist === true));
    });

    const removeOpenWorkspaceListener = ipcRenderer.on('main:workspace-opened', (workspacePath, workspaceUid, workspaceConfig) => {
      dispatch(workspaceOpenedEvent(workspacePath, workspaceUid, workspaceConfig));
    });

    const removeCollectionTreeUpdateListener = ipcRenderer.on('main:collection-tree-updated', _collectionTreeUpdated);

    const removeWorkspaceConfigUpdatedListener = ipcRenderer.on('main:workspace-config-updated', (workspacePath, workspaceUid, workspaceConfig) => {
      dispatch(workspaceConfigUpdatedEvent(workspacePath, workspaceUid, workspaceConfig));
    });

    const removeWorkspaceEnvironmentAddedListener = ipcRenderer.on('main:workspace-environment-added', (workspaceUid: unknown) => {
      const state = window.__store__.getState() as RootState;
      const activeWorkspaceUid = state.workspaces?.activeWorkspaceUid;
      if (activeWorkspaceUid === workspaceUid) {
        const workspace = state.workspaces?.workspaces?.find((w) => w.uid === workspaceUid);
        if (workspace) {
          ipcRenderer.invoke('renderer:get-global-environments', {
            workspaceUid,
            workspacePath: workspace.pathname
          }).then((result) => {
            dispatch(updateGlobalEnvironments(result));
          }).catch((error: unknown) => {
            console.error('Error refreshing global environments:', error);
          });
        }
      }
    });

    const removeWorkspaceEnvironmentChangedListener = ipcRenderer.on('main:workspace-environment-changed', (workspaceUid: unknown) => {
      const state = window.__store__.getState() as RootState;
      const activeWorkspaceUid = state.workspaces?.activeWorkspaceUid;
      if (activeWorkspaceUid === workspaceUid) {
        const workspace = state.workspaces?.workspaces?.find((w) => w.uid === workspaceUid);
        if (workspace) {
          ipcRenderer.invoke('renderer:get-global-environments', {
            workspaceUid,
            workspacePath: workspace.pathname
          }).then((result) => {
            dispatch(updateGlobalEnvironments(result));
          }).catch((error: unknown) => {
            console.error('Error refreshing global environments:', error);
          });
        }
      }
    });

    const removeWorkspaceEnvironmentDeletedListener = ipcRenderer.on('main:workspace-environment-deleted', (workspaceUid: unknown) => {
      const state = window.__store__.getState() as RootState;
      const activeWorkspaceUid = state.workspaces?.activeWorkspaceUid;
      if (activeWorkspaceUid === workspaceUid) {
        const workspace = state.workspaces?.workspaces?.find((w) => w.uid === workspaceUid);
        if (workspace) {
          ipcRenderer.invoke('renderer:get-global-environments', {
            workspaceUid,
            workspacePath: workspace.pathname
          }).then((result) => {
            dispatch(updateGlobalEnvironments(result));
          }).catch((error: unknown) => {
            console.error('Error refreshing global environments:', error);
          });
        }
      }
    });

    const removeDisplayErrorListener = ipcRenderer.on('main:display-error', (error: unknown) => {
      if (typeof error === 'string') {
        return toast.error(error || 'Something went wrong!');
      }
      if (typeof error === 'object' && error !== null) {
        const errorObj = error as DisplayError;
        return toast.error(errorObj.message || 'Something went wrong!');
      }
    });

    const removeToastSuccessListener = ipcRenderer.on('main:toast-success', (message: unknown) => {
      if (typeof message === 'string') {
        toast.success(message);
      }
    });

    const removeScriptEnvUpdateListener = ipcRenderer.on('main:script-environment-update', (val: unknown) => {
      dispatch(scriptEnvironmentUpdateEvent(val as ScriptEnvironmentUpdateEventPayload));
    });

    const removePersistentEnvVariablesUpdateListener = ipcRenderer.on('main:persistent-env-variables-update', (val: unknown) => {
      dispatch(mergeAndPersistEnvironment(val));
    });

    const removeGlobalEnvironmentVariablesUpdateListener = ipcRenderer.on('main:global-environment-variables-update', (val: unknown) => {
      dispatch(globalEnvironmentsUpdateEvent(val));
    });

    const removeCollectionRenamedListener = ipcRenderer.on('main:collection-renamed', (val: unknown) => {
      dispatch(collectionRenamedEvent(val as CollectionRenamedEventPayload));
    });

    const removeCollectionFolderRenamedListener = ipcRenderer.on('main:collection-folder-renamed', (val: unknown) => {
      const data = val as { collectionUid: string; oldPath: string; newPath: string };
      dispatch(updateCollectionPathname(data));
    });

    const removeRunFolderEventListener = ipcRenderer.on('main:run-folder-event', (val: unknown) => {
      dispatch(runFolderEvent(val as RunFolderEventPayload));
    });

    const removeRunRequestEventListener = ipcRenderer.on('main:run-request-event', (val: unknown) => {
      dispatch(runRequestEvent(val as RunRequestEventPayload));
    });

    const removeTestResultsListener = ipcRenderer.on('main:test-results', (val: unknown) => {
      const data = val as { collectionUid: string; itemUid: string; results: unknown[] };
      dispatch(testResultsReceived(data));
    });

    const removeAssertionResultsListener = ipcRenderer.on('main:assertion-results', (val: unknown) => {
      const data = val as { collectionUid: string; itemUid: string; results: unknown[] };
      dispatch(assertionResultsReceived(data));
    });

    const removePreRequestTestResultsListener = ipcRenderer.on('main:pre-request-test-results', (val: unknown) => {
      const data = val as { collectionUid: string; itemUid: string; results: unknown[] };
      dispatch(preRequestTestResultsReceived(data));
    });

    const removePostResponseTestResultsListener = ipcRenderer.on('main:post-response-test-results', (val: unknown) => {
      const data = val as { collectionUid: string; itemUid: string; results: unknown[] };
      dispatch(postResponseTestResultsReceived(data));
    });

    const removeProcessEnvUpdatesListener = ipcRenderer.on('main:process-env-update', (val: unknown) => {
      dispatch(processEnvUpdateEvent(val as ProcessEnvUpdateEventPayload));
    });

    const removeConsoleLogListener = ipcRenderer.on('main:console-log', (val: unknown) => {
      if (!val || typeof val !== 'object') {
        console.warn('[Bruno] Received invalid console-log event:', val);
        return;
      }
      const logEvent = val as ConsoleLogEvent;
      const logType = logEvent.type || 'log';
      const logArgs = logEvent.args || [];
      const consoleMethod = (console as unknown as Record<string, (...args: unknown[]) => void>)[logType];
      if (typeof consoleMethod === 'function') {
        consoleMethod(...logArgs);
      }
      dispatch(addLog({
        type: logType,
        args: logArgs,
        timestamp: new Date().toISOString()
      }));
    });

    const removeConfigUpdatesListener = ipcRenderer.on('main:bruno-config-update', (val: unknown) =>
      dispatch(brunoConfigUpdateEvent(val as BrunoConfigUpdateEventPayload))
    );

    const removePreferencesUpdatesListener = ipcRenderer.on('main:load-preferences', (val: unknown) => {
      dispatch(updatePreferences(val as Preferences));
    });

    const removeSystemProxyEnvUpdatesListener = ipcRenderer.on('main:load-system-proxy-env', (val: unknown) => {
      dispatch(updateSystemProxyEnvVariables(val as Record<string, string>));
    });

    const removeCookieUpdateListener = ipcRenderer.on('main:cookies-update', (val: unknown) => {
      // Cookie type is internal to app slice, cast through Parameters utility
      dispatch(updateCookies(val as Parameters<typeof updateCookies>[0]));
    });

    const removeGlobalEnvironmentsUpdatesListener = ipcRenderer.on('main:load-global-environments', (val: unknown) => {
      dispatch(updateGlobalEnvironments(val));
    });

    const removeSnapshotHydrationListener = ipcRenderer.on('main:hydrate-app-with-ui-state-snapshot', (val: unknown) => {
      dispatch(hydrateCollectionWithUiStateSnapshot(val));
    });

    const removeSecurityConfigUpdatedListener = ipcRenderer.on('main:collection-security-config-updated', (val: unknown) => {
      dispatch(hydrateCollectionSecurityConfig(val));
    });

    const removeCollectionOauth2CredentialsUpdatesListener = ipcRenderer.on('main:credentials-update', (val: unknown) => {
      const credData = val as Partial<CollectionAddOauth2CredentialsByUrlPayload>;
      const payload: CollectionAddOauth2CredentialsByUrlPayload = {
        collectionUid: credData.collectionUid || '',
        itemUid: credData.itemUid || null,
        folderUid: credData.folderUid || null,
        credentialsId: credData.credentialsId || 'credentials'
      };
      dispatch(collectionAddOauth2CredentialsByUrl(payload));
    });

    const removeHttpStreamNewDataListener = ipcRenderer.on('main:http-stream-new-data', (val: unknown) => {
      dispatch(streamDataReceived(val as StreamDataReceivedPayload));
    });

    const removeHttpStreamEndListener = ipcRenderer.on('main:http-stream-end', (val: unknown) => {
      dispatch(requestCancelled(val as ItemUidPayload));
    });

    const removeCollectionLoadingStateListener = ipcRenderer.on('main:collection-loading-state-updated', (val: unknown) => {
      dispatch(updateCollectionLoadingState(val as UpdateCollectionLoadingStatePayload));
    });

    const removeOpenRequestTabListener = ipcRenderer.on('main:open-request-tab', (data: unknown) => {
      const tabData = data as OpenTabData;
      if (!tabData || !tabData.requestFilePath || !tabData.collectionUid) {
        console.warn('[DEBUG Webview] Invalid open-request-tab data:', data);
        return;
      }

      const { requestFilePath, collectionUid } = tabData;

      // Polling function to find and open the request tab
      // Collection items are populated asynchronously via main:collection-tree-updated events
      const MAX_RETRIES = 10;
      const RETRY_DELAY_MS = 50;
      let retryCount = 0;

      const tryOpenTab = () => {
        retryCount++;
        const currentState = store.getState() as RootState;
        const collections = currentState.collections?.collections || [];
        const collection = findCollectionByUid(collections, collectionUid);

        if (!collection) {
          if (retryCount < MAX_RETRIES) {
            setTimeout(tryOpenTab, RETRY_DELAY_MS);
          } else {
            console.error('[DEBUG Webview] Collection not found after max retries:', collectionUid);
          }
          return;
        }

        const item = findItemInCollectionByPathname(collection, requestFilePath);
        if (item) {
          dispatch(addTab({
            uid: item.uid,
            collectionUid,
            requestPaneTab: getDefaultRequestPaneTab(item),
            type: 'request'
          }));
        } else {
          // Collection exists but item not yet loaded
          if (retryCount < MAX_RETRIES) {
            setTimeout(tryOpenTab, RETRY_DELAY_MS);
          } else {
            console.error('[DEBUG Webview] Item not found after max retries:', requestFilePath);
          }
        }
      };

      tryOpenTab();
    });

    const removeOpenCollectionTabListener = ipcRenderer.on('main:open-collection-tab', (data: unknown) => {
      const tabData = data as OpenTabData;
      if (!tabData || !tabData.collectionUid) {
        console.warn('[DEBUG Webview] Invalid open-collection-tab data:', data);
        return;
      }

      const { collectionUid } = tabData;

      const MAX_RETRIES = 10;
      const RETRY_DELAY_MS = 50;
      let retryCount = 0;

      const tryOpenCollectionTab = () => {
        retryCount++;
        const currentState = store.getState() as RootState;
        const collections = currentState.collections?.collections || [];
        const collection = findCollectionByUid(collections, collectionUid);

        if (!collection) {
          if (retryCount < MAX_RETRIES) {
            setTimeout(tryOpenCollectionTab, RETRY_DELAY_MS);
          } else {
            console.error('[DEBUG Webview] Collection not found after max retries:', collectionUid);
          }
          return;
        }

        dispatch(addTab({
          uid: collection.uid,
          collectionUid: collection.uid,
          type: 'collection-settings'
        }));
      };

      tryOpenCollectionTab();
    });

    const removeOpenFolderTabListener = ipcRenderer.on('main:open-folder-tab', (data: unknown) => {
      const tabData = data as OpenTabData;
      if (!tabData || !tabData.folderPath || !tabData.collectionUid) {
        console.warn('[DEBUG Webview] Invalid open-folder-tab data:', data);
        return;
      }

      const { folderPath, collectionUid } = tabData;

      const MAX_RETRIES = 10;
      const RETRY_DELAY_MS = 50;
      let retryCount = 0;

      const tryOpenFolderTab = () => {
        retryCount++;
        const currentState = store.getState() as RootState;
        const collections = currentState.collections?.collections || [];
        const collection = findCollectionByUid(collections, collectionUid);

        if (!collection) {
          if (retryCount < MAX_RETRIES) {
            setTimeout(tryOpenFolderTab, RETRY_DELAY_MS);
          } else {
            console.error('[DEBUG Webview] Collection not found after max retries:', collectionUid);
          }
          return;
        }

        const folder = findItemInCollectionByPathname(collection, folderPath);
        if (folder && folder.type === 'folder') {
          dispatch(addTab({
            uid: folder.uid,
            collectionUid,
            type: 'folder-settings'
          }));
        } else {
          // Collection exists but folder not yet loaded
          if (retryCount < MAX_RETRIES) {
            setTimeout(tryOpenFolderTab, RETRY_DELAY_MS);
          } else {
            console.error('[DEBUG Webview] Folder not found after max retries:', folderPath);
          }
        }
      };

      tryOpenFolderTab();
    });

    const removeOpenRunnerTabListener = ipcRenderer.on('main:open-runner-tab', (data: unknown) => {
      const tabData = data as OpenTabData;
      if (!tabData || !tabData.collectionUid) {
        console.warn('[DEBUG Webview] Invalid open-runner-tab data:', data);
        return;
      }

      const { collectionUid } = tabData;

      const MAX_RETRIES = 20; // More retries for runner since full collection load takes longer
      const RETRY_DELAY_MS = 50;
      let retryCount = 0;

      const tryOpenRunnerTab = () => {
        retryCount++;
        const currentState = store.getState() as RootState;
        const collections = currentState.collections?.collections || [];
        const collection = findCollectionByUid(collections, collectionUid);

        if (!collection) {
          if (retryCount < MAX_RETRIES) {
            setTimeout(tryOpenRunnerTab, RETRY_DELAY_MS);
          } else {
            console.error('[DEBUG Webview] Collection not found after max retries:', collectionUid);
          }
          return;
        }

        dispatch(addTab({
          uid: uuid(),
          collectionUid: collection.uid,
          type: 'collection-runner'
        }));
      };

      tryOpenRunnerTab();
    });

    return () => {
      removeCollectionTreeUpdateListener();
      removeOpenCollectionListener();
      removeOpenWorkspaceListener();
      removeWorkspaceConfigUpdatedListener();
      removeWorkspaceEnvironmentAddedListener();
      removeWorkspaceEnvironmentChangedListener();
      removeWorkspaceEnvironmentDeletedListener();
      removeDisplayErrorListener();
      removeToastSuccessListener();
      removeScriptEnvUpdateListener();
      removeGlobalEnvironmentVariablesUpdateListener();
      removeCollectionRenamedListener();
      removeCollectionFolderRenamedListener();
      removeRunFolderEventListener();
      removeRunRequestEventListener();
      removeTestResultsListener();
      removeAssertionResultsListener();
      removePreRequestTestResultsListener();
      removePostResponseTestResultsListener();
      removeProcessEnvUpdatesListener();
      removeConsoleLogListener();
      removeConfigUpdatesListener();
      removePreferencesUpdatesListener();
      removeCookieUpdateListener();
      removeSystemProxyEnvUpdatesListener();
      removeGlobalEnvironmentsUpdatesListener();
      removeSnapshotHydrationListener();
      removeSecurityConfigUpdatedListener();
      removeCollectionOauth2CredentialsUpdatesListener();
      removeHttpStreamNewDataListener();
      removeHttpStreamEndListener();
      removeCollectionLoadingStateListener();
      removePersistentEnvVariablesUpdateListener();
      removeOpenRequestTabListener();
      removeOpenCollectionTabListener();
      removeOpenFolderTabListener();
      removeOpenRunnerTabListener();
    };
  }, [store]);
};

export default useIpcEvents;
