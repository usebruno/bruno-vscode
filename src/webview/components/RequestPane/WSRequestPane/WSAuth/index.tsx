import React, { useEffect, useMemo } from 'react';
import get from 'lodash/get';
import { useDispatch } from 'react-redux';
import WSAuthMode from './WSAuthMode';
import BearerAuth from '../../Auth/BearerAuth';
import BasicAuth from '../../Auth/BasicAuth';
import ApiKeyAuth from '../../Auth/ApiKeyAuth';
import StyledWrapper from './StyledWrapper';
import { humanizeRequestAuthMode } from 'utils/collections';
import { getEffectiveAuthSource } from 'utils/auth';
import { AUTH_MODES_WS } from 'utils/common/constants';
import { updateRequestAuthMode, updateAuth } from 'providers/ReduxStore/slices/collections';
import { saveRequest } from 'providers/ReduxStore/slices/collections/actions';

const WSAuth = ({
  item,
  collection
}: any) => {
  const dispatch = useDispatch();
  const authMode = item.draft ? get(item, 'draft.request.auth.mode') : get(item, 'request.auth.mode');

  const request = item.draft
    ? get(item, 'draft.request', {})
    : get(item, 'request', {});

  const save = () => {
    return saveRequest(item.uid, collection.uid);
  };

  const inheritedSource = useMemo(
    () => getEffectiveAuthSource(collection, item),
    [authMode, item, collection]
  );

  useEffect(() => {
    if (authMode && !AUTH_MODES_WS.includes(authMode)) {
      dispatch(updateRequestAuthMode({
        itemUid: item.uid,
        collectionUid: collection.uid,
        mode: 'none'
      }));
    }
  }, [authMode, collection.uid, dispatch, item.uid]);

  const getAuthView = () => {
    switch (authMode) {
      case 'basic': {
        return <BasicAuth collection={collection} item={item} updateAuth={updateAuth} request={request} save={save} />;
      }
      case 'bearer': {
        return <BearerAuth collection={collection} item={item} updateAuth={updateAuth} request={request} save={save} />;
      }
      case 'apikey': {
        return <ApiKeyAuth collection={collection} item={item} updateAuth={updateAuth} request={request} save={save} />;
      }
      case 'oauth2': {
        return (
          <>
            <div className="flex flex-row w-full mt-2 gap-2">
              <div>
                OAuth 2 not <strong>yet</strong> supported by WebSockets. Using no auth instead.
              </div>
            </div>
          </>
        );
      }
      case 'inherit': {
        if (inheritedSource && AUTH_MODES_WS.includes(inheritedSource.auth?.mode)) {
          return (
            <>
              <div className="flex flex-row w-full mt-2 gap-2">
                <div> Auth inherited from {inheritedSource.name}: </div>
                <div className="inherit-mode-text">{humanizeRequestAuthMode(inheritedSource.auth?.mode)}</div>
              </div>
            </>
          );
        } else {
          return (
            <>
              <div className="flex flex-row w-full mt-2 gap-2">
                <div>Inherited auth not supported by WebSockets. Using no auth instead.</div>
              </div>
            </>
          );
        }
      }
      default: {
        // Handle undefined or unrecognized auth mode - show as inherit by default
        if (inheritedSource && AUTH_MODES_WS.includes(inheritedSource.auth?.mode)) {
          return (
            <>
              <div className="flex flex-row w-full mt-2 gap-2">
                <div>Auth inherited from {inheritedSource.name}: </div>
                <div className="inherit-mode-text">{humanizeRequestAuthMode(inheritedSource.auth?.mode)}</div>
              </div>
            </>
          );
        }
        return null;
      }
    }
  };

  return (
    <StyledWrapper className="w-full overflow-y-scroll">
      <div className="flex flex-grow justify-start items-center">
        <WSAuthMode item={item} collection={collection} />
      </div>
      {getAuthView()}
    </StyledWrapper>
  );
};

export default WSAuth;
