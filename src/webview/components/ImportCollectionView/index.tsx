import React, { useRef, useState, useEffect, forwardRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import toast from 'react-hot-toast';
import styled from 'styled-components';
import get from 'lodash/get';
import { IconFileImport, IconFolder, IconCaretDown, IconLoader2 } from '@tabler/icons';
import jsyaml from 'js-yaml';
import { browseDirectory, importCollection, importCollectionFromZip } from 'providers/ReduxStore/slices/collections/actions';
import { isPostmanCollection } from 'utils/importers/postman-collection';
import { isInsomniaCollection } from 'utils/importers/insomnia-collection';
import { isOpenApiSpec } from 'utils/importers/openapi-collection';
import { isWSDLCollection } from 'utils/importers/wsdl-collection';
import { isBrunoCollection } from 'utils/importers/bruno-collection';
import { isOpenCollection } from 'utils/importers/opencollection';
import { postmanToBruno } from 'utils/importers/postman-collection';
import { convertInsomniaToBruno } from 'utils/importers/insomnia-collection';
import { convertOpenapiToBruno } from 'utils/importers/openapi-collection';
import { processBrunoCollection } from 'utils/importers/bruno-collection';
import { processOpenCollection } from 'utils/importers/opencollection';
import { wsdlToBruno } from 'utils/importers/wsdl-collection';
import { toastError, formatIpcError } from 'utils/common/error';
import { multiLineMsg } from 'utils/common';
import { ipcRenderer } from 'utils/ipc';
import Help from 'components/Help';
import Dropdown from 'components/Dropdown';

const StyledWrapper = styled.div`
  width: 100%;
  min-height: 100vh;
  background-color: var(--vscode-editor-background, ${(props: any) => props.theme?.bg || '#1e1e1e'});
  color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
  font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  font-size: 13px;
  padding: 24px 32px;

  .import-collection-container {
    max-width: 520px;
    margin: 0 auto;
  }

  .import-collection-header {
    margin-bottom: 20px;

    h1 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});

      svg {
        color: var(--vscode-button-background, ${(props: any) => props.theme?.button?.primary?.bg || '#0e639c'});
      }
    }

    p {
      margin: 6px 0 0 0;
      color: var(--vscode-descriptionForeground, ${(props: any) => props.theme?.textMuted || '#999999'});
      font-size: 12px;
    }
  }

  .drop-zone {
    border: 2px dashed var(--vscode-input-border, ${(props: any) => props.theme?.input?.border || '#454545'});
    border-radius: 6px;
    padding: 28px 20px;
    text-align: center;
    transition: border-color 0.2s ease, background-color 0.2s ease;
    cursor: pointer;

    &.drag-active {
      border-color: var(--vscode-button-background, ${(props: any) => props.theme?.button?.primary?.bg || '#0e639c'});
      background-color: var(--vscode-list-hoverBackground, ${(props: any) => props.theme?.sidebar?.collection?.item?.hoverBg || '#2d2d2d'});
    }

    .drop-icon {
      color: var(--vscode-descriptionForeground, ${(props: any) => props.theme?.textMuted || '#999999'});
      margin-bottom: 8px;
    }

    .drop-text {
      color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
      margin-bottom: 6px;
    }

    .drop-hint {
      font-size: 11px;
      color: var(--vscode-descriptionForeground, ${(props: any) => props.theme?.textMuted || '#999999'});
    }

    .browse-link {
      color: var(--vscode-textLink-foreground, ${(props: any) => props.theme?.textLink || '#3794ff'});
      cursor: pointer;
      text-decoration: underline;
      background: none;
      border: none;
      font-size: 13px;
      font-family: inherit;
    }
  }

  .import-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .collection-summary {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 4px;
    background-color: var(--vscode-input-background, ${(props: any) => props.theme?.input?.bg || '#3c3c3c'});
    border: 1px solid var(--vscode-input-border, ${(props: any) => props.theme?.input?.border || '#454545'});

    .collection-name {
      font-weight: 500;
      color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
    }
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 500;
    color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
  }

  .form-input {
    padding: 6px 10px;
    border: 1px solid var(--vscode-input-border, ${(props: any) => props.theme?.input?.border || '#454545'});
    border-radius: 4px;
    background-color: var(--vscode-input-background, ${(props: any) => props.theme?.input?.bg || '#3c3c3c'});
    color: var(--vscode-input-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
    font-size: 13px;
    font-family: inherit;
    transition: border-color 0.15s ease;

    &:focus {
      outline: none;
      border-color: var(--vscode-focusBorder, ${(props: any) => props.theme?.button?.primary?.bg || '#007acc'});
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
      padding: 6px 14px;
      background-color: var(--vscode-button-secondaryBackground, ${(props: any) => props.theme?.button?.secondary?.bg || '#3a3d41'});
      color: var(--vscode-button-secondaryForeground, ${(props: any) => props.theme?.button?.secondary?.color || '#cccccc'});
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      transition: background-color 0.15s ease;
      white-space: nowrap;

      &:hover:not(:disabled) {
        background-color: var(--vscode-button-secondaryHoverBackground, ${(props: any) => props.theme?.button?.secondary?.hoverBg || '#45494e'});
      }

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }
  }

  .form-help {
    font-size: 11px;
    color: var(--vscode-descriptionForeground, ${(props: any) => props.theme?.textMuted || '#999999'});
  }

  .form-error {
    font-size: 12px;
    color: var(--vscode-errorForeground, #f14c4c);
  }

  .detected-format {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    background-color: var(--vscode-badge-background, ${(props: any) => props.theme?.button?.primary?.bg || '#0e639c'});
    color: var(--vscode-badge-foreground, ${(props: any) => props.theme?.button?.primary?.color || '#ffffff'});
  }

  .grouping-section {
    display: flex;
    gap: 12px;
    align-items: center;

    .grouping-label {
      flex: 1;
    }

    .current-group {
      background-color: var(--vscode-input-background, ${(props: any) => props.theme?.input?.bg || '#3c3c3c'});
      border-radius: 4px;
      padding: 6px 10px;
      cursor: pointer;
      border: 1px solid var(--vscode-input-border, ${(props: any) => props.theme?.input?.border || '#454545'});
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      min-width: 100px;
    }
  }

  .form-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 8px;
    padding-top: 16px;
    border-top: 1px solid var(--vscode-widget-border, ${(props: any) => props.theme?.input?.border || '#454545'});
  }

  .btn {
    padding: 6px 16px;
    border-radius: 4px;
    font-size: 13px;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s ease;
    min-width: 80px;

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

  .loading-overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    text-align: center;

    .loading-message {
      margin-top: 16px;
      font-size: 14px;
      color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
    }

    .loading-hint {
      margin-top: 8px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground, ${(props: any) => props.theme?.textMuted || '#999999'});
    }
  }
`;

const ACCEPTED_FILE_TYPES = [
  '.json', '.yaml', '.yml', '.wsdl', '.zip',
  'application/json', 'application/yaml', 'application/x-yaml',
  'application/zip', 'application/x-zip-compressed',
  'text/xml', 'application/xml'
];

const LOADING_MESSAGES = [
  'Processing collection...',
  'Analyzing requests...',
  'Translating scripts...',
  'Preparing collection...',
  'Almost done...'
];

const FORMAT_LABELS: Record<string, string> = {
  openapi: 'OpenAPI / Swagger',
  postman: 'Postman',
  insomnia: 'Insomnia',
  bruno: 'Bruno',
  'bruno-zip': 'Bruno (ZIP)',
  opencollection: 'OpenCollection',
  wsdl: 'WSDL'
};

const groupingOptions = [
  { value: 'tags', label: 'Tags', description: 'Group requests by OpenAPI tags' },
  { value: 'path', label: 'Paths', description: 'Group requests by URL path structure' }
];

const convertFileToObject = async (file: File) => {
  const text = await file.text();

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
    throw new Error('Failed to parse the file \u2013 ensure it is valid JSON or YAML');
  }
};

const getCollectionName = (format: string, rawData: any): string => {
  if (!rawData) return 'Collection';
  switch (format) {
    case 'openapi':
      return rawData.info?.title || 'OpenAPI Collection';
    case 'postman':
      return rawData.info?.name || rawData.collection?.info?.name || 'Postman Collection';
    case 'insomnia': {
      if (rawData.resources && Array.isArray(rawData.resources)) {
        const workspace = rawData.resources.find((r: any) => r._type === 'workspace');
        if (workspace?.name) return workspace.name;
      }
      return rawData.name || 'Insomnia Collection';
    }
    case 'bruno':
      return rawData.name || 'Bruno Collection';
    case 'opencollection':
      return rawData.info?.name || 'OpenCollection';
    case 'wsdl':
      return 'WSDL Collection';
    case 'bruno-zip':
      return rawData.collectionName || 'Bruno Collection';
    default:
      return 'Collection';
  }
};

const convertCollection = async (format: string, rawData: any, groupingType: string) => {
  switch (format) {
    case 'openapi':
      return await convertOpenapiToBruno(rawData, { groupBy: groupingType });
    case 'wsdl':
      return await wsdlToBruno(rawData);
    case 'postman':
      return await postmanToBruno(rawData);
    case 'insomnia':
      return await convertInsomniaToBruno(rawData);
    case 'bruno':
      return await processBrunoCollection(rawData);
    case 'opencollection':
      return await processOpenCollection(rawData);
    default:
      throw new Error('Unknown collection format');
  }
};

const ImportCollectionView: React.FC = () => {
  const dispatch = useDispatch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownTippyRef = useRef<{ hide: () => void } | null>(null);

  // Step management: 'file-select' or 'configure'
  const [step, setStep] = useState<'file-select' | 'configure'>('file-select');
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  const [rawData, setRawData] = useState<any>(null);
  const [detectedFormat, setDetectedFormat] = useState<string>('');
  const [groupingType, setGroupingType] = useState('tags');
  const [collectionFormat, setCollectionFormat] = useState('yml');

  // Workspace/preferences for default location
  const workspaces = useSelector((state: any) => state.workspaces?.workspaces || []);
  const workspaceUid = useSelector((state: any) => state.workspaces?.activeWorkspaceUid);
  const preferences = useSelector((state: any) => state.app.preferences);
  const activeWorkspace = workspaces.find((w: any) => w.uid === workspaceUid);
  const isDefaultWorkspace = !activeWorkspace || activeWorkspace.type === 'default';

  const defaultLocation = isDefaultWorkspace
    ? get(preferences, 'general.defaultCollectionLocation', '')
    : (activeWorkspace?.pathname ? `${activeWorkspace.pathname}/collections` : '');

  const collectionName = getCollectionName(detectedFormat, rawData);

  const formik = useFormik({
    enableReinitialize: true,
    initialValues: {
      collectionLocation: defaultLocation || ''
    },
    validationSchema: Yup.object({
      collectionLocation: Yup.string()
        .min(1, 'Location is required')
        .required('Location is required')
    }),
    onSubmit: async (values) => {
      setIsImporting(true);
      try {
        if (detectedFormat === 'bruno-zip') {
          // ZIP imports are handled directly by the extension backend
          await (dispatch(importCollectionFromZip(rawData.zipFilePath, values.collectionLocation) as any));
        } else {
          const convertedCollection = await convertCollection(detectedFormat, rawData, groupingType);
          await (dispatch(importCollection(convertedCollection, values.collectionLocation, { format: collectionFormat }) as any));
        }
        toast.success('Collection imported successfully');
        ipcRenderer.send('import-collection:close');
      } catch (e: any) {
        toast.error(multiLineMsg('An error occurred while importing the collection', formatIpcError(e)));
      } finally {
        setIsImporting(false);
      }
    }
  });

  useEffect(() => {
    if (!isProcessing) return;
    let idx = 0;
    setLoadingMessage(LOADING_MESSAGES[0]);
    const interval = setInterval(() => {
      idx = (idx + 1) % LOADING_MESSAGES.length;
      setLoadingMessage(LOADING_MESSAGES[idx]);
    }, 2000);
    return () => clearInterval(interval);
  }, [isProcessing]);

  const processZipFile = async (file: File) => {
    setIsProcessing(true);
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

      const result = await ipcRenderer.invoke<{ valid: boolean; tempZipPath: string }>(
        'renderer:validate-and-save-zip', base64Data, file.name
      );

      if (!result || !result.valid) {
        throw new Error('The ZIP file is not a valid Bruno collection');
      }

      const collectionName = file.name.replace(/\.zip$/i, '');
      setRawData({ zipFilePath: result.tempZipPath, collectionName });
      setDetectedFormat('bruno-zip');
      setStep('configure');
    } catch (err) {
      toastError(err, 'Import ZIP file failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const processFile = async (file: File) => {
    // Handle ZIP files separately
    if (file.name.endsWith('.zip')) {
      return processZipFile(file);
    }

    setIsProcessing(true);
    try {
      const data = await convertFileToObject(file);
      if (!data) throw new Error('Failed to parse file content');

      let type: string | null = null;
      if (isOpenApiSpec(data)) type = 'openapi';
      else if (isWSDLCollection(data)) type = 'wsdl';
      else if (isPostmanCollection(data)) type = 'postman';
      else if (isInsomniaCollection(data)) type = 'insomnia';
      else if (isOpenCollection(data)) type = 'opencollection';
      else if (isBrunoCollection(data)) type = 'bruno';
      else throw new Error('Unsupported collection format');

      setRawData(data);
      setDetectedFormat(type);
      setStep('configure');
    } catch (err) {
      toastError(err, 'Import collection failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleBrowseFiles = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  const handleCancel = () => {
    ipcRenderer.send('import-collection:close');
  };

  const handleBack = () => {
    setStep('file-select');
    setRawData(null);
    setDetectedFormat('');
  };

  const browse = () => {
    (dispatch(browseDirectory()) as any)
      .then((dirPath: string) => {
        if (typeof dirPath === 'string' && dirPath.length > 0) {
          formik.setFieldValue('collectionLocation', dirPath);
        }
      })
      .catch(() => {});
  };

  const onDropdownCreate = (ref: any) => {
    dropdownTippyRef.current = ref;
  };

  const GroupingDropdownIcon = forwardRef<HTMLDivElement>((props, ref) => {
    const selectedOption = groupingOptions.find((o) => o.value === groupingType);
    return (
      <div ref={ref} className="current-group" data-testid="grouping-dropdown">
        <span className="font-medium">{selectedOption?.label}</span>
        <IconCaretDown size={14} fill="currentColor" />
      </div>
    );
  });

  if (isProcessing) {
    return (
      <StyledWrapper>
        <div className="import-collection-container">
          <div className="loading-overlay">
            <IconLoader2 size={40} className="animate-spin" strokeWidth={1.5} />
            <div className="loading-message">{loadingMessage}</div>
            <div className="loading-hint">This may take a moment depending on the collection size</div>
          </div>
        </div>
      </StyledWrapper>
    );
  }

  if (step === 'file-select') {
    return (
      <StyledWrapper>
        <div className="import-collection-container">
          <div className="import-collection-header">
            <h1>
              <IconFileImport size={18} strokeWidth={1.5} />
              Import Collection
            </h1>
            <p>
              Supports Bruno, OpenCollection, Postman, Insomnia, OpenAPI v3, WSDL, and ZIP formats.
            </p>
          </div>

          <div
            className={`drop-zone ${dragActive ? 'drag-active' : ''}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={handleBrowseFiles}
          >
            <div className="drop-icon">
              <IconFileImport size={32} strokeWidth={1.5} />
            </div>
            <div className="drop-text">
              Drop a file here or{' '}
              <button className="browse-link" onClick={(e) => { e.stopPropagation(); handleBrowseFiles(); }}>
                browse
              </button>
            </div>
            <div className="drop-hint">
              JSON, YAML, WSDL, or ZIP files
            </div>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={handleFileInputChange}
              accept={ACCEPTED_FILE_TYPES.join(',')}
            />
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      </StyledWrapper>
    );
  }

  return (
    <StyledWrapper>
      <div className="import-collection-container">
        <div className="import-collection-header">
          <h1>
            <IconFileImport size={18} strokeWidth={1.5} />
            Import Collection
          </h1>
        </div>

        <form onSubmit={formik.handleSubmit} className="import-form">
          <div className="collection-summary">
            <span className="collection-name">{collectionName}</span>
            <span className="detected-format">
              {FORMAT_LABELS[detectedFormat] || detectedFormat}
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="collectionLocation" className="form-label">
              Location
              <Help>
                <p>Bruno stores your collections on your filesystem.</p>
                <p className="mt-2">Choose where to store this collection.</p>
              </Help>
            </label>
            <div className="location-input-group">
              <input
                id="collectionLocation"
                type="text"
                name="collectionLocation"
                className={`form-input location-input ${formik.touched.collectionLocation && formik.errors.collectionLocation ? 'error' : ''}`}
                placeholder="Select a folder..."
                value={formik.values.collectionLocation}
                onClick={browse}
                onBlur={formik.handleBlur}
                disabled={isImporting}
                readOnly
              />
              <button
                type="button"
                className="browse-button"
                onClick={browse}
                disabled={isImporting}
              >
                <IconFolder size={14} strokeWidth={1.5} />
                Browse
              </button>
            </div>
            {formik.touched.collectionLocation && formik.errors.collectionLocation && (
              <div className="form-error">{String(formik.errors.collectionLocation)}</div>
            )}
          </div>

          {detectedFormat !== 'bruno-zip' && (
            <div className="form-group">
              <label htmlFor="format" className="form-label">
                File Format
                <Help width="260">
                  <p><strong>OpenCollection (YAML):</strong> Industry-standard YAML format (.yml)</p>
                  <p className="mt-1"><strong>BRU:</strong> Bruno's native format (.bru)</p>
                </Help>
              </label>
              <select
                id="format"
                name="format"
                className="form-input"
                value={collectionFormat}
                onChange={(e) => setCollectionFormat(e.target.value)}
                disabled={isImporting}
              >
                <option value="yml">OpenCollection (YAML)</option>
                <option value="bru">BRU Format (.bru)</option>
              </select>
            </div>
          )}

          {detectedFormat === 'openapi' && (
            <div className="form-group">
              <div className="grouping-section">
                <div className="grouping-label">
                  <label className="form-label">Folder arrangement</label>
                  <div className="form-help">
                    Group by paths or tags from the spec.
                  </div>
                </div>
                <Dropdown onCreate={onDropdownCreate} icon={<GroupingDropdownIcon />} placement="bottom-start">
                  {groupingOptions.map((option) => (
                    <div
                      key={option.value}
                      className="dropdown-item"
                      onClick={() => {
                        dropdownTippyRef?.current?.hide();
                        setGroupingType(option.value);
                      }}
                    >
                      {option.label}
                    </div>
                  ))}
                </Dropdown>
              </div>
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={handleBack} disabled={isImporting}>
              Back
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleCancel} disabled={isImporting}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isImporting || !formik.values.collectionLocation}
            >
              {isImporting ? 'Importing...' : 'Import'}
            </button>
          </div>
        </form>
      </div>
    </StyledWrapper>
  );
};

export default ImportCollectionView;
