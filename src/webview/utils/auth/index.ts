import { get } from 'lodash';
import type { Auth, AppCollection, AppItem } from '@bruno-types';
import {
  getTreePathFromCollectionToItem
} from 'utils/collections/index';
import { AUTH_MODES } from 'utils/common/constants';

export const resolveInheritedAuth = (item: any, collection: any) => {
  const mergedRequest = {
    ...(item.request || {}),
    ...(item.draft?.request || {})
  };

  const authMode = mergedRequest.auth?.mode;

  // If auth is not inherit or no auth defined, return the merged request as is
  if (!authMode || authMode !== 'inherit') {
    return mergedRequest;
  }

  const requestTreePath = getTreePathFromCollectionToItem(collection, item);

  // Default to collection auth
  const collectionRoot = collection?.draft?.root || collection?.root || {};
  const collectionAuth = get(collectionRoot, 'request.auth', { mode: 'none' });
  let effectiveAuth = collectionAuth;

  // Walk ancestor folders from the nearest one up to the collection.
  for (let idx = requestTreePath.length - 1; idx >= 0; idx--) {
    const ancestor = requestTreePath[idx];
    if (ancestor.type === 'folder') {
      const folderAuth = ancestor?.draft ? get(ancestor, 'draft.root.request.auth') : get(ancestor, 'root.request.auth');
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

export interface EffectiveAuthSource {
  type: 'collection' | 'folder';
  uid: string;
  name: string;
  auth?: Auth;
}

export const getEffectiveAuthSource = (collection: AppCollection, item: AppItem): EffectiveAuthSource | null => {
  const source = item?.draft ?? item;
  const authMode = get(source, 'request.auth.mode') ?? get(source, 'root.request.auth.mode');
  if (authMode !== AUTH_MODES.INHERIT) {
    return null;
  }

  const collectionRoot = collection?.draft?.root || collection?.root || {};
  const collectionAuth = get(collectionRoot, 'request.auth');
  let effectiveSource: EffectiveAuthSource = {
    type: 'collection',
    uid: collection?.uid,
    name: 'Collection',
    auth: collectionAuth
  };

  const requestTreePath = getTreePathFromCollectionToItem(collection, item);
  for (let idx = requestTreePath.length - 1; idx >= 0; idx--) {
    const ancestor = requestTreePath[idx];
    // Skip the item itself (only its ancestors can provide auth) and anything that isn't a folder (e.g. requests)
    if (ancestor?.uid === item?.uid || ancestor?.type !== 'folder') {
      continue;
    }
    const folderAuth = ancestor?.draft ? get(ancestor, 'draft.root.request.auth') : get(ancestor, 'root.request.auth');
    // Skip folders with no auth set, or set to inherit, so we keep looking at the next parent up
    if (!folderAuth?.mode || folderAuth.mode === AUTH_MODES.INHERIT) {
      continue;
    }
    effectiveSource = {
      type: 'folder',
      uid: ancestor.uid,
      name: ancestor.name,
      auth: folderAuth
    };
    break;
  }

  return effectiveSource;
};

export const hasEffectiveAuth = (collection: AppCollection, item: AppItem, supportedModes?: string[]): boolean => {
  const source = item?.draft ?? item;
  const auth = get(source, 'request.auth') ?? get(source, 'root.request.auth');
  const mode = auth?.mode === AUTH_MODES.INHERIT
    ? getEffectiveAuthSource(collection, item)?.auth?.mode
    : auth?.mode;
  if (!mode || mode === AUTH_MODES.NONE) {
    return false;
  }
  if (supportedModes && !supportedModes.includes(mode)) {
    return false;
  }
  return true;
};
