import React, { useRef, useMemo, useCallback } from 'react';
import get from 'lodash/get';
import { useDispatch } from 'react-redux';
import {
  requestUrlChanged,
  updateRequestMethod,
  setRequestHeaders,
  updateRequestBodyMode,
  updateRequestBody,
  updateRequestGraphqlQuery,
  updateRequestGraphqlVariables,
  updateRequestAuthMode,
  updateAuth
} from 'providers/ReduxStore/slices/collections';
import { saveRequest, cancelRequest } from 'providers/ReduxStore/slices/collections/actions';
import { getRequestFromCurlCommand } from 'utils/curl';
import HttpMethodSelector from './HttpMethodSelector';
import { useTheme } from 'providers/Theme';
import { IconDeviceFloppy, IconArrowRight, IconSquareRoundedX } from '@tabler/icons';
import SingleLineEditor from 'components/SingleLineEditor';
import { isMacOS } from 'utils/common/platform';
import { hasRequestChanges } from 'utils/collections';
import StyledWrapper from './StyledWrapper';
import toast from 'react-hot-toast';

interface QueryUrlProps {
  item?: React.ReactNode;
  collection?: React.ReactNode;
  handleRun?: (...args: unknown[]) => void;
}

const QueryUrl = ({
  item,
  collection,
  handleRun
}: any) => {
  const { theme, storedTheme } = useTheme();
  const dispatch = useDispatch();
  const method = item.draft ? get(item, 'draft.request.method') : get(item, 'request.method');
  const url = item.draft ? get(item, 'draft.request.url', '') : get(item, 'request.url', '');
  const isMac = isMacOS();
  const saveShortcut = isMac ? 'Cmd + S' : 'Ctrl + S';
  const editorRef = useRef(null);
  const isLoading = ['queued', 'sending'].includes(item.requestState);

  const hasChanges = useMemo(() => hasRequestChanges(item), [item]);

  const onSave = () => {
    dispatch(saveRequest(item.uid, collection.uid));
  };

  const onUrlChange = (value: any) => {
    if (!editorRef.current?.editor) return;
    const editor = editorRef.current.editor;
    const cursor = editor.getCursor();

    const finalUrl = value?.trim() ?? value;

    dispatch(
      requestUrlChanged({
        itemUid: item.uid,
        collectionUid: collection.uid,
        url: finalUrl
      })
    );

    if (finalUrl !== value) {
      setTimeout(() => {
        if (editor) {
          editor.setCursor(cursor);
        }
      }, 0);
    }
  };

  const onMethodSelect = (verb: any) => {
    dispatch(
      updateRequestMethod({
        method: verb,
        itemUid: item.uid,
        collectionUid: collection.uid
      })
    );
  };

  const handleGraphqlPaste = useCallback((event: any) => {
    if (item.type !== 'graphql-request') {
      return;
    }

    const clipboardData = event.clipboardData || (window as any).clipboardData;
    const pastedData = clipboardData.getData('Text');

    const curlCommandRegex = /^\s*curl\s/i;
    if (!curlCommandRegex.test(pastedData)) {
      // Not a curl command, allow normal paste behavior
      return;
    }
    event.preventDefault();
    try {
      const request = getRequestFromCurlCommand(pastedData, 'graphql-request');
      if (!request || !request.url) {
        toast.error('Invalid cURL command');
        return;
      }
      dispatch(requestUrlChanged({
        itemUid: item.uid,
        collectionUid: collection.uid,
        url: request.url
      }));

      dispatch(updateRequestMethod({
        method: request.method.toUpperCase(), // Convert to uppercase
        itemUid: item.uid,
        collectionUid: collection.uid
      }));

      if (request.headers && request.headers.length > 0) {
        dispatch(setRequestHeaders({
          collectionUid: collection.uid,
          itemUid: item.uid,
          headers: request.headers
        }));
      }

      if (request.body) {
        const bodyMode = request.body.mode;
        if (bodyMode === 'graphql') {
          const graphqlBody = request.body.graphql as { query?: string; variables?: string };
          dispatch(updateRequestGraphqlQuery({
            itemUid: item.uid,
            collectionUid: collection.uid,
            query: graphqlBody.query || ''
          }));
          let variables: string = graphqlBody.variables || '';
          try {
            variables = JSON.parse(variables);
          } catch (error) {
            // Keep variables as-is if JSON parsing fails
          }
          dispatch(updateRequestGraphqlVariables({
            itemUid: item.uid,
            collectionUid: collection.uid,
            variables: variables
          }));
        }

        toast.success('GraphQL query imported successfully');
      }
    } catch (error) {
      console.error('Error parsing cURL command:', error);
      toast.error('Failed to parse GraphQL query');
    }
  }, [dispatch, item.uid, collection.uid]);

  const handleHttpPaste = useCallback((event: any) => {
    // Only enable curl paste detection for HTTP requests
    if (item.type !== 'http-request') {
      return;
    }

    const clipboardData = event.clipboardData || (window as any).clipboardData;
    const pastedData = clipboardData.getData('Text');

    // Check if pasted data looks like a cURL command
    const curlCommandRegex = /^\s*curl\s/i;
    if (!curlCommandRegex.test(pastedData)) {
      // Not a curl command, allow normal paste behavior
      return;
    }

    event.preventDefault();

    try {
      const request = getRequestFromCurlCommand(pastedData);
      if (!request || !request.url) {
        toast.error('Invalid cURL command');
        return;
      }

      dispatch(
        requestUrlChanged({
          itemUid: item.uid,
          collectionUid: collection.uid,
          url: request.url
        })
      );

      if (request.method) {
        dispatch(
          updateRequestMethod({
            method: request.method.toUpperCase(), // Convert to uppercase
            itemUid: item.uid,
            collectionUid: collection.uid
          })
        );
      }

      if (request.headers && request.headers.length > 0) {
        dispatch(
          setRequestHeaders({
            collectionUid: collection.uid,
            itemUid: item.uid,
            headers: request.headers
          })
        );
      }

      if (request.body) {
        const bodyMode = request.body.mode;

        dispatch(
          updateRequestBodyMode({
            itemUid: item.uid,
            collectionUid: collection.uid,
            mode: bodyMode
          })
        );

        if (bodyMode === 'json' && request.body.json) {
          dispatch(
            updateRequestBody({
              itemUid: item.uid,
              collectionUid: collection.uid,
              content: request.body.json
            })
          );
        } else if (bodyMode === 'text' && request.body.text) {
          dispatch(
            updateRequestBody({
              itemUid: item.uid,
              collectionUid: collection.uid,
              content: request.body.text
            })
          );
        } else if (bodyMode === 'xml' && request.body.xml) {
          dispatch(
            updateRequestBody({
              itemUid: item.uid,
              collectionUid: collection.uid,
              content: request.body.xml
            })
          );
        } else if (bodyMode === 'graphql' && request.body.graphql) {
          const graphqlBody = request.body.graphql as { query?: string; variables?: string };
          if (graphqlBody.query) {
            dispatch(
              updateRequestGraphqlQuery({
                itemUid: item.uid,
                collectionUid: collection.uid,
                query: graphqlBody.query
              })
            );
          }
          if (graphqlBody.variables) {
            dispatch(
              updateRequestGraphqlVariables({
                itemUid: item.uid,
                collectionUid: collection.uid,
                variables: graphqlBody.variables
              })
            );
          }
        } else if (bodyMode === 'formUrlEncoded' && request.body.formUrlEncoded) {
          // For formUrlEncoded, we need to set each param individually
          // This is a limitation - we'd need to clear existing params first
          // For now, we'll set the body mode and the user can manually adjust
          // TODO: Implement proper formUrlEncoded param setting
        } else if (bodyMode === 'multipartForm' && request.body.multipartForm) {
          // For multipartForm, similar limitation
          // TODO: Implement proper multipartForm param setting
        }
      }

      if (request.auth) {
        const authMode = request.auth.mode;
        if (authMode) {
          dispatch(
            updateRequestAuthMode({
              itemUid: item.uid,
              collectionUid: collection.uid,
              mode: authMode
            })
          );

          if (request.auth.basic) {
            dispatch(
              updateAuth({
                mode: 'basic',
                collectionUid: collection.uid,
                itemUid: item.uid,
                content: request.auth.basic
              })
            );
          } else if (request.auth.bearer) {
            dispatch(
              updateAuth({
                mode: 'bearer',
                collectionUid: collection.uid,
                itemUid: item.uid,
                content: request.auth.bearer
              })
            );
          } else if (request.auth.digest) {
            dispatch(
              updateAuth({
                mode: 'digest',
                collectionUid: collection.uid,
                itemUid: item.uid,
                content: request.auth.digest
              })
            );
          } else if (request.auth.ntlm) {
            dispatch(
              updateAuth({
                mode: 'ntlm',
                collectionUid: collection.uid,
                itemUid: item.uid,
                content: request.auth.ntlm
              })
            );
          } else if (request.auth.awsv4) {
            dispatch(
              updateAuth({
                mode: 'awsv4',
                collectionUid: collection.uid,
                itemUid: item.uid,
                content: request.auth.awsv4
              })
            );
          } else if (request.auth.apikey) {
            dispatch(
              updateAuth({
                mode: 'apikey',
                collectionUid: collection.uid,
                itemUid: item.uid,
                content: request.auth.apikey
              })
            );
          }
        }
      }

      toast.success('cURL command imported successfully');
    } catch (error) {
      console.error('Error parsing cURL command:', error);
      toast.error('Failed to parse cURL command');
    }
  },
  [dispatch, item.uid, item.type, collection.uid]
  );
  const handleCancelRequest = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    dispatch(cancelRequest(item.cancelTokenUid, item, collection));
  };
  return (
    <StyledWrapper className="flex items-center w-full">
      <div className="flex items-center h-full min-w-fit">
        <HttpMethodSelector method={method} onMethodSelect={onMethodSelect} />
      </div>
      <div
        id="request-url"
        className="h-full w-full flex flex-row input-container"
      >
        <SingleLineEditor
          ref={editorRef}
          value={url}
          placeholder="Enter URL or paste a cURL request"
          onSave={onSave}
          theme={storedTheme}
          onChange={(newValue: any) => onUrlChange(newValue)}
          onRun={handleRun}
          onPaste={item.type === 'http-request' ? handleHttpPaste : item.type === 'graphql-request' ? handleGraphqlPaste : undefined}
          collection={collection}
          highlightPathParams={true}
          item={item}
          showNewlineArrow={true}
        />
        <div className="flex items-center h-full mr-2 cursor-pointer" id="send-request" onClick={handleRun}>
          <div
            title="Save Request"
            className="infotip mr-3"
            onClick={(e) => {
              e.stopPropagation();
              if (!hasChanges) return;
              onSave();
            }}
          >
            <IconDeviceFloppy
              color={hasChanges ? theme.draftColor : theme.requestTabs.icon.color}
              strokeWidth={1.5}
              size={20}
              className={`${hasChanges ? 'cursor-pointer' : 'cursor-default'}`}
            />
            <span className="infotiptext text-xs">
              Save <span className="shortcut">({saveShortcut})</span>
            </span>
          </div>
          {isLoading || item.response?.stream?.running ? (
            <IconSquareRoundedX
              color={theme.requestTabPanel.url.iconDanger}
              strokeWidth={1.5}
              size={20}
              data-testid="cancel-request-icon"
              onClick={handleCancelRequest}
            />
          ) : (
            <IconArrowRight
              color={theme.requestTabPanel.url.icon}
              strokeWidth={1.5}
              size={20}
              data-testid="send-arrow-icon"
            />
          )}
        </div>
      </div>
    </StyledWrapper>
  );
};

export default QueryUrl;
