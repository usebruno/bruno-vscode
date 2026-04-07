import React, { useEffect } from 'react';
import toast from 'react-hot-toast';
import find from 'lodash/find';
import Mousetrap from 'mousetrap';
import { useSelector, useDispatch } from 'react-redux';
import NetworkError from 'components/ResponsePane/NetworkError';
import {
  sendRequest,
} from 'providers/ReduxStore/slices/collections/actions';
import { findCollectionByUid, findItemInCollection } from 'utils/collections';
import { getKeyBindingsForActionAllOS } from './keyMappings';
import { RootState } from 'providers/ReduxStore';

export const HotkeysContext = React.createContext<string | null>(null);

/**
 * HotkeysProvider for Bruno VS Code extension
 * Only essential shortcuts are registered to avoid conflicts with VS Code's native shortcuts
 * - Save is handled by the extension keybinding (bruno.saveFromEditor) → main:trigger-save event
 * - Send Request (Cmd/Ctrl+Enter)
 */
export const HotkeysProvider = (props: any) => {
  const dispatch = useDispatch();
  const tabs = useSelector((state: RootState) => state.tabs.tabs);
  const collections = useSelector((state: RootState) => state.collections.collections);
  const activeTabUid = useSelector((state: RootState) => state.tabs.activeTabUid);

  useEffect(() => {
    Mousetrap.bind([...getKeyBindingsForActionAllOS('sendRequest')], (e: any) => {
      const activeTab = find(tabs, (t) => t.uid === activeTabUid);
      if (activeTab) {
        const collection = findCollectionByUid(collections, activeTab.collectionUid);

        if (collection) {
          const item = findItemInCollection(collection, activeTab.uid);
          if (item) {
            if (item.type === 'grpc-request') {
              const request = item.draft ? item.draft.request : item.request;
              if (!request.url) {
                toast.error('Please enter a valid gRPC server URL');
                return;
              }
              if (!(request as any).method) {
                toast.error('Please select a gRPC method');
                return;
              }
            }

            (dispatch(sendRequest(item, collection.uid)) as any).catch((err: any) => toast.custom((t) => <NetworkError onClose={() => toast.dismiss(t.id)} />, {
              duration: 5000
            })
            );
          }
        }
      }

      return false; // this stops the event bubbling
    });

    return () => {
      Mousetrap.unbind([...getKeyBindingsForActionAllOS('sendRequest')]);
    };
  }, [activeTabUid, tabs, collections, dispatch]);

  return (
    <HotkeysContext.Provider {...props} value="hotkey">
      <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>{props.children}</div>
    </HotkeysContext.Provider>
  );
};

export const useHotkeys = (): unknown => {
  const context = React.useContext(HotkeysContext);

  if (!context) {
    throw new Error(`useHotkeys must be used within a HotkeysProvider`);
  }

  return context;
};

export default HotkeysProvider;
