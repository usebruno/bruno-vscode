import React from 'react';
import { handleMakeTabParmanent } from './utils';
import { findCollectionByUid, findItemInCollection } from 'utils/collections';
import { hasRequestChanges }from 'utils/collections';

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
  'collections/setRequestAssertions',
  'collections/addVar',
  'collections/updateVar',
  'collections/deleteVar',
  'collections/moveVar',
  'collections/setRequestVars',
  'collections/updateRequestDocs',
  'collections/runRequestEvent', // TODO: This doesn't necessarily related to a draft state, need to rethink.

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
const transientSyncTimers: Record<string, ReturnType<typeof setTimeout>> = {};

const scheduleTransientSync = (item: any) => {
  if (!item?.uid) return;
  clearTimeout(transientSyncTimers[item.uid]);
  transientSyncTimers[item.uid] = setTimeout(() => {
    try {
      window.ipcRenderer.send('transient:item-updated', {
        itemUid: item.uid,
        item: JSON.parse(JSON.stringify(item))
      });
    } catch {}
    delete transientSyncTimers[item.uid];
  }, 250);
};

export const draftDetectMiddleware = ({
  dispatch,
  getState
}: any) => (next: any) => (action: any) => {
  if (actionsToIntercept.includes(action.type)) {
    const state = getState();
    handleMakeTabParmanent(state, action, dispatch);
  }
  const result = next(action);

  if (actionsToIntercept.includes(action.type)) {
    const { itemUid, collectionUid } = action.payload || {};
    if (itemUid && collectionUid) {
      const collection = findCollectionByUid(getState().collections.collections, collectionUid);
      const item = collection ? findItemInCollection(collection, itemUid) : null;
      if ((item as any)?.isTransient) {
        scheduleTransientSync(item);
      }
    }
  }

  return result;
};
