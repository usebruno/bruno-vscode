import React from 'react';
import get from 'lodash/get';
import AwsV4Auth from './AwsV4Auth';
import BearerAuth from './BearerAuth';
import BasicAuth from './BasicAuth';
import DigestAuth from './DigestAuth';
import WsseAuth from './WsseAuth';
import NTLMAuth from './NTLMAuth';
import { updateAuth } from 'providers/ReduxStore/slices/collections';
import { saveRequest } from 'providers/ReduxStore/slices/collections/actions';
import { useDispatch } from 'react-redux';

import ApiKeyAuth from './ApiKeyAuth';
import StyledWrapper from './StyledWrapper';
import { humanizeRequestAuthMode } from 'utils/collections';
import OAuth2 from './OAuth2/index';
import { findItemInCollection, findParentItemInCollection } from 'utils/collections/index';

interface getTreePathFromCollectionToItemProps {
  item?: React.ReactNode;
  collection?: React.ReactNode;
}

const getTreePathFromCollectionToItem = (collection: any, _item: any) => {
  let path = [];
  let item = findItemInCollection(collection, _item?.uid);
  while (item) {
    path.unshift(item);
    item = findParentItemInCollection(collection, item?.uid);
  }
  return path;
};

const Auth = ({
  item,
  collection
}: any) => {
  const dispatch = useDispatch();
  const authMode = item.draft ? get(item, 'draft.request.auth.mode') : get(item, 'request.auth.mode');
  const requestTreePath = getTreePathFromCollectionToItem(collection, item);

  const request = item.draft
    ? get(item, 'draft.request', {})
    : get(item, 'request', {});

  const save = () => {
    return dispatch(saveRequest(item.uid, collection.uid));
  };

  const getEffectiveAuthSource = () => {
    // Return source for 'inherit' mode or undefined auth mode
    if (authMode && authMode !== 'inherit') return null;

    const collectionRoot = collection?.draft?.root || collection?.root || {};
    const collectionAuth = get(collectionRoot, 'request.auth');
    let effectiveSource = {
      type: 'collection',
      name: 'Collection',
      auth: collectionAuth
    };

    for (let i of [...requestTreePath].reverse()) {
      if (i.type === 'folder') {
        const folderAuth = get(i, 'root.request.auth');
        if (folderAuth && folderAuth.mode && folderAuth.mode !== 'inherit') {
          effectiveSource = {
            type: 'folder',
            name: i.name,
            auth: folderAuth
          };
          break;
        }
      }
    }

    return effectiveSource;
  };

  const getAuthView = () => {
    switch (authMode) {
      case 'none': {
        return <div className="mt-2">No Auth</div>;
      }
      case 'awsv4': {
        return <AwsV4Auth collection={collection} item={item} request={request} save={save} updateAuth={updateAuth} />;
      }
      case 'basic': {
        return <BasicAuth collection={collection} item={item} request={request} save={save} updateAuth={updateAuth} />;
      }
      case 'bearer': {
        return <BearerAuth collection={collection} item={item} request={request} save={save} updateAuth={updateAuth} />;
      }
      case 'digest': {
        return <DigestAuth collection={collection} item={item} request={request} save={save} updateAuth={updateAuth} />;
      }
      case 'ntlm': {
        return <NTLMAuth collection={collection} item={item} request={request} save={save} updateAuth={updateAuth} />;
      }
      case 'oauth2': {
        return <OAuth2 collection={collection} item={item} request={request} save={save} updateAuth={updateAuth} />;
      }
      case 'wsse': {
        return <WsseAuth collection={collection} item={item} request={request} save={save} updateAuth={updateAuth} />;
      }
      case 'apikey': {
        return <ApiKeyAuth collection={collection} item={item} request={request} save={save} updateAuth={updateAuth} />;
      }
      case 'inherit': {
        const source = getEffectiveAuthSource();
        return (
          <>
            <div className="flex flex-row w-full gap-2">
              <div>Auth inherited from {source?.name || 'Collection'}: </div>
              <div className="inherit-mode-text">{humanizeRequestAuthMode(source?.auth?.mode)}</div>
            </div>
          </>
        );
      }
      default: {
        // Handle undefined or unrecognized auth mode - show as inherit by default
        const source = getEffectiveAuthSource();
        if (source) {
          return (
            <>
              <div className="flex flex-row w-full gap-2">
                <div>Auth inherited from {source.name}: </div>
                <div className="inherit-mode-text">{humanizeRequestAuthMode(source.auth?.mode)}</div>
              </div>
            </>
          );
        }
        return <div className="mt-2">No Auth</div>;
      }
    }
  };

  return (
    <StyledWrapper className="w-full overflow-auto">
      {getAuthView()}
    </StyledWrapper>
  );
};

export default Auth;
