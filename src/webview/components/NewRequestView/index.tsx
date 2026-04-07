import React, { useRef, useEffect, useState, useCallback, forwardRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import toast from 'react-hot-toast';
import styled from 'styled-components';
import { IconPlus, IconCaretDown } from '@tabler/icons';
import get from 'lodash/get';
import { newHttpRequest, newGrpcRequest, newWsRequest } from 'providers/ReduxStore/slices/collections/actions';
import { sanitizeName, validateName, validateNameError } from 'utils/common/regex';
import { getRequestFromCurlCommand } from 'utils/curl';
import { ipcRenderer } from 'utils/ipc';
import HttpMethodSelector from 'components/RequestPane/QueryUrl/HttpMethodSelector';
import SingleLineEditor from 'components/SingleLineEditor/index';
import Dropdown from 'components/Dropdown';
import { useTheme } from 'providers/Theme';

const StyledWrapper = styled.div`
  width: 100%;
  min-height: 100vh;
  background-color: var(--vscode-editor-background, ${(props: any) => props.theme?.bg || '#1e1e1e'});
  color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
  font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  font-size: 13px;
  padding: 32px;

  .new-request-container {
    max-width: 640px;
    margin: 0 auto;
  }

  .new-request-header {
    margin-bottom: 32px;

    h1 {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});

      svg {
        color: var(--vscode-button-background, ${(props: any) => props.theme?.button?.primary?.bg || '#0e639c'});
      }
    }

    p {
      margin: 8px 0 0 0;
      color: var(--vscode-descriptionForeground, ${(props: any) => props.theme?.textMuted || '#999999'});
      font-size: 13px;
    }
  }

  .new-request-form {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .form-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});

    .required {
      color: var(--vscode-errorForeground, #f14c4c);
      margin-left: 2px;
    }
  }

  .form-input {
    padding: 8px 12px;
    border: 1px solid var(--vscode-input-border, ${(props: any) => props.theme?.input?.border || '#454545'});
    border-radius: 4px;
    background-color: var(--vscode-input-background, ${(props: any) => props.theme?.input?.bg || '#3c3c3c'});
    color: var(--vscode-input-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
    font-size: 13px;
    font-family: inherit;
    transition: border-color 0.15s ease;

    &::placeholder {
      color: var(--vscode-input-placeholderForeground, ${(props: any) => props.theme?.textMuted || '#999999'});
    }

    &:focus {
      outline: none;
      border-color: var(--vscode-focusBorder, ${(props: any) => props.theme?.button?.primary?.bg || '#007acc'});
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    &.error {
      border-color: var(--vscode-inputValidation-errorBorder, #f14c4c);
    }
  }

  .request-type-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .request-type-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--vscode-input-border, ${(props: any) => props.theme?.input?.border || '#454545'});
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      border-color: var(--vscode-focusBorder, ${(props: any) => props.theme?.button?.primary?.bg || '#007acc'});
    }

    &.selected {
      border-color: var(--vscode-button-background, ${(props: any) => props.theme?.button?.primary?.bg || '#0e639c'});
      background-color: rgba(14, 99, 156, 0.1);
    }

    input[type="radio"] {
      accent-color: var(--vscode-button-background, ${(props: any) => props.theme?.button?.primary?.bg || '#0e639c'});
    }

    label {
      cursor: pointer;
      user-select: none;
    }
  }

  .url-input-group {
    display: flex;
    gap: 0;

    .method-selector-container {
      border: 1px solid var(--vscode-input-border, ${(props: any) => props.theme?.input?.border || '#454545'});
      border-right: none;
      background-color: var(--vscode-input-background, ${(props: any) => props.theme?.input?.bg || '#3c3c3c'});
      border-top-left-radius: 4px;
      border-bottom-left-radius: 4px;
      height: 36px;
      display: flex;
      align-items: center;
    }

    .url-input-container {
      flex: 1;
      border: 1px solid var(--vscode-input-border, ${(props: any) => props.theme?.input?.border || '#454545'});
      border-top-right-radius: 4px;
      border-bottom-right-radius: 4px;
      background-color: var(--vscode-input-background, ${(props: any) => props.theme?.input?.bg || '#3c3c3c'});
      height: 36px;
      display: flex;
      align-items: center;
      padding: 0 12px;

      &.full-width {
        border-radius: 4px;
      }
    }
  }

  .curl-textarea {
    min-height: 150px;
    resize: vertical;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  }

  .curl-type-selector {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 8px;
  }

  .form-error {
    font-size: 12px;
    color: var(--vscode-errorForeground, #f14c4c);
    margin-top: 4px;
  }

  .form-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 16px;
    padding-top: 24px;
    border-top: 1px solid var(--vscode-widget-border, ${(props: any) => props.theme?.input?.border || '#454545'});
  }

  .btn {
    padding: 8px 20px;
    border-radius: 4px;
    font-size: 13px;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s ease;
    min-width: 100px;

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  .btn-secondary {
    background-color: transparent;
    color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
    border: 1px solid var(--vscode-button-border, ${(props: any) => props.theme?.input?.border || '#454545'});

    &:hover:not(:disabled) {
      background-color: var(--vscode-list-hoverBackground, ${(props: any) => props.theme?.sidebar?.collection?.item?.hoverBg || '#2d2d2d'});
    }
  }

  .btn-primary {
    background-color: var(--vscode-button-background, ${(props: any) => props.theme?.button?.primary?.bg || '#0e639c'});
    color: var(--vscode-button-foreground, ${(props: any) => props.theme?.button?.primary?.color || '#ffffff'});
    border: none;

    &:hover:not(:disabled) {
      background-color: var(--vscode-button-hoverBackground, ${(props: any) => props.theme?.button?.primary?.hoverBg || '#1177bb'});
    }
  }
`;

interface NewRequestViewProps {
  collection: any;
  itemUid?: string | null;
}

const NewRequestView: React.FC<NewRequestViewProps> = ({ collection, itemUid }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const dispatch = useDispatch();
  const { storedTheme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [curlRequestTypeDetected, setCurlRequestTypeDetected] = useState<string | null>('http-request');

  const collectionPresets = get(
    collection,
    collection?.draft?.brunoConfig ? 'draft.brunoConfig.presets' : 'brunoConfig.presets',
    {}
  );

  const dropdownTippyRef = useRef<any>(null);
  const onDropdownCreate = (ref: any) => (dropdownTippyRef.current = ref);

  const Icon = forwardRef<HTMLDivElement>((props, ref) => {
    return (
      <div ref={ref} className="flex items-center justify-end select-none cursor-pointer" style={{ padding: '4px 8px' }}>
        {curlRequestTypeDetected === 'http-request' ? 'HTTP' : 'GraphQL'}
        <IconCaretDown className="ml-1" size={14} strokeWidth={2} />
      </div>
    );
  });

  const identifyCurlRequestType = (url: string, headers: any[], body: any) => {
    if (url?.endsWith('/graphql')) {
      setCurlRequestTypeDetected('graphql-request');
      return;
    }
    const contentType = headers?.find((h: any) => h.name?.toLowerCase() === 'content-type')?.value;
    if (contentType && contentType.includes('application/graphql')) {
      setCurlRequestTypeDetected('graphql-request');
      return;
    }
    setCurlRequestTypeDetected('http-request');
  };

  const getRequestType = (presets: any) => {
    if (!presets || !presets.requestType) return 'http-request';
    if (presets.requestType === 'http') return 'http-request';
    if (presets.requestType === 'graphql') return 'graphql-request';
    if (presets.requestType === 'grpc') return 'grpc-request';
    if (presets.requestType === 'ws') return 'ws-request';
    return 'http-request';
  };

  const formik = useFormik({
    enableReinitialize: true,
    initialValues: {
      requestName: '',
      filename: '',
      requestType: getRequestType(collectionPresets),
      requestUrl: collectionPresets.requestUrl || '',
      requestMethod: 'GET',
      curlCommand: ''
    },
    validationSchema: Yup.object({
      requestName: Yup.string()
        .trim()
        .min(1, 'must be at least 1 character')
        .max(255, 'must be 255 characters or less')
        .required('Request name is required'),
      filename: Yup.string()
        .trim()
        .min(1, 'must be at least 1 character')
        .max(255, 'must be 255 characters or less')
        .required('filename is required')
        .test('is-valid-filename', function (value) {
          if (!value) return true;
          const isValid = validateName(value);
          return isValid ? true : this.createError({ message: validateNameError(value) });
        })
        .test(
          'not-reserved',
          'The file names "collection" and "folder" are reserved',
          (value) => !['collection', 'folder'].includes(value || '')
        ),
      curlCommand: Yup.string().when('requestType', {
        is: (requestType: string) => requestType === 'from-curl',
        then: (schema) =>
          schema
            .min(1, 'cURL command is required')
            .required('cURL command is required')
            .test({
              name: 'curlCommand',
              message: 'Invalid cURL Command',
              test: (value) => getRequestFromCurlCommand(value || '') !== null
            })
      })
    }),
    onSubmit: async (values) => {
      setIsLoading(true);
      try {
        const filename = values.filename;

        if (values.requestType === 'from-curl') {
          const request = getRequestFromCurlCommand(values.curlCommand, curlRequestTypeDetected || undefined);
          if (!request) {
            toast.error('Invalid cURL command');
            setIsLoading(false);
            return;
          }

          await dispatch(
            newHttpRequest({
              requestName: values.requestName,
              filename: filename,
              requestType: curlRequestTypeDetected || 'http-request',
              requestUrl: request.url,
              requestMethod: request.method,
              collectionUid: collection.uid,
              itemUid: itemUid || null,
              headers: request.headers,
              body: request.body,
              auth: request.auth,
              settings: { encodeUrl: false }
            }) as any
          );
        } else if (values.requestType === 'grpc-request') {
          await dispatch(
            newGrpcRequest({
              requestName: values.requestName,
              filename: filename,
              requestUrl: values.requestUrl,
              collectionUid: collection.uid,
              itemUid: itemUid || null
            }) as any
          );
        } else if (values.requestType === 'ws-request') {
          await dispatch(
            newWsRequest({
              requestName: values.requestName,
              filename: filename,
              requestUrl: values.requestUrl,
              requestMethod: values.requestMethod,
              collectionUid: collection.uid,
              itemUid: itemUid || null
            }) as any
          );
        } else {
          await dispatch(
            newHttpRequest({
              requestName: values.requestName,
              filename: filename,
              requestType: values.requestType,
              requestUrl: values.requestUrl,
              requestMethod: values.requestMethod,
              collectionUid: collection.uid,
              itemUid: itemUid || null
            }) as any
          );
        }

        toast.success('Request created!');
        ipcRenderer.send('new-request:close');
      } catch (e: any) {
        toast.error(e?.message || 'Failed to create request');
      } finally {
        setIsLoading(false);
      }
    }
  });

  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      const clipboardData = event.clipboardData;
      const pastedData = clipboardData.getData('Text');

      if (/^\s*curl\s/i.test(pastedData)) {
        formik.setFieldValue('requestType', 'from-curl');
        formik.setFieldValue('curlCommand', pastedData);

        const request = getRequestFromCurlCommand(pastedData);
        if (request) {
          identifyCurlRequestType(request.url, request.headers, request.body);
        }
        event.preventDefault();
      }
    },
    [formik]
  );

  const handleCurlCommandChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    formik.handleChange(event);
    const curlCommand = event.target.value;
    const request = getRequestFromCurlCommand(curlCommand);
    if (request) {
      identifyCurlRequestType(request.url, request.headers, request.body);
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    formik.handleChange(e);
    formik.setFieldValue('filename', sanitizeName(e.target.value));
  };

  const handleCancel = () => {
    ipcRenderer.send('new-request:close');
  };

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  return (
    <StyledWrapper>
      <div className="new-request-container">
        <div className="new-request-header">
          <h1>
            <IconPlus size={22} strokeWidth={1.5} />
            New Request
          </h1>
          <p>
            Create a new API request in {collection?.name || 'collection'}.
          </p>
        </div>

        <form onSubmit={formik.handleSubmit} className="new-request-form">
          <div className="form-group">
            <label className="form-label">Request Type</label>
            <div className="request-type-grid">
              <div
                className={`request-type-option ${formik.values.requestType === 'http-request' ? 'selected' : ''}`}
                onClick={() => formik.setFieldValue('requestType', 'http-request')}
              >
                <input
                  type="radio"
                  name="requestType"
                  value="http-request"
                  checked={formik.values.requestType === 'http-request'}
                  onChange={formik.handleChange}
                />
                <label>HTTP</label>
              </div>
              <div
                className={`request-type-option ${formik.values.requestType === 'graphql-request' ? 'selected' : ''}`}
                onClick={() => formik.setFieldValue('requestType', 'graphql-request')}
              >
                <input
                  type="radio"
                  name="requestType"
                  value="graphql-request"
                  checked={formik.values.requestType === 'graphql-request'}
                  onChange={formik.handleChange}
                />
                <label>GraphQL</label>
              </div>
              <div
                className={`request-type-option ${formik.values.requestType === 'ws-request' ? 'selected' : ''}`}
                onClick={() => formik.setFieldValue('requestType', 'ws-request')}
              >
                <input
                  type="radio"
                  name="requestType"
                  value="ws-request"
                  checked={formik.values.requestType === 'ws-request'}
                  onChange={formik.handleChange}
                />
                <label>WebSocket</label>
              </div>
              <div
                className={`request-type-option ${formik.values.requestType === 'grpc-request' ? 'selected' : ''}`}
                onClick={() => formik.setFieldValue('requestType', 'grpc-request')}
              >
                <input
                  type="radio"
                  name="requestType"
                  value="grpc-request"
                  checked={formik.values.requestType === 'grpc-request'}
                  onChange={formik.handleChange}
                />
                <label>gRPC</label>
              </div>
              <div
                className={`request-type-option ${formik.values.requestType === 'from-curl' ? 'selected' : ''}`}
                onClick={() => formik.setFieldValue('requestType', 'from-curl')}
              >
                <input
                  type="radio"
                  name="requestType"
                  value="from-curl"
                  checked={formik.values.requestType === 'from-curl'}
                  onChange={formik.handleChange}
                />
                <label>From cURL</label>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="requestName" className="form-label">
              Request Name <span className="required">*</span>
            </label>
            <input
              ref={inputRef}
              id="requestName"
              type="text"
              name="requestName"
              className={`form-input ${formik.touched.requestName && formik.errors.requestName ? 'error' : ''}`}
              placeholder="My Request"
              value={formik.values.requestName}
              onChange={handleNameChange}
              onBlur={formik.handleBlur}
              disabled={isLoading}
              autoComplete="off"
            />
            {formik.touched.requestName && formik.errors.requestName && (
              <div className="form-error">{formik.errors.requestName}</div>
            )}
          </div>

          {formik.values.requestType !== 'from-curl' ? (
            <div className="form-group">
              <label className="form-label">URL</label>
              <div className="url-input-group">
                {formik.values.requestType !== 'ws-request' && formik.values.requestType !== 'grpc-request' && (
                  <div className="method-selector-container">
                    <HttpMethodSelector
                      method={formik.values.requestMethod}
                      onMethodSelect={(val: string) => formik.setFieldValue('requestMethod', val)}
                      showCaret
                    />
                  </div>
                )}
                <div className={`url-input-container ${(formik.values.requestType === 'ws-request' || formik.values.requestType === 'grpc-request') ? 'full-width' : ''}`}>
                  <SingleLineEditor
                    onPaste={handlePaste}
                    placeholder={
                      formik.values.requestType === 'ws-request'
                        ? 'wss://example.com/socket'
                        : formik.values.requestType === 'grpc-request'
                          ? 'grpc://localhost:50051'
                          : 'https://api.example.com/endpoint'
                    }
                    value={formik.values.requestUrl || ''}
                    theme={storedTheme}
                    onChange={(value: string) => formik.setFieldValue('requestUrl', value)}
                    collection={collection}
                    variablesAutocomplete={true}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="form-group">
              <div className="curl-type-selector">
                <Dropdown onCreate={onDropdownCreate} icon={<Icon />} placement="bottom-end">
                  <div
                    className="dropdown-item"
                    onClick={() => {
                      dropdownTippyRef.current?.hide();
                      setCurlRequestTypeDetected('http-request');
                    }}
                  >
                    HTTP
                  </div>
                  <div
                    className="dropdown-item"
                    onClick={() => {
                      dropdownTippyRef.current?.hide();
                      setCurlRequestTypeDetected('graphql-request');
                    }}
                  >
                    GraphQL
                  </div>
                </Dropdown>
              </div>
              <label htmlFor="curlCommand" className="form-label">
                cURL Command <span className="required">*</span>
              </label>
              <textarea
                id="curlCommand"
                name="curlCommand"
                className={`form-input curl-textarea ${formik.touched.curlCommand && formik.errors.curlCommand ? 'error' : ''}`}
                placeholder="curl -X GET https://api.example.com/endpoint"
                value={formik.values.curlCommand}
                onChange={handleCurlCommandChange}
                onBlur={formik.handleBlur}
                disabled={isLoading}
              />
              {formik.touched.curlCommand && formik.errors.curlCommand && (
                <div className="form-error">{formik.errors.curlCommand}</div>
              )}
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCancel}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading || !formik.values.requestName.trim()}
            >
              {isLoading ? 'Creating...' : 'Create Request'}
            </button>
          </div>
        </form>
      </div>
    </StyledWrapper>
  );
};

export default NewRequestView;
