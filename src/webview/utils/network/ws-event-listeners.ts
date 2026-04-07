import { useEffect } from 'react';
import { wsResponseReceived, runWsRequestEvent } from 'providers/ReduxStore/slices/collections/index';
import { useDispatch } from 'react-redux';
import { hasPlatformSupport } from 'utils/common/platform';
import { updateActiveConnectionsInStore } from 'providers/ReduxStore/slices/collections/actions';
import type { UID } from '@bruno-types';

const useWsEventListeners = () => {
  const { ipcRenderer } = window;
  const dispatch = useDispatch();

  useEffect(() => {
    // Skip if no IPC support (works for both Electron and VS Code)
    if (!hasPlatformSupport() || !ipcRenderer) {
      return () => {};
    }

    const removeWsRequestSentListener = ipcRenderer.on('main:ws:request', (requestId, collectionUid, eventData) => {
      dispatch(runWsRequestEvent({
        eventType: 'request',
        itemUid: requestId as UID,
        collectionUid: collectionUid as UID,
        eventData
      }));
    });

    const removeWsUpgradeListener = ipcRenderer.on('main:ws:upgrade', (requestId, collectionUid, eventData) => {
      dispatch(wsResponseReceived({
        itemUid: requestId as UID,
        collectionUid: collectionUid as UID,
        eventType: 'upgrade',
        eventData: eventData
      }));
    });

    const removeWsRedirectListener = ipcRenderer.on('main:ws:redirect', (requestId, collectionUid, eventData) => {
      dispatch(wsResponseReceived({
        itemUid: requestId as UID,
        collectionUid: collectionUid as UID,
        eventType: 'redirect',
        eventData: eventData
      }));
    });

    const removeWsMessageListener = ipcRenderer.on('main:ws:message', (requestId, collectionUid, eventData) => {
      dispatch(wsResponseReceived({
        itemUid: requestId as UID,
        collectionUid: collectionUid as UID,
        eventType: 'message',
        eventData: eventData
      }));
    });

    const removeWsOpenListener = ipcRenderer.on('main:ws:open', (requestId, collectionUid, eventData) => {
      dispatch(wsResponseReceived({
        itemUid: requestId as UID,
        collectionUid: collectionUid as UID,
        eventType: 'open',
        eventData: eventData
      }));
    });

    const removeWsCloseListener = ipcRenderer.on('main:ws:close', (requestId, collectionUid, eventData) => {
      dispatch(wsResponseReceived({
        itemUid: requestId as UID,
        collectionUid: collectionUid as UID,
        eventType: 'close',
        eventData: eventData
      }));
    });

    const removeWsErrorListener = ipcRenderer.on('main:ws:error', (requestId, collectionUid, eventData) => {
      dispatch(wsResponseReceived({
        itemUid: requestId as UID,
        collectionUid: collectionUid as UID,
        eventType: 'error',
        eventData: eventData
      }));
    });

    const removeWsConnectingListener = ipcRenderer.on('main:ws:connecting', (requestId, collectionUid, eventData) => {
      dispatch(wsResponseReceived({
        itemUid: requestId as UID,
        collectionUid: collectionUid as UID,
        eventType: 'connecting',
        eventData: eventData
      }));
    });

    const removeWsConnectionsChangedListener = ipcRenderer.on('main:ws:connections-changed', (data) => {
      dispatch(updateActiveConnectionsInStore(data));
    });

    return () => {
      removeWsRequestSentListener();
      removeWsUpgradeListener();
      removeWsRedirectListener();
      removeWsMessageListener();
      removeWsOpenListener();
      removeWsCloseListener();
      removeWsErrorListener();
      removeWsConnectingListener();
      removeWsConnectionsChangedListener();
    };
  }, [ipcRenderer, dispatch]);
};

export default useWsEventListeners;
