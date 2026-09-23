import React, { useRef, useState, useEffect, forwardRef } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import toast from 'react-hot-toast';
import { IconFileImport, IconCaretDown, IconLoader2, IconCheck, IconX, IconSearch } from '@tabler/icons';
import jsyaml from 'js-yaml';
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
import {
  browseDirectory,
  importCollection,
  importCollectionFromZip,
  validateAndSaveZip
} from '../../ipc-actions';
import { useBootstrap, getDefaultLocation } from '../../data-hooks';
import StyledWrapper from './StyledWrapper';

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

const detectFormat = (data: any): string | null => {
  if (isOpenApiSpec(data)) return 'openapi';
  if (isWSDLCollection(data)) return 'wsdl';
  if (isPostmanCollection(data)) return 'postman';
  if (isInsomniaCollection(data)) return 'insomnia';
  if (isOpenCollection(data)) return 'opencollection';
  if (isBrunoCollection(data)) return 'bruno';
  return null;
};

interface ImportFileEntry {
  uid: string;
  fileName: string;
  format: string;
  rawData: any;
  name: string;
}

type ImportStatus = 'loading' | 'success' | 'error';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownTippyRef = useRef<{ hide: () => void } | null>(null);

  const [step, setStep] = useState<'file-select' | 'configure'>('file-select');
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  const [rawData, setRawData] = useState<any>(null);
  const [detectedFormat, setDetectedFormat] = useState<string>('');
  const [groupingType, setGroupingType] = useState('tags');
  const [collectionFormat, setCollectionFormat] = useState('yml');

  const [multiFiles, setMultiFiles] = useState<ImportFileEntry[]>([]);
  const [skippedFiles, setSkippedFiles] = useState<string[]>([]);
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [importStarted, setImportStarted] = useState(false);
  const [importStatus, setImportStatus] = useState<Record<string, ImportStatus>>({});
  const [importErrors, setImportErrors] = useState<Record<string, string>>({});

  const bootstrap = useBootstrap();
  const defaultLocation = getDefaultLocation(bootstrap);

  const isMultiple = multiFiles.length > 0;
  const selectedFiles = multiFiles.filter((f) => selectedUids.includes(f.uid));

  const query = searchQuery.trim().toLowerCase();
  const visibleFiles = query
    ? multiFiles.filter(
        (f) => f.name.toLowerCase().includes(query) || f.fileName.toLowerCase().includes(query)
      )
    : multiFiles;
  const visibleSelectedCount = visibleFiles.filter((f) => selectedUids.includes(f.uid)).length;
  const allVisibleSelected = visibleFiles.length > 0 && visibleSelectedCount === visibleFiles.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

  const showGrouping = isMultiple
    ? selectedFiles.some((f) => f.format === 'openapi')
    : detectedFormat === 'openapi';
  const finishedCount = selectedFiles.filter((f) => importStatus[f.uid] && importStatus[f.uid] !== 'loading').length;
  const importDone = importStarted && finishedCount === selectedFiles.length;
  const importedCount = selectedFiles.filter((f) => importStatus[f.uid] === 'success').length;

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
      if (isMultiple) {
        return importSelectedCollections(values.collectionLocation);
      }

      setIsImporting(true);
      try {
        if (detectedFormat === 'bruno-zip') {
          await importCollectionFromZip(rawData.zipFilePath, values.collectionLocation);
        } else {
          const convertedCollection = await convertCollection(detectedFormat, rawData, groupingType);
          await importCollection(convertedCollection, values.collectionLocation, collectionFormat);
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

  const importSelectedCollections = async (collectionLocation: string) => {
    const entries = selectedFiles;
    setImportStarted(true);
    setIsImporting(true);
    setImportErrors({});
    setImportStatus(Object.fromEntries(entries.map((f) => [f.uid, 'loading' as ImportStatus])));

    let imported = 0;
    for (const entry of entries) {
      try {
        const converted = await convertCollection(entry.format, entry.rawData, groupingType);
        converted.uid = entry.uid;
        const result = await importCollection([converted], collectionLocation, collectionFormat);
        if (result.failures.length > 0) {
          throw new Error(result.failures[0].message);
        }
        imported++;
        setImportStatus((prev) => ({ ...prev, [entry.uid]: 'success' }));
      } catch (e: any) {
        setImportStatus((prev) => ({ ...prev, [entry.uid]: 'error' }));
        setImportErrors((prev) => ({ ...prev, [entry.uid]: formatIpcError(e) || 'Failed to import collection' }));
      }
    }

    setIsImporting(false);
    const failed = entries.length - imported;
    if (failed === 0) {
      toast.success(`${imported} collection${imported === 1 ? '' : 's'} imported successfully`);
    } else {
      toast.error(`${imported} of ${entries.length} collections imported, ${failed} failed`);
    }
  };

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
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);

      const result = await validateAndSaveZip(base64Data, file.name);

      if (!result || !result.valid) {
        throw new Error('The ZIP file is not a valid Bruno collection');
      }

      const zipCollectionName = file.name.replace(/\.zip$/i, '');
      setRawData({ zipFilePath: result.tempZipPath, collectionName: zipCollectionName });
      setDetectedFormat('bruno-zip');
      setStep('configure');
    } catch (err) {
      toastError(err, 'Import ZIP file failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const processFile = async (file: File) => {
    if (file.name.endsWith('.zip')) {
      return processZipFile(file);
    }

    setIsProcessing(true);
    try {
      const data = await convertFileToObject(file);
      if (!data) throw new Error('Failed to parse file content');

      const type = detectFormat(data);
      if (!type) throw new Error('Unsupported collection format');

      setRawData(data);
      setDetectedFormat(type);
      setStep('configure');
    } catch (err) {
      toastError(err, 'Import collection failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const processMultipleFiles = async (fileArray: File[]) => {
    setIsProcessing(true);
    try {
      const entries: ImportFileEntry[] = [];
      const skipped: string[] = [];

      for (let index = 0; index < fileArray.length; index++) {
        const file = fileArray[index];
        try {
          const data = await convertFileToObject(file);
          const format = data ? detectFormat(data) : null;
          if (!format) {
            skipped.push(file.name);
            continue;
          }
          entries.push({
            uid: `file-${index}`,
            fileName: file.name,
            format,
            rawData: data,
            name: getCollectionName(format, data)
          });
        } catch (err) {
          console.warn(`Failed to process file ${file.name}:`, err);
          skipped.push(file.name);
        }
      }

      if (entries.length === 0) {
        throw new Error('No valid collections found in the selected files');
      }

      setMultiFiles(entries);
      setSkippedFiles(skipped);
      setSelectedUids(entries.map((e) => e.uid));
      setStep('configure');
    } catch (err) {
      toastError(err, 'Import collections failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const processFiles = async (fileList: FileList) => {
    const fileArray = Array.from(fileList);
    const zipFiles = fileArray.filter((file) => file.name.endsWith('.zip'));

    if (zipFiles.length > 0 && zipFiles.length < fileArray.length) {
      toast.error('ZIP files cannot be mixed with other files. Select a single ZIP file or one or more JSON, YAML or WSDL files.');
      return;
    }
    if (zipFiles.length > 1) {
      toast.error('Only one ZIP file can be imported at a time.');
      return;
    }
    if (zipFiles.length === 1) {
      return processZipFile(zipFiles[0]);
    }
    if (fileArray.length > 1) {
      return processMultipleFiles(fileArray);
    }
    if (fileArray.length === 1) {
      return processFile(fileArray[0]);
    }
  };

  const toggleCollection = (uid: string) => {
    setSelectedUids((prev) => (prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]));
  };

  const toggleAllCollections = () => {
    const visibleUids = visibleFiles.map((f) => f.uid);
    setSelectedUids((prev) =>
      allVisibleSelected
        ? prev.filter((uid) => !visibleUids.includes(uid))
        : Array.from(new Set([...prev, ...visibleUids]))
    );
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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const handleBrowseFiles = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleCancel = () => {
    ipcRenderer.send('import-collection:close');
  };

  const handleBack = () => {
    setStep('file-select');
    setRawData(null);
    setDetectedFormat('');
    setMultiFiles([]);
    setSkippedFiles([]);
    setSelectedUids([]);
    setSearchQuery('');
    setImportStarted(false);
    setImportStatus({});
    setImportErrors({});
  };

  const browse = () => {
    browseDirectory()
      .then((dirPath) => {
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
        <div className="import-collection-container" data-testid="import-collection-container">
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
        <div className="import-collection-container" data-testid="import-collection-container">
          <div className="import-collection-header">
            <div>
              <h1>
                <IconFileImport size={18} strokeWidth={1.5} />
                Import Collection
              </h1>
              <p>
                Supports Bruno, OpenCollection, Postman, Insomnia, OpenAPI v3, WSDL, and ZIP formats.
              </p>
            </div>
            <button type="button" className="close-button" onClick={handleCancel} aria-label="Close">
              <IconX size={18} strokeWidth={1.5} />
            </button>
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
              data-testid="import-file-input"
              multiple
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

  if (importStarted) {
    return (
      <StyledWrapper>
        <div className="import-collection-container" data-testid="import-collection-container">
          <div className="import-collection-header">
            <h1>
              <IconFileImport size={18} strokeWidth={1.5} />
              Bulk Import
            </h1>
            <button
              type="button"
              className="close-button"
              onClick={handleCancel}
              disabled={!importDone}
              aria-label="Close"
            >
              <IconX size={18} strokeWidth={1.5} />
            </button>
          </div>

          <div className="import-form">
            <div className="location-row">
              <label htmlFor="collectionLocation" className="form-label">Location</label>
              <input
                id="collectionLocation"
                data-testid="import-collection-location"
                type="text"
                className="form-input"
                value={formik.values.collectionLocation}
                readOnly
              />
            </div>

            <div className="form-group">
              <div className="section-title">
                Importing Collections ({selectedFiles.length})
              </div>
              <div className="selected-count" data-testid="import-progress-summary">
                {importDone
                  ? `${importedCount} of ${selectedFiles.length} collections imported`
                  : `Importing ${finishedCount + 1} of ${selectedFiles.length} collections...`}
              </div>
              <div className="collection-list bordered">
                {selectedFiles.map((entry) => {
                  const status = importStatus[entry.uid];
                  return (
                    <div className="collection-row" key={entry.uid} data-testid="import-collection-row" data-status={status}>
                      <span className={`status-icon ${status}`}>
                        {status === 'success' && <IconCheck size={16} strokeWidth={2} />}
                        {status === 'error' && <IconX size={16} strokeWidth={2} />}
                        {status === 'loading' && <IconLoader2 size={16} className="animate-spin" strokeWidth={2} />}
                      </span>
                      <div className="collection-row-info">
                        <span className="collection-name">{entry.name}</span>
                        {status === 'error' && (
                          <span className="collection-error">{importErrors[entry.uid]}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-primary"
                data-testid="import-close"
                onClick={handleCancel}
                disabled={!importDone}
              >
                {importDone ? 'Close' : 'Importing...'}
              </button>
            </div>
          </div>
        </div>
      </StyledWrapper>
    );
  }

  return (
    <StyledWrapper>
      <div className="import-collection-container" data-testid="import-collection-container">
        <div className="import-collection-header">
          <h1>
            <IconFileImport size={18} strokeWidth={1.5} />
            {isMultiple ? 'Bulk Import' : 'Import Collection'}
          </h1>
          <button type="button" className="close-button" onClick={handleCancel} disabled={isImporting} aria-label="Close">
            <IconX size={18} strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={formik.handleSubmit} className="import-form">
          {isMultiple ? (
            <div className="form-group">
              <div className="section-title">
                Collections
                <span className="count-badge">{multiFiles.length}</span>
              </div>

              <div className="collection-panel">
                <div className="collection-panel-toolbar">
                  <div className="search-box">
                    <IconSearch size={14} strokeWidth={1.5} />
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Search Collections"
                      data-testid="import-search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      disabled={isImporting}
                    />
                  </div>
                  <label className="select-all">
                    <input
                      type="checkbox"
                      data-testid="import-select-all"
                      checked={allVisibleSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someVisibleSelected;
                      }}
                      onChange={toggleAllCollections}
                      disabled={isImporting || visibleFiles.length === 0}
                    />
                    Select all
                  </label>
                </div>

                <div className="collection-list">
                  {visibleFiles.map((entry) => (
                    <label className="collection-row" key={entry.uid} data-testid="import-collection-row">
                      <input
                        type="checkbox"
                        data-testid="import-collection-checkbox"
                        checked={selectedUids.includes(entry.uid)}
                        onChange={() => toggleCollection(entry.uid)}
                        disabled={isImporting}
                      />
                      <div className="collection-row-info">
                        <span className="collection-name">{entry.name}</span>
                        <span className="collection-file">{entry.fileName}</span>
                      </div>
                    </label>
                  ))}
                  {visibleFiles.length === 0 && (
                    <div className="collection-list-empty">No collections match “{searchQuery}”</div>
                  )}
                </div>
              </div>

              <div className="selected-count" data-testid="import-selected-count">
                <strong>{selectedUids.length}</strong> of {multiFiles.length} selected
              </div>

              {skippedFiles.length > 0 && (
                <div className="form-help">
                  Skipped {skippedFiles.length} unsupported or unreadable file{skippedFiles.length === 1 ? '' : 's'}: {skippedFiles.join(', ')}
                </div>
              )}
            </div>
          ) : (
            <div className="collection-summary">
              <span className="collection-name">{collectionName}</span>
              <span className="detected-format">
                {FORMAT_LABELS[detectedFormat] || detectedFormat}
              </span>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="collectionLocation" className="form-label">
              Location
            </label>
            <div className="location-input-group">
              <input
                id="collectionLocation"
                data-testid="import-collection-location"
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
                data-testid="import-browse-button"
                onClick={browse}
                disabled={isImporting}
              >
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

          {showGrouping && (
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
              data-testid="import-submit"
              disabled={isImporting || !formik.values.collectionLocation || (isMultiple && selectedUids.length === 0)}
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
