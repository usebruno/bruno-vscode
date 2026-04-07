import React from 'react';
import { saveRequest, saveCollectionSettings, saveFolderRoot } from '../../slices/collections/actions';
import { flattenItems, isItemARequest, isItemAFolder } from 'utils/collections';

interface actionsToInterceptProps {
  dispatch?: boolean;
  getState?: (...args: unknown[]) => unknown;
}

const actionsToIntercept = [
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
  'collections/runRequestEvent',
  'collections/updateCollectionPresets',

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

// Simple object to track pending save timers
const pendingTimers: Record<string, ReturnType<typeof setTimeout>> = {};

const scheduleAutoSave = (key: any, save: any, interval: any) => {
  clearTimeout(pendingTimers[key]);

  pendingTimers[key] = setTimeout(() => {
    save();
    delete pendingTimers[key];
  }, interval);
};

const saveExistingDrafts = (dispatch: any, getState: any, interval: any) => {
  const collections = getState().collections.collections;

  collections.forEach((collection: any) => {
    if (collection.draft) {
      const key = `collection-${collection.uid}`;
      scheduleAutoSave(key, () => dispatch(saveCollectionSettings(collection.uid, null, true)), interval);
    }

    const allItems = flattenItems(collection.items);
    allItems.forEach((item: any) => {
      if (item.draft) {
        if (isItemARequest(item)) {
          const key = `request-${item.uid}`;
          scheduleAutoSave(key, () => dispatch(saveRequest(item.uid, collection.uid, true)), interval);
        } else if (isItemAFolder(item)) {
          const key = `folder-${item.uid}`;
          scheduleAutoSave(key, () => dispatch(saveFolderRoot(collection.uid, item.uid, true)), interval);
        }
      }
    });
  });
};

export const autosaveMiddleware = ({
  dispatch,
  getState
}: any) => (next: any) => (action: any) => {
  const result = next(action);

  const { autoSave } = getState().app.preferences;
  if (!autoSave?.enabled) return result;

  // When autosave is enabled (or settings change), save any existing drafts
  if (action.type === 'app/updatePreferences' && action.payload?.autoSave?.enabled) {
    saveExistingDrafts(dispatch, getState, autoSave.interval);
    return result;
  }

  if (action.type === 'app/updatePreferences' && action.payload?.autoSave?.enabled === false) {
    Object.keys(pendingTimers).forEach((key) => {
      clearTimeout(pendingTimers[key]);
      delete pendingTimers[key];
    });
    return result;
  }

  // Only handle actions that create dirty state
  if (!actionsToIntercept.includes(action.type)) return result;

  const { itemUid, folderUid, collectionUid } = action.payload;
  const interval = autoSave.interval;

  let key, save;

  if (itemUid) {
    key = `request-${itemUid}`;
    save = () => dispatch(saveRequest(itemUid, collectionUid, true));
  } else if (folderUid) {
    key = `folder-${folderUid}`;
    save = () => dispatch(saveFolderRoot(collectionUid, folderUid, true));
  } else if (collectionUid) {
    key = `collection-${collectionUid}`;
    save = () => dispatch(saveCollectionSettings(collectionUid, null, true));
  }

  if (key && save) {
    scheduleAutoSave(key, save, interval);
  }

  return result;
};
