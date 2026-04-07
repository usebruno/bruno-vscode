import React, { useState, useEffect, useRef } from 'react';
import { IconFileImport } from '@tabler/icons';
import { toastError } from 'utils/common/error';
import Modal from 'components/Modal';
import jsyaml from 'js-yaml';
import { isPostmanCollection } from 'utils/importers/postman-collection';
import { isInsomniaCollection } from 'utils/importers/insomnia-collection';
import { isOpenApiSpec } from 'utils/importers/openapi-collection';
import { isWSDLCollection } from 'utils/importers/wsdl-collection';
import { isBrunoCollection } from 'utils/importers/bruno-collection';
import { isOpenCollection } from 'utils/importers/opencollection';
import FullscreenLoader from './FullscreenLoader/index';
import { useTheme } from 'providers/Theme';
import { ipcRenderer } from 'utils/ipc';

const convertFileToObject = async (file: any) => {
  const text = await file.text();

  // Handle WSDL files - return as plain text
  if (file.name.endsWith('.wsdl') || file.type === 'text/xml' || file.type === 'application/xml') {
    return text;
  }

  try {
    if (file.type === 'application/json' || file.name.endsWith('.json')) {
      return JSON.parse(text);
    }

    const parsed = jsyaml.load(text);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new Error('Failed to parse the file – ensure it is valid JSON or YAML');
  }
};

const ImportCollection = ({
  onClose,
  handleSubmit
}: any) => {
  const { theme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = (e: any) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }

    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const processZipFile = async (file: any) => {
    setIsLoading(true);
    try {
      // In VS Code webview, File objects don't have a .path property (Electron-only).
      // Read the file as base64 and send to extension which saves to a temp file.
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);

      const result = await ipcRenderer.invoke('renderer:validate-and-save-zip', base64Data, file.name) as any;

      if (!result || !result.valid) {
        throw new Error('The ZIP file is not a valid Bruno collection');
      }

      const collectionName = file.name.replace(/\.zip$/i, '');
      handleSubmit({ rawData: { zipFilePath: result.tempZipPath, collectionName }, type: 'bruno-zip' });
    } catch (err) {
      toastError(err, 'Import ZIP file failed');
    } finally {
      setIsLoading(false);
    }
  };

  const processFile = async (file: any) => {
    // Handle ZIP files separately
    if (file.name.endsWith('.zip')) {
      return processZipFile(file);
    }

    setIsLoading(true);
    try {
      const data = await convertFileToObject(file);

      if (!data) {
        throw new Error('Failed to parse file content');
      }

      let type = null;

      if (isOpenApiSpec(data)) {
        type = 'openapi';
      } else if (isWSDLCollection(data)) {
        type = 'wsdl';
      } else if (isPostmanCollection(data)) {
        type = 'postman';
      } else if (isInsomniaCollection(data)) {
        type = 'insomnia';
      } else if (isOpenCollection(data)) {
        type = 'opencollection';
      } else if (isBrunoCollection(data)) {
        type = 'bruno';
      } else {
        throw new Error('Unsupported collection format');
      }

      handleSubmit({ rawData: data, type });
    } catch (err) {
      toastError(err, 'Import collection failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = async (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleBrowseFiles = () => {
    fileInputRef.current.click();
  };

  const handleFileInputChange = async (e: any) => {
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  if (isLoading) {
    return <FullscreenLoader isLoading={isLoading} />;
  }

  const acceptedFileTypes = [
    '.json',
    '.yaml',
    '.yml',
    '.wsdl',
    '.zip',
    'application/json',
    'application/yaml',
    'application/x-yaml',
    'application/zip',
    'application/x-zip-compressed',
    'text/xml',
    'application/xml'
  ];

  return (
    <Modal size="sm" title="Import Collection" hideFooter={true} handleCancel={onClose} dataTestId="import-collection-modal">
      <div className="flex flex-col">
        <div className="mb-4">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Import from file</h3>
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed rounded-lg p-6 transition-colors duration-200
              ${dragActive ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}
            `}
          >
            <div className="flex flex-col items-center justify-center">
              <IconFileImport
                size={28}
                className="text-gray-400 dark:text-gray-500 mb-3"
              />
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileInputChange}
                accept={acceptedFileTypes.join(',')}
              />
              <p className="text-gray-600 dark:text-gray-300 mb-2">
                Drop file to import or{' '}
                <button
                  className="underline cursor-pointer"
                  onClick={handleBrowseFiles}
                  style={{ color: theme.textLink }}
                >
                  choose a file
                </button>
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Supports Bruno, OpenCollection, Postman, Insomnia, OpenAPI v3, WSDL, and ZIP formats
              </p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );

interface convertFileToObjectProps {
  onClose?: (...args: unknown[]) => void;
  handleSubmit?: (...args: unknown[]) => unknown;
}

};

export default ImportCollection;
