import React from 'react';
import path from 'utils/common/path';
import { useDispatch } from 'react-redux';
import { browseFiles } from 'providers/ReduxStore/slices/collections/actions';
import { IconX, IconUpload, IconFile } from '@tabler/icons';
import { isWindowsOS } from 'utils/common/platform';
import StyledWrapper from './StyledWrapper';

interface FilePickerEditorProps {
  value?: unknown;
  onChange?: (...args: unknown[]) => void;
  collection: unknown;
  isSingleFilePicker?: boolean;
  readOnly?: React.ReactNode;
  displayMode?: boolean;
  label?: unknown;
  icon?: unknown;
}

/**
 * FilePickerEditor component for selecting files
 *
 * @param {Object} props
 * @param {string|string[]} props.value - Selected file path(s)
 * @param {Function} props.onChange - Callback when file selection changes
 * @param {Object} props.collection - Collection object with pathname
 * @param {boolean} props.isSingleFilePicker - If true, only allows single file selection
 * @param {boolean} props.readOnly - If true, disables file selection
 * @param {string} props.displayMode - Display mode: 'label', 'icon', or 'labelAndIcon' (default: 'label')
 * @param {string} props.label - Custom label text (defaults to "Select File" or "Select Files")
 * @param {React.ComponentType} props.icon - Custom icon component (defaults to IconUpload)
 */
const FilePickerEditor = ({
  value,
  onChange,
  collection,
  isSingleFilePicker = false,
  readOnly = false,
  displayMode = 'label',
  label,
  icon: CustomIcon
}: any) => {
  const dispatch = useDispatch();
  const filenames = (isSingleFilePicker ? [value] : value || [])
    .filter((v: any) => v != null && v != '')
    .map((v: any) => {
      const separator = isWindowsOS() ? '\\' : '/';
      return v.split(separator).pop();
    });

  // title is shown when hovering over the button
  const title = filenames.map((v: any) => `- ${v}`).join('\n');

  const browse = () => {
    if (readOnly) return;

    (dispatch(browseFiles([], [!isSingleFilePicker ? 'multiSelections' : ''])) as unknown as Promise<string[]>)
      .then((filePaths: any) => {
        // If file is in the collection's directory, then we use relative path
        // Otherwise, we use the absolute path
        filePaths = filePaths.map((filePath: any) => {
          const collectionDir = collection.pathname;

          if (filePath.startsWith(collectionDir)) {
            return path.relative(collectionDir, filePath);
          }

          return filePath;
        });

        onChange(isSingleFilePicker ? filePaths[0] : filePaths);
      })
      .catch((error: any) => {
        console.error(error);
      });
  };

  const clear = (e: any) => {
    e.stopPropagation();
    onChange(isSingleFilePicker ? '' : []);
  };

  const renderButtonText = (filenames: any) => {
    if (filenames.length == 1) {
      return filenames[0];
    }
    return filenames.length + ' file(s) selected';
  };

  const defaultLabel = isSingleFilePicker ? 'Select File' : 'Select Files';
  const displayLabel = label || defaultLabel;
  const IconComponent = CustomIcon || IconUpload;

  const renderButtonContent = () => {
    switch (displayMode) {
      case 'icon':
        return <IconComponent size={16} />;
      case 'labelAndIcon':
        return (
          <>
            <span className="label">{displayLabel}</span>
            <IconComponent size={16} />
          </>
        );
      case 'label':
      default:
        return <span>{displayLabel}</span>;
    }
  };

  if (filenames.length > 0) {
    return (
      <StyledWrapper>
        <div
          className={`file-picker-selected ${readOnly ? 'read-only' : ''}`}
          title={title}
          onClick={!readOnly ? browse : undefined}
        >
          <IconFile size={16} className="file-icon" />
          <span className="file-name">
            {renderButtonText(filenames)}
          </span>
          {!readOnly && (
            <button
              className="clear-btn"
              onClick={clear}
              title="Remove file"
              type="button"
            >
              <IconX size={16} />
            </button>
          )}
        </div>
      </StyledWrapper>
    );
  }

  return (
    <StyledWrapper>
      <button
        className={`file-picker-btn ${readOnly ? 'read-only' : ''} ${displayMode === 'icon' ? 'icon-only' : ''} ${displayMode === 'labelAndIcon' ? 'icon-right' : ''}`}
        onClick={browse}
        disabled={readOnly}
        type="button"
        title={displayLabel}
      >
        {renderButtonContent()}
      </button>
    </StyledWrapper>
  );
};

export default FilePickerEditor;
