import React, { useState, useEffect, useRef, useCallback } from 'react';
import find from 'lodash/find';
import toast from 'react-hot-toast';
import { useSelector, useDispatch } from 'react-redux';
import { produce } from 'immer';

import { ViewData, ViewType, viewRequiresCollection, viewRequiresItem, viewRequiresFolder } from './types';

import GraphQLRequestPane from 'components/RequestPane/GraphQLRequestPane';
import HttpRequestPane from 'components/RequestPane/HttpRequestPane';
import GrpcRequestPane from 'components/RequestPane/GrpcRequestPane';
import WSRequestPane from 'components/RequestPane/WSRequestPane';
import QueryUrl from 'components/RequestPane/QueryUrl';
import GrpcQueryUrl from 'components/RequestPane/GrpcQueryUrl';
import WsQueryUrl from 'components/RequestPane/WsQueryUrl';

import ResponsePane from 'components/ResponsePane';
import GrpcResponsePane from 'components/ResponsePane/GrpcResponsePane';
import WSResponsePane from 'components/ResponsePane/WsResponsePane';
import NetworkError from 'components/ResponsePane/NetworkError';

import RunnerResults from 'components/RunnerResults';
import CollectionSettings from 'components/CollectionSettings';
import CollectionOverview from 'components/CollectionSettings/Overview';
import FolderSettings from 'components/FolderSettings';
import EnvironmentSettings from 'components/Environments/EnvironmentSettings';
import GlobalEnvironmentSettings from 'components/Environments/GlobalEnvironmentSettings';
import CreateCollectionView from 'components/CreateCollectionView';
import ImportCollectionView from 'components/ImportCollectionView';
import NewRequestView from 'components/NewRequestView';
import ExportCollectionView from 'components/ExportCollectionView';
import CloneCollectionView from 'components/CloneCollectionView';

import RequestNotFound from 'components/RequestTabPanel/RequestNotFound';
import RequestNotLoaded from 'components/RequestTabPanel/RequestNotLoaded';
import RequestIsLoading from 'components/RequestTabPanel/RequestIsLoading';
import FolderNotFound from 'components/RequestTabPanel/FolderNotFound';

import { findItemInCollection, findCollectionByUid } from 'utils/collections';
import { getGlobalEnvironmentVariables, getGlobalEnvironmentVariablesMasked } from 'utils/collections/index';
import { cancelRequest, sendRequest } from 'providers/ReduxStore/slices/collections/actions';
import { ipcRenderer } from 'utils/ipc';
import { useTabPaneBoundaries } from 'hooks/useTabPaneBoundaries';

import DocExplorer from '@usebruno/graphql-docs';

import StyledWrapper from 'components/RequestTabPanel/StyledWrapper';

import CollectionToolBar from 'components/RequestTabs/CollectionToolBar';

import type { RootState } from 'providers/ReduxStore';

// Constants for pane sizing
const MIN_LEFT_PANE_WIDTH = 300;
const MIN_RIGHT_PANE_WIDTH = 490;
const MIN_TOP_PANE_HEIGHT = 150;
const MIN_BOTTOM_PANE_HEIGHT = 150;

interface ViewContainerProps {
  viewData: ViewData;
}

/**
 * Empty view component shown when no content is loaded
 */
const EmptyView: React.FC = () => {
  return <div className="flex-1" />;
};

/**
 * ViewContainer - Routes to the appropriate view based on viewData
 */
const ViewContainer: React.FC<ViewContainerProps> = ({ viewData }) => {
  const dispatch = useDispatch();
  const { viewType, collectionUid, itemUid, folderUid } = viewData;

  const { globalEnvironments, activeGlobalEnvironmentUid } = useSelector(
    (state: RootState) => state.globalEnvironments
  );

  const _collections = useSelector((state: RootState) => state.collections.collections);
  const preferences = useSelector((state: RootState) => state.app.preferences);
  const isVerticalLayout = preferences?.layout?.responsePaneOrientation === 'vertical';
  const isConsoleOpen = useSelector((state: RootState) => state.logs.isConsoleOpen);

  const collections = produce(_collections, (draft: any) => {
    const collection = find(draft, (c: any) => c.uid === collectionUid);
    if (collection) {
      const globalEnvironmentVariables = getGlobalEnvironmentVariables({
        globalEnvironments,
        activeGlobalEnvironmentUid
      });
      const globalEnvSecrets = getGlobalEnvironmentVariablesMasked({
        globalEnvironments,
        activeGlobalEnvironmentUid
      });
      collection.globalEnvironmentVariables = globalEnvironmentVariables;
      collection.globalEnvSecrets = globalEnvSecrets;
    }
  });

  const collection = find(collections, (c: any) => c.uid === collectionUid);

  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const isVerticalLayoutRef = useRef(isVerticalLayout);
  const mainSectionRef = useRef<HTMLElement>(null);
  const previousTopPaneHeight = useRef<number | null>(null);

  // Use unique key for pane boundaries (use collectionUid + itemUid for stability)
  const boundaryKey = `${collectionUid}-${itemUid || folderUid || viewType}`;
  const {
    left: leftPaneWidth,
    top: topPaneHeight,
    reset: resetPaneBoundaries,
    setTop: setTopPaneHeight,
    setLeft: setLeftPaneWidth
  } = useTabPaneBoundaries(boundaryKey);

  const docExplorerRef = useRef<any>(null);
  const [schema, setSchema] = useState<any>(null);
  const [showGqlDocs, setShowGqlDocs] = useState(false);

  const onSchemaLoad = useCallback((schema: any) => setSchema(schema), []);
  const toggleDocs = useCallback(() => setShowGqlDocs((prev) => !prev), []);

  const handleGqlClickReference = useCallback((reference: any) => {
    if (docExplorerRef.current) {
      docExplorerRef.current.showDocForReference(reference);
    }
    if (!showGqlDocs) {
      setShowGqlDocs(true);
    }
  }, [showGqlDocs]);

  useEffect(() => {
    isVerticalLayoutRef.current = isVerticalLayout;
  }, [isVerticalLayout]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingRef.current || !mainSectionRef.current) return;

    e.preventDefault();
    const mainRect = mainSectionRef.current.getBoundingClientRect();

    if (isVerticalLayoutRef.current) {
      const newHeight = e.clientY - mainRect.top;
      const maxHeight = mainRect.height - MIN_BOTTOM_PANE_HEIGHT;
      const clampedHeight = Math.max(MIN_TOP_PANE_HEIGHT, Math.min(newHeight, maxHeight));
      setTopPaneHeight(clampedHeight);
    } else {
      const newWidth = e.clientX - mainRect.left;
      const maxWidth = mainRect.width - MIN_RIGHT_PANE_WIDTH;
      const clampedWidth = Math.max(MIN_LEFT_PANE_WIDTH, Math.min(newWidth, maxWidth));
      setLeftPaneWidth(clampedWidth);
    }
  }, [setTopPaneHeight, setLeftPaneWidth]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (draggingRef.current) {
      e.preventDefault();
      draggingRef.current = false;
      setDragging(false);
    }
  }, []);

  const handleDragbarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    setDragging(true);
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleMouseUp, handleMouseMove]);

  // Adjust pane height when console opens/closes (vertical layout only)
  useEffect(() => {
    if (!isVerticalLayout) return;

    if (isConsoleOpen) {
      if (previousTopPaneHeight.current === null) {
        previousTopPaneHeight.current = topPaneHeight;
      }
      const maxHeight = 200;
      if (topPaneHeight > maxHeight) {
        setTopPaneHeight(maxHeight);
      }
    } else {
      if (previousTopPaneHeight.current !== null) {
        setTopPaneHeight(previousTopPaneHeight.current);
        previousTopPaneHeight.current = null;
      }
    }
  }, [isConsoleOpen, isVerticalLayout, topPaneHeight, setTopPaneHeight]);

  // Restore dirty state when a view with a draft is opened/reopened
  useEffect(() => {
    if (!collection || viewType === 'empty') return;

    const notifyDirtyState = async (
      filePath: string,
      uid: string,
      itemType: 'request' | 'folder' | 'collection'
    ) => {
      try {
        await ipcRenderer.invoke('renderer:set-dirty-state', {
          filePath,
          itemUid: uid,
          collectionUid: collection.uid,
          itemType,
          isDirty: true
        });
      } catch (error) {
        console.warn('[ViewContainer] Failed to restore dirty state:', error);
      }
    };

    const format = collection.format || 'bru';

    // Check if the current item has a draft and restore dirty state
    if (viewType === 'request' && itemUid) {
      const item = findItemInCollection(collection, itemUid);
      if (item?.draft && item.pathname) {
        notifyDirtyState(item.pathname, itemUid, 'request');
      }
    } else if (viewType === 'folder-settings' && folderUid) {
      const folder = findItemInCollection(collection, folderUid);
      if (folder?.draft && folder.pathname) {
        const ext = format === 'yml' ? 'folder.yml' : 'folder.bru';
        notifyDirtyState(`${folder.pathname}/${ext}`, folderUid, 'folder');
      }
    } else if (viewType === 'collection-settings' && collection.draft) {
      const ext = format === 'yml' ? 'opencollection.yml' : 'collection.bru';
      notifyDirtyState(`${collection.pathname}/${ext}`, collection.uid, 'collection');
    }
  }, [viewType, collection, itemUid, folderUid]);

  if (viewType === 'empty') {
    return <EmptyView />;
  }

  if (viewType === 'global-environments') {
    return <GlobalEnvironmentSettings />;
  }

  if (viewType === 'create-collection') {
    return <CreateCollectionView />;
  }

  if (viewType === 'import-collection') {
    return <ImportCollectionView />;
  }

  if (viewType === 'new-request') {
    if (!collection) return null;
    return <NewRequestView collection={collection} itemUid={itemUid} />;
  }

  if (viewType === 'export-collection') {
    if (!collection) return null;
    return <ExportCollectionView collection={collection} />;
  }

  if (viewType === 'clone-collection') {
    if (!collection) return null;
    return <CloneCollectionView collection={collection} />;
  }

  // For views that require a collection, wait silently until it arrives in Redux.
  // Returning null here prevents the "Collection not found!" flash during initial load.
  if (viewRequiresCollection(viewType)) {
    if (!collectionUid || !collection || !collection.uid) return null;
  }

  // Route to specific view components
  switch (viewType) {
    case 'collection-runner':
      return (
        <>
          <CollectionToolBar collection={collection} />
          <RunnerResults collection={collection} />
        </>
      );

    case 'collection-settings':
      return (
        <>
          <CollectionToolBar collection={collection} />
          <CollectionSettings collection={collection} />
        </>
      );

    case 'collection-overview':
      return (
        <>
          <CollectionToolBar collection={collection} />
          <CollectionOverview collection={collection} />
        </>
      );

    case 'folder-settings': {
      const folder = findItemInCollection(collection, folderUid);
      if (!folder) {
        return <FolderNotFound folderUid={folderUid} />;
      }
      return (
        <>
          <CollectionToolBar collection={collection} />
          <FolderSettings collection={collection} folder={folder} />
        </>
      );
    }

    case 'environment-settings':
      return (
        <>
          <CollectionToolBar collection={collection} />
          <EnvironmentSettings collection={collection} />
        </>
      );

    case 'request': {
      const item = findItemInCollection(collection, itemUid);

      // If item not found yet, return empty - it will appear once loaded
      // Don't show "Request no longer exists" as this flashes during normal loading
      if (!item || !item.uid) {
        return null;
      }

      if (item?.partial) {
        return <RequestNotLoaded item={item} collection={collection} />;
      }

      // Note: item.loading is for file parsing state, not for HTTP request sending state
      // The requestState property handles HTTP request in-flight states
      if (item?.loading) {
        return <RequestIsLoading item={item} />;
      }

      const isGrpcRequest = item?.type === 'grpc-request';
      const isWsRequest = item?.type === 'ws-request';

      const handleRun = async () => {
        const request = item.draft ? item.draft.request : item.request;

        if (isGrpcRequest && !request?.url) {
          toast.error('Please enter a valid gRPC server URL');
          return;
        }

        if (isGrpcRequest && !(request as { method?: string })?.method) {
          toast.error('Please select a gRPC method');
          return;
        }

        if (isWsRequest && !request?.url) {
          toast.error('Please enter a valid WebSocket URL');
          return;
        }

        const response = item.response as { stream?: { running?: boolean } } | null;
        if (response?.stream?.running) {
          dispatch(cancelRequest(item.cancelTokenUid, item, collection) as any).catch(() =>
            toast.custom((t) => <NetworkError onClose={() => toast.dismiss(t.id)} />, {
              duration: 5000
            })
          );
        } else if (item.requestState !== 'sending' && item.requestState !== 'queued') {
          dispatch(sendRequest(item, collection.uid) as any).catch(() =>
            toast.custom((t) => <NetworkError onClose={() => toast.dismiss(t.id)} />, {
              duration: 5000
            })
          );
        }
      };

      const renderQueryUrl = () => {
        if (isGrpcRequest) {
          return <GrpcQueryUrl item={item} collection={collection} handleRun={handleRun} />;
        }
        if (isWsRequest) {
          return <WsQueryUrl item={item} collection={collection} handleRun={handleRun} />;
        }
        return <QueryUrl item={item} collection={collection} handleRun={handleRun} />;
      };

      const renderRequestPane = () => {
        switch (item.type) {
          case 'graphql-request':
            return (
              <GraphQLRequestPane
                item={item}
                collection={collection}
                onSchemaLoad={onSchemaLoad}
                toggleDocs={toggleDocs}
                handleGqlClickReference={handleGqlClickReference}
              />
            );
          case 'http-request':
            return <HttpRequestPane item={item} collection={collection} />;
          case 'grpc-request':
            return <GrpcRequestPane item={item} collection={collection} handleRun={handleRun} />;
          case 'ws-request':
            return <WSRequestPane item={item} collection={collection} handleRun={handleRun} />;
          default:
            return null;
        }
      };

      const renderResponsePane = () => {
        switch (item.type) {
          case 'grpc-request':
            return <GrpcResponsePane item={item} collection={collection} response={item.response} />;
          case 'ws-request':
            return <WSResponsePane item={item} collection={collection} response={item.response} />;
          default:
            return <ResponsePane item={item} collection={collection} response={item.response} />;
        }
      };

      const requestPaneStyle = isVerticalLayout
        ? {
            height: `${Math.max(topPaneHeight, MIN_TOP_PANE_HEIGHT)}px`,
            minHeight: `${MIN_TOP_PANE_HEIGHT}px`,
            width: '100%'
          }
        : {
            width: `${Math.max(leftPaneWidth, MIN_LEFT_PANE_WIDTH)}px`
          };

      return (
        <StyledWrapper
          className={`flex flex-col flex-grow relative ${dragging ? 'dragging' : ''} ${
            isVerticalLayout ? 'vertical-layout' : ''
          }`}
        >
          <CollectionToolBar collection={collection} />
          <div className="pt-3 pb-3 px-4">{renderQueryUrl()}</div>
          <section
            ref={mainSectionRef}
            className={`main flex ${isVerticalLayout ? 'flex-col' : ''} flex-grow pb-4 relative overflow-auto`}
          >
            <section className="request-pane">
              <div className="px-4 h-full" style={requestPaneStyle}>
                {renderRequestPane()}
              </div>
            </section>

            <div
              className="dragbar-wrapper"
              onDoubleClick={(e) => {
                e.preventDefault();
                resetPaneBoundaries();
              }}
              onMouseDown={handleDragbarMouseDown}
            >
              <div className="dragbar-handle" />
            </div>

            <section className="response-pane">{renderResponsePane()}</section>
          </section>

          {item.type === 'graphql-request' ? (
            <div className={`graphql-docs-explorer-container ${showGqlDocs ? '' : 'hidden'}`}>
              <DocExplorer schema={schema} ref={(r: any) => (docExplorerRef.current = r)}>
                <button className="mr-2" onClick={toggleDocs} aria-label="Close Documentation Explorer">
                  {'\u2715'}
                </button>
              </DocExplorer>
            </div>
          ) : null}
        </StyledWrapper>
      );
    }

    default:
      return <div className="pb-4 px-4">Unknown view type: {viewType}</div>;
  }
};

export default ViewContainer;
