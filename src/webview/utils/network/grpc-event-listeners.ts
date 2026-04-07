import { useEffect } from 'react';
import { grpcResponseReceived, runGrpcRequestEvent } from 'providers/ReduxStore/slices/collections/index';
import { useDispatch } from 'react-redux';
import { hasPlatformSupport } from 'utils/common/platform';
import { updateActiveConnectionsInStore } from 'providers/ReduxStore/slices/collections/actions';
import type { UID } from '@bruno-types';

const useGrpcEventListeners = () => {
  const { ipcRenderer } = window;
  const dispatch = useDispatch();

  useEffect(() => {
    // Skip if no IPC support (works for both Electron and VS Code)
    if (!hasPlatformSupport() || !ipcRenderer) {
      return () => {};
    }

    const removeGrpcRequestSentListener = ipcRenderer.on('grpc:request', (requestId, collectionUid, eventData) => {
      dispatch(runGrpcRequestEvent({
        eventType: 'request',
        itemUid: requestId as UID,
        collectionUid: collectionUid as UID,
        eventData
      }));
    });

    const removeGrpcMessageSentListener = ipcRenderer.on('grpc:message', (requestId, collectionUid, eventData) => {
      dispatch(runGrpcRequestEvent({
        eventType: 'message',
        itemUid: requestId as UID,
        collectionUid: collectionUid as UID,
        eventData
      }));
    });

    const removeGrpcResponseListener = ipcRenderer.on(`grpc:response`, (requestId, collectionUid, data) => {
      dispatch(grpcResponseReceived({
        itemUid: requestId as UID,
        collectionUid: collectionUid as UID,
        eventType: 'response',
        eventData: data
      }));
    });

    const removeGrpcMetadataListener = ipcRenderer.on(`grpc:metadata`, (requestId, collectionUid, data) => {
      dispatch(grpcResponseReceived({
        itemUid: requestId as UID,
        collectionUid: collectionUid as UID,
        eventType: 'metadata',
        eventData: data
      }));
    });

    const removeGrpcStatusListener = ipcRenderer.on(`grpc:status`, (requestId, collectionUid, data) => {
      dispatch(grpcResponseReceived({
        itemUid: requestId as UID,
        collectionUid: collectionUid as UID,
        eventType: 'status',
        eventData: data
      }));
    });

    const removeGrpcErrorListener = ipcRenderer.on(`grpc:error`, (requestId, collectionUid, data) => {
      dispatch(grpcResponseReceived({
        itemUid: requestId as UID,
        collectionUid: collectionUid as UID,
        eventType: 'error',
        eventData: data
      }));
    });

    const removeGrpcEndListener = ipcRenderer.on(`grpc:server-end-stream`, (requestId, collectionUid, data) => {
      dispatch(grpcResponseReceived({
        itemUid: requestId as UID,
        collectionUid: collectionUid as UID,
        eventType: 'end',
        eventData: data
      }));
    });

    const removeGrpcCancelListener = ipcRenderer.on(`grpc:server-cancel-stream`, (requestId, collectionUid, data) => {
      dispatch(grpcResponseReceived({
        itemUid: requestId as UID,
        collectionUid: collectionUid as UID,
        eventType: 'cancel',
        eventData: data
      }));
    });

    const removeGrpcConnectionsChangedListener = ipcRenderer.on(`grpc:connections-changed`, (data) => {
      dispatch(updateActiveConnectionsInStore(data));
    });

    return () => {
      removeGrpcRequestSentListener();
      removeGrpcMessageSentListener();
      removeGrpcResponseListener();
      removeGrpcMetadataListener();
      removeGrpcStatusListener();
      removeGrpcErrorListener();
      removeGrpcEndListener();
      removeGrpcCancelListener();
      removeGrpcConnectionsChangedListener();
    };
  }, [ipcRenderer, dispatch]);
};

export default useGrpcEventListeners;
