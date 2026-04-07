/**
 * VS Code Dirty State Middleware
 *
 * This middleware synchronizes Bruno's draft state with VS Code's document dirty state.
 * When a draft is created or cleared, it notifies the VS Code extension so that:
 * - VS Code can show the dirty indicator (dot) on tabs
 * - VS Code's save command can trigger Bruno's save
 * - VS Code can prompt to save when closing tabs
 */

import { ipcRenderer } from 'utils/ipc';
import { findItemInCollection, findCollectionByUid, isItemARequest, isItemAFolder } from 'utils/collections';

// Actions that create drafts (make items dirty)
const draftCreatingActions = [
  'collections/requestUrlChanged',
  'collections/updateAuth',
  'collections/addQueryParam',
  'collections/moveQueryParam',
  'collections/updateQueryParam',
  'collections/deleteQueryParam',
  'collections/setQueryParams',
  'collections/updatePathParam',
  'collections/addRequestHeader',
  'collections/updateRequestHeader',
  'collections/deleteRequestHeader',
  'collections/moveRequestHeader',
  'collections/setRequestHeaders',
  'collections/addFormUrlEncodedParam',
  'collections/updateFormUrlEncodedParam',
  'collections/deleteFormUrlEncodedParam',
  'collections/moveFormUrlEncodedParam',
  'collections/setFormUrlEncodedParams',
  'collections/addMultipartFormParam',
  'collections/updateMultipartFormParam',
  'collections/deleteMultipartFormParam',
  'collections/moveMultipartFormParam',
  'collections/setMultipartFormParams',
  'collections/updateRequestAuthMode',
  'collections/updateRequestBodyMode',
  'collections/updateRequestBody',
  'collections/updateRequestGraphqlQuery',
  'collections/updateRequestGraphqlVariables',
  'collections/updateRequestScript',
  'collections/updateResponseScript',
  'collections/updateRequestTests',
  'collections/updateRequestMethod',
  'collections/addAssertion',
  'collections/updateAssertion',
  'collections/deleteAssertion',
  'collections/moveAssertion',
  'collections/addVar',
  'collections/updateVar',
  'collections/deleteVar',
  'collections/moveVar',
  'collections/updateRequestDocs',

  'collections/addFolderHeader',
  'collections/updateFolderHeader',
  'collections/deleteFolderHeader',
  'collections/setFolderHeaders',
  'collections/addFolderVar',
  'collections/updateFolderVar',
  'collections/deleteFolderVar',
  'collections/setFolderVars',
  'collections/updateFolderRequestScript',
  'collections/updateFolderResponseScript',
  'collections/updateFolderTests',
  'collections/updateFolderAuth',
  'collections/updateFolderAuthMode',
  'collections/updateFolderDocs',

  'collections/addCollectionHeader',
  'collections/updateCollectionHeader',
  'collections/deleteCollectionHeader',
  'collections/setCollectionHeaders',
  'collections/addCollectionVar',
  'collections/updateCollectionVar',
  'collections/deleteCollectionVar',
  'collections/setCollectionVars',
  'collections/updateCollectionAuth',
  'collections/updateCollectionAuthMode',
  'collections/updateCollectionRequestScript',
  'collections/updateCollectionResponseScript',
  'collections/updateCollectionTests',
  'collections/updateCollectionDocs',
  'collections/updateCollectionClientCertificates',
  'collections/updateCollectionProtobuf',
  'collections/updateCollectionProxy'
];

// Actions that clear drafts (save operations)
const draftClearingActions = [
  'collections/saveRequest',
  'collections/saveCollectionDraft',
  'collections/saveFolderDraft',
  'collections/deleteRequestDraft',
  'collections/deleteCollectionDraft',
  'collections/deleteFolderDraft'
];

const notifyDirtyState = async (
  filePath: string,
  itemUid: string,
  collectionUid: string,
  itemType: 'request' | 'folder' | 'collection',
  isDirty: boolean
) => {
  console.log('[VSCodeDirtyState] Notifying dirty state:', {
    filePath,
    itemType,
    isDirty
  });
  try {
    const result = await ipcRenderer.invoke('renderer:set-dirty-state', {
      filePath,
      itemUid,
      collectionUid,
      itemType,
      isDirty
    });
    console.log('[VSCodeDirtyState] Notification result:', result);
  } catch (error) {
    console.warn('[VSCodeDirtyState] Failed to notify dirty state:', error);
  }
};

const getItemFilePath = (item: any): string | null => {
  return item?.pathname || null;
};

const getCollectionFilePath = (collection: any): string | null => {
  if (!collection?.pathname) return null;
  // Collection settings are in opencollection.yml for yml format, collection.bru for bru format
  const format = collection.format || 'bru';
  if (format === 'yml') {
    return `${collection.pathname}/opencollection.yml`;
  }
  return `${collection.pathname}/collection.bru`;
};

const getFolderFilePath = (folder: any, collection: any): string | null => {
  if (!folder?.pathname) return null;
  // Folder settings are in folder.yml for yml format, folder.bru for bru format
  const format = collection?.format || 'bru';
  if (format === 'yml') {
    return `${folder.pathname}/folder.yml`;
  }
  return `${folder.pathname}/folder.bru`;
};

export const vscodeDirtyStateMiddleware = ({
  getState
}: any) => (next: any) => (action: any) => {
  const result = next(action);

  if (draftCreatingActions.includes(action.type)) {
    console.log('[VSCodeDirtyState] Draft-creating action detected:', action.type);
    const state = getState();
    const payload = action.payload || {};
    const { itemUid, folderUid, collectionUid } = payload;

    console.log('[VSCodeDirtyState] Payload:', { itemUid, folderUid, collectionUid });

    if (itemUid && collectionUid) {
      const collection = findCollectionByUid(state.collections.collections, collectionUid);
      if (collection) {
        const item = findItemInCollection(collection, itemUid);
        if (item) {
          const filePath = getItemFilePath(item);
          console.log('[VSCodeDirtyState] Found item, filePath:', filePath);
          if (filePath) {
            notifyDirtyState(filePath, itemUid, collectionUid, 'request', true);
          } else {
            console.warn('[VSCodeDirtyState] Item has no pathname! Item:', {
              uid: item.uid,
              name: item.name,
              filename: item.filename,
              pathname: item.pathname
            });
          }
        } else {
          console.warn('[VSCodeDirtyState] Item not found in collection. itemUid:', itemUid);
        }
      } else {
        console.warn('[VSCodeDirtyState] Collection not found:', collectionUid);
      }
    } else if (folderUid && collectionUid) {
      const collection = findCollectionByUid(state.collections.collections, collectionUid);
      if (collection) {
        const folder = findItemInCollection(collection, folderUid);
        if (folder) {
          const filePath = getFolderFilePath(folder, collection);
          if (filePath) {
            notifyDirtyState(filePath, folderUid, collectionUid, 'folder', true);
          }
        }
      }
    } else if (collectionUid) {
      const collection = findCollectionByUid(state.collections.collections, collectionUid);
      if (collection) {
        const filePath = getCollectionFilePath(collection);
        if (filePath) {
          notifyDirtyState(filePath, collectionUid, collectionUid, 'collection', true);
        }
      }
    } else {
      console.warn('[VSCodeDirtyState] Could not determine item type from payload:', payload);
    }
  }

  if (draftClearingActions.includes(action.type)) {
    const { itemUid, folderUid, collectionUid, pathname, filePath: actionFilePath } = action.payload || {};

    // Try to determine the file path from the action payload
    let filePath = actionFilePath || pathname;
    let itemType: 'request' | 'folder' | 'collection' = 'request';

    if (itemUid) {
      itemType = 'request';
      if (!filePath) {
        const state = getState();
        const collection = findCollectionByUid(state.collections.collections, collectionUid);
        if (collection) {
          const item = findItemInCollection(collection, itemUid);
          filePath = getItemFilePath(item);
        }
      }
    } else if (folderUid) {
      itemType = 'folder';
      if (!filePath) {
        const state = getState();
        const collection = findCollectionByUid(state.collections.collections, collectionUid);
        if (collection) {
          const folder = findItemInCollection(collection, folderUid);
          filePath = getFolderFilePath(folder, collection);
        }
      }
    } else if (collectionUid) {
      itemType = 'collection';
      if (!filePath) {
        const state = getState();
        const collection = findCollectionByUid(state.collections.collections, collectionUid);
        filePath = getCollectionFilePath(collection);
      }
    }

    if (filePath) {
      notifyDirtyState(
        filePath,
        itemUid || folderUid || collectionUid,
        collectionUid,
        itemType,
        false
      );
    } else {
      console.warn('[VSCodeDirtyState] Could not determine file path for draft-clearing action');
    }
  }

  return result;
};
