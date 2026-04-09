import { useMemo, useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { cloneDeep, find } from 'lodash';
import { IconX } from '@tabler/icons';
import { interpolate } from '@usebruno/common';
import { fetchOauth2Credentials, clearOauth2Cache, refreshOauth2Credentials, cancelOauth2AuthorizationRequest, isOauth2AuthorizationRequestInProgress } from 'providers/ReduxStore/slices/collections/actions';
import { getAllVariables } from 'utils/collections/index';
import Button from 'ui/Button';
import type { AppCollection, AppItem, OAuth2CredentialEntry } from '@bruno-types';

interface Oauth2ActionButtonsProps {
  item: AppItem;
  request: Record<string, unknown>;
  collection: AppCollection;
  url: string;
  credentialsId: string;
}

const Oauth2ActionButtons = ({
  item,
  request,
  collection,
  url: accessTokenUrl,
  credentialsId
}: Oauth2ActionButtonsProps) => {
  const collectionUid = collection.uid;

  const dispatch = useDispatch();
  const [fetchingToken, toggleFetchingToken] = useState(false);
  const [refreshingToken, toggleRefreshingToken] = useState(false);
  const [fetchingAuthorizationCode, toggleFetchingAuthorizationCode] = useState(false);

  useEffect(() => {
    if (fetchingToken) {
      const getRequestStatus = async () => {
        try {
          const inProgress = await (dispatch(isOauth2AuthorizationRequestInProgress()) as unknown as Promise<boolean>);
          toggleFetchingAuthorizationCode(inProgress);
        } catch (err) {
          console.error('Error checking pending authorization:', err);
        }
      };
      getRequestStatus();
    }
  }, [fetchingToken, dispatch]);

  const allVariables = useMemo(() => getAllVariables(collection, item), [collection, item]);

  const interpolatedAccessTokenUrl = useMemo(() => {
    return (interpolate as (str: string, vars: Record<string, unknown>) => string)(accessTokenUrl, allVariables);
  }, [accessTokenUrl, allVariables]);

  const credentialsData = find(
    collection?.oauth2Credentials as OAuth2CredentialEntry[] | undefined,
    (creds) => creds?.url === interpolatedAccessTokenUrl && creds?.collectionUid === collectionUid && creds?.credentialsId === credentialsId
  );
  const creds = (credentialsData?.credentials || {}) as Record<string, unknown>;

  const handleFetchOauth2Credentials = async () => {
    const requestCopy = cloneDeep(request) as Record<string, unknown>;
    const auth = requestCopy.auth as { oauth2?: unknown } | undefined;
    requestCopy.oauth2 = auth?.oauth2;
    requestCopy.headers = {};
    // Attach all resolved variables so the backend can interpolate OAuth2 config fields
    requestCopy.mergedVariables = allVariables;
    toggleFetchingToken(true);
    try {
      const result = await (dispatch(fetchOauth2Credentials({
        itemUid: item.uid,
        request: requestCopy,
        collection
      })) as unknown as Promise<Record<string, unknown>>);

      if (!result || !result.access_token) {
        const errorMessage = (result?.error as string) || 'No access token received from authorization server';
        console.error(errorMessage);
        toast.error(errorMessage);
        return;
      }

      toast.success('Token fetched successfully!');
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error('could not fetch the token!');
      console.error(error);
      // Don't show error toast for user cancellation
      if (err?.message && err.message.includes('cancelled by user')) {
        return;
      }
      toast.error(err?.message || 'An error occurred while fetching token!');
    } finally {
      toggleFetchingToken(false);
      toggleFetchingAuthorizationCode(false);
    }
  };

  const handleRefreshAccessToken = async () => {
    const requestCopy = cloneDeep(request) as Record<string, unknown>;
    const auth = requestCopy.auth as { oauth2?: unknown } | undefined;
    requestCopy.oauth2 = auth?.oauth2;
    requestCopy.headers = {};
    // Attach all resolved variables so the backend can interpolate OAuth2 config fields
    requestCopy.mergedVariables = allVariables;
    toggleRefreshingToken(true);
    try {
      const result = await (dispatch(refreshOauth2Credentials({
        itemUid: item.uid,
        request: requestCopy,
        collection
      })) as unknown as Promise<Record<string, unknown>>);

      toggleRefreshingToken(false);

      if (!result || !result.access_token) {
        const errorMessage = (result?.error as string) || 'No access token received from authorization server';
        console.error(errorMessage);
        toast.error(errorMessage);
        return;
      }

      toast.success('Token refreshed successfully!');
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error(error);
      toggleRefreshingToken(false);
      toast.error(err?.message || 'An error occurred while refreshing token!');
    }
  };

  const handleClearCache = () => {
    (dispatch(clearOauth2Cache({ collectionUid, url: interpolatedAccessTokenUrl, credentialsId })) as unknown as Promise<void>)
      .then(() => {
        toast.success('Cleared cache successfully');
      })
      .catch((err: { message: string }) => {
        toast.error(err.message);
      });
  };

  const handleCancelAuthorization = async () => {
    try {
      const result = await (dispatch(cancelOauth2AuthorizationRequest()) as unknown as Promise<{ success?: boolean; cancelled?: boolean }>);
      if (result.success && result.cancelled) {
        toast.error('Authorization cancelled');
        toggleFetchingToken(false);
        toggleFetchingAuthorizationCode(false);
      }
    } catch (err) {
      console.error('Error cancelling authorization:', err);
      toast.error('Failed to cancel authorization');
    }
  };

  return (
    <div className="flex flex-row gap-2 mt-4">
      <Button
        size="sm"
        color="secondary"
        onClick={handleFetchOauth2Credentials}
        disabled={fetchingToken || refreshingToken}
        loading={fetchingToken}
        data-testid="oauth2-get-token-btn"
      >
        Get Access Token
      </Button>
      {creds?.refresh_token
        ? (
            <Button
              size="sm"
              color="secondary"
              onClick={handleRefreshAccessToken}
              disabled={fetchingToken || refreshingToken}
              loading={refreshingToken}
              data-testid="oauth2-refresh-token-btn"
            >
              Refresh Token
            </Button>
          )
        : null}
      {fetchingAuthorizationCode
        ? (
            <Button
              size="sm"
              color="secondary"
              onClick={handleCancelAuthorization}
              icon={<IconX size={16} />}
              iconPosition="left"
              data-testid="oauth2-cancel-auth-btn"
            >
              Cancel Authorization
            </Button>
          ) : null}
      <Button
        size="sm"
        color="secondary"
        variant="ghost"
        onClick={handleClearCache}
        data-testid="oauth2-clear-cache-btn"
      >
        Clear Cache
      </Button>
    </div>
  );
};

export default Oauth2ActionButtons;
