import React, { useRef, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import find from 'lodash/find';
import { findItemInCollection, findCollectionByUid, getDefaultRequestPaneTab } from 'utils/collections';
import { hasPlatformSupport } from 'utils/common/platform';
import StyledWrapper from './StyledWrapper';
import 'codemirror/theme/material.css';
import 'codemirror/theme/monokai.css';
import 'codemirror/addon/scroll/simplescrollbars.css';
import useGrpcEventListeners from 'utils/network/grpc-event-listeners';
import useWsEventListeners from 'utils/network/ws-event-listeners';

import { ViewContainer, ViewData } from 'views';

import { addTab } from 'providers/ReduxStore/slices/tabs';
import {
  saveRequest,
  saveFolderRoot,
  saveCollectionSettings
} from 'providers/ReduxStore/slices/collections/actions';

require('codemirror/mode/javascript/javascript');
require('codemirror/mode/xml/xml');
require('codemirror/mode/sparql/sparql');
require('codemirror/addon/comment/comment');
require('codemirror/addon/dialog/dialog');
require('codemirror/addon/edit/closebrackets');
require('codemirror/addon/edit/matchbrackets');
require('codemirror/addon/fold/brace-fold');
require('codemirror/addon/fold/foldgutter');
require('codemirror/addon/fold/xml-fold');
require('codemirror/addon/hint/javascript-hint');
require('codemirror/addon/hint/show-hint');
require('codemirror/addon/lint/lint');
require('codemirror/addon/lint/json-lint');
require('codemirror/addon/mode/overlay');
require('codemirror/addon/scroll/simplescrollbars');
require('codemirror/addon/search/jump-to-line');
require('codemirror/addon/search/search');
require('codemirror/addon/search/searchcursor');
require('codemirror/addon/display/placeholder');
require('codemirror/keymap/sublime');

require('codemirror-graphql/hint');
require('codemirror-graphql/info');
require('codemirror-graphql/jump');
require('codemirror-graphql/lint');
require('codemirror-graphql/mode');

require('utils/codemirror/brunoVarInfo');
require('utils/codemirror/javascript-lint');
require('utils/codemirror/autocomplete');

export default function Main(): React.ReactElement {
  const mainSectionRef = useRef<HTMLDivElement>(null);
  const dispatch = useDispatch();
  const collections = useSelector((state: any) => state.collections.collections);
  const tabs = useSelector((state: any) => state.tabs.tabs);
  const activeTabUid = useSelector((state: any) => state.tabs.activeTabUid);

  const [viewData, setViewData] = useState<ViewData>({ viewType: 'empty' });

  useGrpcEventListeners();
  useWsEventListeners();

  useEffect(() => {
    if (viewData.viewType === 'empty') {
      return;
    }

    // This allows ResponsePane/RequestPane to track sub-tab selections
    const viewsNeedingTabState = ['request', 'response-example'];
    if (viewsNeedingTabState.includes(viewData.viewType) && viewData.itemUid) {
      // Wait for the item to be loaded in the collection before creating the tab.
      // Items are loaded asynchronously via file watcher events. Without the item,
      // we can't determine the correct requestPaneTab (e.g. 'body' for WS/gRPC,
      // 'query' for GraphQL). This effect re-runs when collections update.
      if (viewData.collectionUid) {
        const collection = findCollectionByUid(collections, viewData.collectionUid);
        if (collection) {
          const item = findItemInCollection(collection, viewData.itemUid);
          if (item) {
            dispatch(addTab({
              uid: viewData.itemUid,
              collectionUid: viewData.collectionUid,
              requestPaneTab: getDefaultRequestPaneTab(item),
              type: 'request',
              preview: false
            }));
          }
        }
      }
    } else if (viewData.viewType === 'collection-runner' && viewData.collectionUid) {
      // Runner tab uses a unique ID to allow opening alongside collection-settings
      dispatch(addTab({
        uid: `runner-${viewData.collectionUid}`,
        collectionUid: viewData.collectionUid,
        type: 'collection-runner',
        preview: false
      }));
    } else if (viewData.viewType === 'collection-settings' && viewData.collectionUid) {
      // Collection settings uses a unique ID to allow opening alongside runner
      dispatch(addTab({
        uid: `settings-${viewData.collectionUid}`,
        collectionUid: viewData.collectionUid,
        type: 'collection-settings',
        preview: false
      }));
    } else if (viewData.viewType === 'folder-settings' && viewData.folderUid) {
      dispatch(addTab({
        uid: viewData.folderUid,
        collectionUid: viewData.collectionUid,
        type: 'folder-settings',
        preview: false
      }));
    } else if (viewData.viewType === 'global-environments') {
      dispatch(addTab({
        uid: 'global-environments',
        collectionUid: null,
        type: 'global-environment-settings',
        preview: false
      }));
    } else if (viewData.viewType === 'environment-settings' && viewData.collectionUid) {
      dispatch(addTab({
        uid: `env-settings-${viewData.collectionUid}`,
        collectionUid: viewData.collectionUid,
        type: 'environment-settings',
        preview: false
      }));
    } else if (viewData.viewType === 'variables' && viewData.collectionUid) {
      dispatch(addTab({
        uid: `variables-${viewData.collectionUid}`,
        collectionUid: viewData.collectionUid,
        type: 'variables',
        preview: false
      }));
    }
  }, [viewData, dispatch, collections]);

  useEffect(() => {
    if (mainSectionRef.current) {
      mainSectionRef.current.setAttribute('data-app-state', 'loaded');
    }

    if (!hasPlatformSupport()) {
      return;
    }

    const { ipcRenderer } = window;

    const removeSetViewListener = ipcRenderer.on('main:set-view', (data: ViewData) => {
      setViewData(data);
    });

    const removeAppLoadedListener = ipcRenderer.on('main:app-loaded', () => {
      if (mainSectionRef.current) {
        mainSectionRef.current.setAttribute('data-app-state', 'loaded');
      }
    });

    // Request initial view data from extension
    ipcRenderer.invoke('renderer:get-initial-view').then((data: ViewData | null) => {
      if (data) {
        setViewData(data);
      }
    }).catch((err: Error) => {
      console.error('[Bruno] No initial view data:', err.message);
    });

    return () => {
      removeSetViewListener();
      removeAppLoadedListener();
    };
  }, []);

  useEffect(() => {
    if (!hasPlatformSupport()) return;

    const { ipcRenderer } = window;
    const removeTriggerSaveListener = ipcRenderer.on('main:trigger-save', () => {
      const activeTab = find(tabs, (t: any) => t.uid === activeTabUid);
      if (!activeTab) return;

      if (activeTab.type === 'environment-settings' || activeTab.type === 'global-environment-settings') {
        window.dispatchEvent(new CustomEvent('environment-save'));
        return;
      }

      const collection = findCollectionByUid(collections, activeTab.collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, activeTab.uid);
        if (item && item.uid) {
          if (activeTab.type === 'folder-settings') {
            dispatch(saveFolderRoot(collection.uid, item.uid));
          } else {
            dispatch(saveRequest(activeTab.uid, activeTab.collectionUid));
          }
        } else if (activeTab.type === 'collection-settings') {
          dispatch(saveCollectionSettings(collection.uid));
        }
      }
    });

    return () => {
      removeTriggerSaveListener();
    };
  }, [tabs, activeTabUid, collections, dispatch]);

  return (
    <div id="main-container" className="flex flex-col h-screen max-h-screen overflow-hidden">
      <div
        ref={mainSectionRef}
        className="flex-1 min-h-0 flex"
        data-app-state="loading"
        style={{ height: '100vh' }}
      >
        <StyledWrapper style={{ height: '100%', width: '100%', zIndex: 1 }}>
          <section className="flex flex-grow flex-col overflow-hidden w-full">
            <ViewContainer viewData={viewData} />
          </section>
        </StyledWrapper>
      </div>
    </div>
  );
}
