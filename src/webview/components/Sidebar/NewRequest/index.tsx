import React, { useRef, useEffect, useCallback, forwardRef, useState } from 'react';
import get from 'lodash/get';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import toast from 'react-hot-toast';
import { useDispatch, useSelector } from 'react-redux';
import { newHttpRequest, newGrpcRequest, newWsRequest } from 'providers/ReduxStore/slices/collections/actions';
import HttpMethodSelector from 'components/RequestPane/QueryUrl/HttpMethodSelector';
import { getRequestFromCurlCommand } from 'utils/curl';
import { IconCaretDown } from '@tabler/icons';
import { sanitizeName, validateName, validateNameError } from 'utils/common/regex';
import Dropdown from 'components/Dropdown';
import Portal from 'components/Portal';
import Modal from 'components/Modal';
import StyledWrapper from './StyledWrapper';
import SingleLineEditor from 'components/SingleLineEditor/index';
import { useTheme } from 'styled-components';
import Button from 'ui/Button';

interface NewRequestProps {
  collectionUid: string;
  itemUid?: string | null;
  onClose: () => void;
}

const NewRequest: React.FC<NewRequestProps> = ({ collectionUid, itemUid, onClose }) => {
  const dispatch = useDispatch();
  const inputRef = useRef<HTMLInputElement>(null);
  const storedTheme = useTheme();

  const collection = useSelector((state: any) =>
    state.collections.collections?.find((c: any) => c.uid === collectionUid)
  );
  const collectionPresets = get(
    collection,
    collection?.draft?.brunoConfig ? 'draft.brunoConfig.presets' : 'brunoConfig.presets',
    {}
  );
  const [curlRequestTypeDetected, setCurlRequestTypeDetected] = useState<string | null>(null);

  const dropdownTippyRef = useRef<any>(null);
  const onDropdownCreate = (ref: any) => (dropdownTippyRef.current = ref);

  const Icon = forwardRef<HTMLDivElement>((props, ref) => {
    return (
      <div ref={ref} className="flex items-center justify-end auth-type-label select-none">
        {curlRequestTypeDetected === 'http-request' ? 'HTTP' : 'GraphQL'}
        <IconCaretDown className="caret ml-1 mr-1" size={14} strokeWidth={2} />
      </div>
    );
  });

  const identifyCurlRequestType = (url: string, headers: any[], body: any) => {
    if (url.endsWith('/graphql')) {
      setCurlRequestTypeDetected('graphql-request');
      return;
    }

    const contentType = headers?.find((h: any) => h.name.toLowerCase() === 'content-type')?.value;
    if (contentType && contentType.includes('application/graphql')) {
      setCurlRequestTypeDetected('graphql-request');
      return;
    }

    setCurlRequestTypeDetected('http-request');
  };

  const curlRequestTypeChange = (type: string) => {
    setCurlRequestTypeDetected(type);
  };

  const getRequestType = (presets: any) => {
    if (!presets || !presets.requestType) {
      return 'http-request';
    }

    if (presets.requestType === 'http') {
      return 'http-request';
    }

    if (presets.requestType === 'graphql') {
      return 'graphql-request';
    }

    if (presets.requestType === 'grpc') {
      return 'grpc-request';
    }

    if (presets.requestType === 'ws') {
      return 'ws-request';
    }

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
        .required('name is required'),
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
          `The file names "collection" and "folder" are reserved in bruno`,
          (value) => !['collection', 'folder'].includes(value || '')
        ),
      curlCommand: Yup.string().when('requestType', {
        is: (requestType: string) => requestType === 'from-curl',
        then: (schema) =>
          schema
            .min(1, 'must be at least 1 character')
            .required('curlCommand is required')
            .test({
              name: 'curlCommand',
              message: `Invalid cURL Command`,
              test: (value) => getRequestFromCurlCommand(value || '') !== null
            })
      })
    }),
    onSubmit: (values) => {
      const filename = values.filename;
      const isGrpcRequest = values.requestType === 'grpc-request';
      const isWsRequest = values.requestType === 'ws-request';

      if (isGrpcRequest) {
        dispatch(
          newGrpcRequest({
            requestName: values.requestName,
            filename: filename,
            requestUrl: values.requestUrl,
            collectionUid: collectionUid,
            itemUid: itemUid || null
          }) as any
        )
          .then(() => {
            toast.success('New request created!');
            onClose();
          })
          .catch((err: Error) => toast.error(err ? err.message : 'An error occurred while adding the request'));
      } else if (isWsRequest) {
        dispatch(
          newWsRequest({
            requestName: values.requestName,
            requestMethod: values.requestMethod,
            filename: filename,
            requestUrl: values.requestUrl,
            collectionUid: collectionUid,
            itemUid: itemUid || null
          }) as any
        )
          .then(() => {
            toast.success('New request created!');
            onClose();
          })
          .catch((err: Error) => toast.error(err ? err.message : 'An error occurred while adding the request'));
      } else if (values.requestType === 'from-curl') {
        const request = getRequestFromCurlCommand(values.curlCommand, curlRequestTypeDetected || undefined);
        if (!request) {
          toast.error('Invalid cURL command');
          return;
        }
        const settings = { encodeUrl: false };

        dispatch(
          newHttpRequest({
            requestName: values.requestName,
            filename: filename,
            requestType: curlRequestTypeDetected || 'http-request',
            requestUrl: request.url,
            requestMethod: request.method,
            collectionUid: collectionUid,
            itemUid: itemUid || null,
            headers: request.headers,
            body: request.body,
            auth: request.auth,
            settings: settings
          }) as any
        )
          .then(() => {
            toast.success('New request created!');
            onClose();
          })
          .catch((err: Error) => toast.error(err ? err.message : 'An error occurred while adding the request'));
      } else {
        dispatch(
          newHttpRequest({
            requestName: values.requestName,
            filename: filename,
            requestType: values.requestType,
            requestUrl: values.requestUrl,
            requestMethod: values.requestMethod,
            collectionUid: collectionUid,
            itemUid: itemUid || null
          }) as any
        )
          .then(() => {
            toast.success('New request created!');
            onClose();
          })
          .catch((err: Error) => toast.error(err ? err.message : 'An error occurred while adding the request'));
      }
    }
  });

  useEffect(() => {
    if (inputRef && inputRef.current) {
      inputRef.current.focus();
    }
  }, [inputRef]);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      const clipboardData = event.clipboardData;
      const pastedData = clipboardData.getData('Text');

      const curlCommandRegex = /^\s*curl\s/i;
      if (curlCommandRegex.test(pastedData)) {
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

    if (event.target.name === 'curlCommand') {
      const curlCommand = event.target.value;
      const request = getRequestFromCurlCommand(curlCommand);
      if (request) {
        identifyCurlRequestType(request.url, request.headers, request.body);
      }
    }
  };

  return (
    <Portal>
      <StyledWrapper>
        <Modal size="md" title="New Request" hideFooter handleCancel={onClose}>
          <form
            className="bruno-form"
            onSubmit={formik.handleSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                formik.handleSubmit();
              }
            }}
          >
            <div>
              <label htmlFor="requestName" className="block font-medium">
                Type
              </label>

              <div className="mt-2 grid grid-cols-3 gap-2">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      id="http-request"
                      name="requestType"
                      value="http-request"
                      checked={formik.values.requestType === 'http-request'}
                      onChange={formik.handleChange}
                    />
                    <label htmlFor="http-request" className="ml-1 cursor-pointer select-none">
                      HTTP
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      id="graphql-request"
                      name="requestType"
                      value="graphql-request"
                      checked={formik.values.requestType === 'graphql-request'}
                      onChange={formik.handleChange}
                    />
                    <label htmlFor="graphql-request" className="ml-1 cursor-pointer select-none">
                      GraphQL
                    </label>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      id="grpc-request"
                      name="requestType"
                      value="grpc-request"
                      checked={formik.values.requestType === 'grpc-request'}
                      onChange={formik.handleChange}
                    />
                    <label htmlFor="grpc-request" className="ml-1 cursor-pointer select-none">
                      gRPC
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      id="ws-request"
                      name="requestType"
                      value="ws-request"
                      checked={formik.values.requestType === 'ws-request'}
                      onChange={formik.handleChange}
                    />
                    <label htmlFor="ws-request" className="ml-1 cursor-pointer select-none">
                      WebSocket
                    </label>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      id="from-curl"
                      name="requestType"
                      value="from-curl"
                      checked={formik.values.requestType === 'from-curl'}
                      onChange={formik.handleChange}
                    />
                    <label htmlFor="from-curl" className="ml-1 cursor-pointer select-none">
                      From cURL
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <label htmlFor="requestName" className="block font-medium">
                Request Name
              </label>
              <input
                id="request-name"
                type="text"
                name="requestName"
                placeholder="Request Name"
                ref={inputRef}
                className="block textbox mt-2 w-full"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                onChange={(e) => {
                  formik.setFieldValue('requestName', e.target.value);
                  formik.setFieldValue('filename', sanitizeName(e.target.value));
                }}
                value={formik.values.requestName || ''}
              />
              {formik.touched.requestName && formik.errors.requestName ? (
                <div className="text-red-500">{formik.errors.requestName}</div>
              ) : null}
            </div>
            {formik.values.requestType !== 'from-curl' ? (
              <>
                <div className="mt-4">
                  <label htmlFor="request-url" className="block font-medium">
                    URL
                  </label>
                  <div className="flex items-center mt-2 ">
                    {!['grpc-request', 'ws-request'].includes(formik.values.requestType) && (
                      <div className="flex items-center h-full method-selector-container">
                        <HttpMethodSelector
                          method={formik.values.requestMethod}
                          onMethodSelect={(val: string) => formik.setFieldValue('requestMethod', val)}
                          showCaret
                        />
                      </div>
                    )}
                    <div
                      id="new-request-url"
                      className="flex px-2 items-center flex-grow input-container h-full min-w-0"
                    >
                      <SingleLineEditor
                        onPaste={handlePaste as any}
                        placeholder="Request URL"
                        value={formik.values.requestUrl || ''}
                        theme={storedTheme as any}
                        onChange={(value: string) => {
                          formik.handleChange({
                            target: {
                              name: 'requestUrl',
                              value: value
                            }
                          });
                        }}
                        collection={collection}
                        variablesAutocomplete={true}
                      />
                    </div>
                  </div>
                  {formik.touched.requestUrl && formik.errors.requestUrl ? (
                    <div className="text-red-500">{formik.errors.requestUrl as string}</div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="mt-4">
                <div className="flex justify-between">
                  <label htmlFor="request-url" className="block font-medium">
                    cURL Command
                  </label>
                  <Dropdown onCreate={onDropdownCreate} icon={<Icon />} placement="bottom-end">
                    <div
                      className="dropdown-item"
                      onClick={() => {
                        dropdownTippyRef.current.hide();
                        curlRequestTypeChange('http-request');
                      }}
                    >
                      HTTP
                    </div>
                    <div
                      className="dropdown-item"
                      onClick={() => {
                        dropdownTippyRef.current.hide();
                        curlRequestTypeChange('graphql-request');
                      }}
                    >
                      GraphQL
                    </div>
                  </Dropdown>
                </div>
                <textarea
                  name="curlCommand"
                  placeholder="Enter cURL request here.."
                  className="block textbox w-full mt-4 curl-command"
                  value={formik.values.curlCommand}
                  onChange={handleCurlCommandChange}
                ></textarea>
                {formik.touched.curlCommand && formik.errors.curlCommand ? (
                  <div className="text-red-500">{formik.errors.curlCommand}</div>
                ) : null}
              </div>
            )}
            <div className="flex justify-end items-center mt-8 bruno-modal-footer">
              <Button type="button" color="secondary" variant="ghost" onClick={onClose} className="mr-2">
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </div>
          </form>
        </Modal>
      </StyledWrapper>
    </Portal>
  );
};

export default NewRequest;
