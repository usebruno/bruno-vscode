import React, { useRef, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import toast from 'react-hot-toast';
import styled from 'styled-components';
import { IconPlus, IconFolder, IconChevronDown, IconChevronUp } from '@tabler/icons';
import { browseDirectory, createCollection } from 'providers/ReduxStore/slices/collections/actions';
import { sanitizeName, validateName, validateNameError } from 'utils/common/regex';
import { multiLineMsg } from 'utils/common';
import { formatIpcError } from 'utils/common/error';
import { ipcRenderer } from 'utils/ipc';
import get from 'lodash/get';

const StyledWrapper = styled.div`
  width: 100%;
  min-height: 100vh;
  background-color: var(--vscode-editor-background, ${(props) => props.theme?.bg || '#1e1e1e'});
  color: var(--vscode-foreground, ${(props) => props.theme?.text || '#cccccc'});
  font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  font-size: 13px;
  padding: 32px;

  .create-collection-container {
    max-width: 560px;
    margin: 0 auto;
  }

  .create-collection-header {
    margin-bottom: 32px;

    h1 {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: var(--vscode-foreground, ${(props) => props.theme?.text || '#cccccc'});

      svg {
        color: var(--vscode-button-background, ${(props) => props.theme?.button?.primary?.bg || '#0e639c'});
      }
    }

    p {
      margin: 8px 0 0 0;
      color: var(--vscode-descriptionForeground, ${(props) => props.theme?.textMuted || '#999999'});
      font-size: 13px;
    }
  }

  .create-collection-form {
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
    color: var(--vscode-foreground, ${(props) => props.theme?.text || '#cccccc'});

    .required {
      color: var(--vscode-errorForeground, #f14c4c);
      margin-left: 2px;
    }
  }

  .form-input {
    padding: 8px 12px;
    border: 1px solid var(--vscode-input-border, ${(props) => props.theme?.input?.border || '#454545'});
    border-radius: 4px;
    background-color: var(--vscode-input-background, ${(props) => props.theme?.input?.bg || '#3c3c3c'});
    color: var(--vscode-input-foreground, ${(props) => props.theme?.text || '#cccccc'});
    font-size: 13px;
    font-family: inherit;
    transition: border-color 0.15s ease;

    &::placeholder {
      color: var(--vscode-input-placeholderForeground, ${(props) => props.theme?.textMuted || '#999999'});
    }

    &:focus {
      outline: none;
      border-color: var(--vscode-focusBorder, ${(props) => props.theme?.button?.primary?.bg || '#007acc'});
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    &.error {
      border-color: var(--vscode-inputValidation-errorBorder, #f14c4c);
    }
  }

  .location-input-group {
    display: flex;
    gap: 8px;

    .location-input {
      flex: 1;
      cursor: pointer;
    }

    .browse-button {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      background-color: var(--vscode-button-secondaryBackground, ${(props) => props.theme?.button?.secondary?.bg || '#3a3d41'});
      color: var(--vscode-button-secondaryForeground, ${(props) => props.theme?.button?.secondary?.color || '#cccccc'});
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      transition: background-color 0.15s ease;
      white-space: nowrap;

      &:hover:not(:disabled) {
        background-color: var(--vscode-button-secondaryHoverBackground, ${(props) => props.theme?.button?.secondary?.hoverBg || '#45494e'});
      }

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }
  }

  .form-help {
    font-size: 12px;
    color: var(--vscode-descriptionForeground, ${(props) => props.theme?.textMuted || '#999999'});
    margin-top: 4px;
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
    border-top: 1px solid var(--vscode-widget-border, ${(props) => props.theme?.input?.border || '#454545'});
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
    color: var(--vscode-foreground, ${(props) => props.theme?.text || '#cccccc'});
    border: 1px solid var(--vscode-button-border, ${(props) => props.theme?.input?.border || '#454545'});

    &:hover:not(:disabled) {
      background-color: var(--vscode-list-hoverBackground, ${(props) => props.theme?.sidebar?.collection?.item?.hoverBg || '#2d2d2d'});
    }
  }

  .btn-primary {
    background-color: var(--vscode-button-background, ${(props) => props.theme?.button?.primary?.bg || '#0e639c'});
    color: var(--vscode-button-foreground, ${(props) => props.theme?.button?.primary?.color || '#ffffff'});
    border: none;

    &:hover:not(:disabled) {
      background-color: var(--vscode-button-hoverBackground, ${(props) => props.theme?.button?.primary?.hoverBg || '#1177bb'});
    }
  }

  .advanced-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    color: var(--vscode-textLink-foreground, ${(props) => props.theme?.textLink || '#3794ff'});
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
    padding: 0;

    &:hover {
      text-decoration: underline;
    }
  }

  .form-select {
    padding: 8px 12px;
    border: 1px solid var(--vscode-input-border, ${(props) => props.theme?.input?.border || '#454545'});
    border-radius: 4px;
    background-color: var(--vscode-input-background, ${(props) => props.theme?.input?.bg || '#3c3c3c'});
    color: var(--vscode-input-foreground, ${(props) => props.theme?.text || '#cccccc'});
    font-size: 13px;
    font-family: inherit;
    width: 100%;

    &:focus {
      outline: none;
      border-color: var(--vscode-focusBorder, ${(props) => props.theme?.button?.primary?.bg || '#007acc'});
    }
  }
`;

const CreateCollectionView: React.FC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const workspaces = useSelector((state: any) => state.workspaces?.workspaces || []);
  const workspaceUid = useSelector((state: any) => state.workspaces?.activeWorkspaceUid);
  const preferences = useSelector((state: any) => state.app.preferences);
  const activeWorkspace = workspaces.find((w: any) => w.uid === workspaceUid);
  const isDefaultWorkspace = activeWorkspace?.type === 'default';

  const defaultLocation = isDefaultWorkspace
    ? get(preferences, 'general.defaultCollectionLocation', '')
    : (activeWorkspace?.pathname ? `${activeWorkspace.pathname}/collections` : '');

  const formik = useFormik({
    enableReinitialize: true,
    initialValues: {
      collectionName: '',
      collectionFolderName: '',
      collectionLocation: defaultLocation || '',
      format: 'yml'
    },
    validationSchema: Yup.object({
      collectionName: Yup.string()
        .min(1, 'must be at least 1 character')
        .max(255, 'must be 255 characters or less')
        .required('Collection name is required'),
      collectionFolderName: Yup.string()
        .min(1, 'must be at least 1 character')
        .max(255, 'must be 255 characters or less')
        .test('is-valid-collection-name', function (value) {
          if (!value) return true;
          const isValid = validateName(value);
          return isValid ? true : this.createError({ message: validateNameError(value) });
        }),
      collectionLocation: Yup.string()
        .min(1, 'Location is required')
        .required('Location is required'),
      format: Yup.string().oneOf(['bru', 'yml'], 'invalid format').required('format is required')
    }),
    onSubmit: async (values) => {
      setIsLoading(true);
      try {
        const folderName = values.collectionFolderName || sanitizeName(values.collectionName);
        await dispatch(createCollection(
          values.collectionName,
          folderName,
          values.collectionLocation,
          { format: values.format }
        ) as any);

        toast.success('Collection created!');

        ipcRenderer.send('create-collection:close');
      } catch (e: any) {
        toast.error(multiLineMsg('An error occurred while creating the collection', formatIpcError(e)));
      } finally {
        setIsLoading(false);
      }
    }
  });

  const browse = () => {
    dispatch(browseDirectory() as any)
      .then((dirPath: string) => {
        if (typeof dirPath === 'string') {
          formik.setFieldValue('collectionLocation', dirPath);
        }
      })
      .catch(() => {
      });
  };

  const handleCancel = () => {
    ipcRenderer.send('create-collection:close');
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    formik.handleChange(e);
    const sanitized = sanitizeName(e.target.value);
    formik.setFieldValue('collectionFolderName', sanitized);
  };

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  return (
    <StyledWrapper>
      <div className="create-collection-container">
        <div className="create-collection-header">
          <h1>
            <IconPlus size={22} strokeWidth={1.5} />
            Create Collection
          </h1>
          <p>
            Create a new collection to organize your API requests.
            Collections are stored on your filesystem.
          </p>
        </div>

        <form onSubmit={formik.handleSubmit} className="create-collection-form">
          <div className="form-group">
            <label htmlFor="collectionName" className="form-label">
              Collection Name <span className="required">*</span>
            </label>
            <input
              ref={inputRef}
              id="collectionName"
              type="text"
              name="collectionName"
              className={`form-input ${formik.touched.collectionName && formik.errors.collectionName ? 'error' : ''}`}
              placeholder="My Collection"
              value={formik.values.collectionName}
              onChange={handleNameChange}
              onBlur={formik.handleBlur}
              disabled={isLoading}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />
            {formik.touched.collectionName && formik.errors.collectionName && (
              <div className="form-error">{formik.errors.collectionName}</div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="collectionLocation" className="form-label">
              Location <span className="required">*</span>
            </label>
            <div className="location-input-group">
              <input
                id="collectionLocation"
                type="text"
                name="collectionLocation"
                className={`form-input location-input ${formik.touched.collectionLocation && formik.errors.collectionLocation ? 'error' : ''}`}
                placeholder="Select a folder to store the collection"
                value={formik.values.collectionLocation}
                onClick={browse}
                onBlur={formik.handleBlur}
                disabled={isLoading}
                readOnly
              />
              <button
                type="button"
                className="browse-button"
                onClick={browse}
                disabled={isLoading}
              >
                <IconFolder size={16} strokeWidth={1.5} />
                Browse
              </button>
            </div>
            {formik.touched.collectionLocation && formik.errors.collectionLocation && (
              <div className="form-error">{formik.errors.collectionLocation as string}</div>
            )}
            <div className="form-help">
              Choose a folder where your collection will be saved.
            </div>
          </div>

          <div className="form-group">
            <button
              type="button"
              className="advanced-toggle"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              Options
              {showAdvanced
                ? <IconChevronUp size={14} strokeWidth={2} />
                : <IconChevronDown size={14} strokeWidth={2} />
              }
            </button>

            {showAdvanced && (
              <div style={{ marginTop: 12 }}>
                <label htmlFor="format" className="form-label">
                  File Format
                </label>
                <div className="form-help" style={{ marginTop: 2, marginBottom: 8 }}>
                  Choose the file format for storing requests in this collection.
                </div>
                <select
                  id="format"
                  name="format"
                  className="form-select"
                  value={formik.values.format}
                  onChange={formik.handleChange}
                  disabled={isLoading}
                >
                  <option value="yml">OpenCollection (YAML)</option>
                  <option value="bru">BRU Format (.bru)</option>
                </select>
              </div>
            )}
          </div>

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
              disabled={isLoading || !formik.values.collectionName.trim() || !formik.values.collectionLocation}
            >
              {isLoading ? 'Creating...' : 'Create Collection'}
            </button>
          </div>
        </form>
      </div>
    </StyledWrapper>
  );
};

export default CreateCollectionView;
