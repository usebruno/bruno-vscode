import React, { useRef, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import toast from 'react-hot-toast';
import styled from 'styled-components';
import { IconCopy, IconFolder } from '@tabler/icons';
import { cloneCollection } from 'providers/ReduxStore/slices/collections/actions';
import { ipcRenderer } from 'utils/ipc';

const StyledWrapper = styled.div`
  width: 100%;
  min-height: 100vh;
  background-color: var(--vscode-editor-background, ${(props: any) => props.theme?.bg || '#1e1e1e'});
  color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
  font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  font-size: 13px;
  padding: 32px;

  .clone-container {
    max-width: 560px;
    margin: 0 auto;
  }

  .clone-header {
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

  .clone-form {
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

  .location-input-group {
    display: flex;
    gap: 8px;

    .location-input {
      flex: 1;
    }

    .browse-btn {
      padding: 8px 16px;
      border: 1px solid var(--vscode-input-border, ${(props: any) => props.theme?.input?.border || '#454545'});
      border-radius: 4px;
      background-color: var(--vscode-input-background, ${(props: any) => props.theme?.input?.bg || '#3c3c3c'});
      color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;

      &:hover:not(:disabled) {
        border-color: var(--vscode-focusBorder, ${(props: any) => props.theme?.button?.primary?.bg || '#007acc'});
        background-color: var(--vscode-list-hoverBackground, ${(props: any) => props.theme?.sidebar?.collection?.item?.hoverBg || '#2d2d2d'});
      }

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }
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

interface CloneCollectionViewProps {
  collection: any;
}

const CloneCollectionView: React.FC<CloneCollectionViewProps> = ({ collection }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const dispatch = useDispatch();
  const [isCloning, setIsCloning] = useState(false);

  const formik = useFormik({
    enableReinitialize: true,
    initialValues: {
      name: `${collection?.name || 'Collection'} copy`,
      location: ''
    },
    validationSchema: Yup.object({
      name: Yup.string()
        .trim()
        .min(1, 'Name must be at least 1 character')
        .max(255, 'Name must be 255 characters or less')
        .required('Collection name is required'),
      location: Yup.string()
        .trim()
        .required('Location is required')
    }),
    onSubmit: async (values) => {
      setIsCloning(true);
      try {
        await dispatch(
          cloneCollection(values.name, values.name, values.location, collection.pathname) as any
        );
        toast.success('Collection cloned successfully!');
        ipcRenderer.send('clone-collection:close');
      } catch (e: any) {
        toast.error(e?.message || 'Failed to clone collection');
      } finally {
        setIsCloning(false);
      }
    }
  });

  const handleBrowse = async () => {
    try {
      const result = await ipcRenderer.invoke('clone-collection:browse-location', {});
      if (result) {
        formik.setFieldValue('location', result);
      }
    } catch (error) {
      console.error('Error selecting location:', error);
    }
  };

  const handleCancel = () => {
    ipcRenderer.send('clone-collection:close');
  };

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  return (
    <StyledWrapper>
      <div className="clone-container">
        <div className="clone-header">
          <h1>
            <IconCopy size={22} strokeWidth={1.5} />
            Clone Collection
          </h1>
          <p>
            Create a copy of "{collection?.name || 'collection'}" in a new location.
          </p>
        </div>

        <form onSubmit={formik.handleSubmit} className="clone-form">
          <div className="form-group">
            <label htmlFor="name" className="form-label">
              Collection Name <span className="required">*</span>
            </label>
            <input
              ref={inputRef}
              id="name"
              type="text"
              name="name"
              className={`form-input ${formik.touched.name && formik.errors.name ? 'error' : ''}`}
              placeholder="My Collection copy"
              value={formik.values.name}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              disabled={isCloning}
              autoComplete="off"
            />
            {formik.touched.name && formik.errors.name && (
              <div className="form-error">{formik.errors.name}</div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="location" className="form-label">
              Location <span className="required">*</span>
            </label>
            <div className="location-input-group">
              <input
                id="location"
                type="text"
                name="location"
                className={`form-input location-input ${formik.touched.location && formik.errors.location ? 'error' : ''}`}
                placeholder="Select a folder..."
                value={formik.values.location}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                disabled={isCloning}
                readOnly
              />
              <button
                type="button"
                className="browse-btn"
                onClick={handleBrowse}
                disabled={isCloning}
              >
                <IconFolder size={16} />
                Browse
              </button>
            </div>
            {formik.touched.location && formik.errors.location && (
              <div className="form-error">{formik.errors.location}</div>
            )}
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCancel}
              disabled={isCloning}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isCloning || !formik.values.name.trim() || !formik.values.location}
            >
              {isCloning ? 'Cloning...' : 'Clone Collection'}
            </button>
          </div>
        </form>
      </div>
    </StyledWrapper>
  );
};

export default CloneCollectionView;
