import React from 'react';
import { get } from 'lodash';
import {
  getTreePathFromCollectionToItem
} from 'utils/collections/index';

export const resolveInheritedAuth = (item: any, collection: any) => {
  const mergedRequest = {
    ...(item.request || {}),
    ...(item.draft?.request || {})
  };

  const authMode = mergedRequest.auth.mode;

  // If auth is not inherit or no auth defined, return the merged request as is
  if (!authMode || authMode !== 'inherit') {
    return mergedRequest;
  }

  const requestTreePath = getTreePathFromCollectionToItem(collection, item);

  // Default to collection auth
  const collectionRoot = collection?.draft?.root || collection?.root || {};
  const collectionAuth = get(collectionRoot, 'request.auth', { mode: 'none' });
  let effectiveAuth = collectionAuth;

  for (let i of [...requestTreePath].reverse()) {
    if (i.type === 'folder') {
      const folderAuth = i?.draft ? get(i, 'draft.request.auth') : get(i, 'root.request.auth');
      if (folderAuth && folderAuth.mode && folderAuth.mode !== 'none' && folderAuth.mode !== 'inherit') {
        effectiveAuth = folderAuth;
        break;
      }
    }
  }

  return {
    ...mergedRequest,
    auth: effectiveAuth
  };
};
