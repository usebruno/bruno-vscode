import React, { useEffect, useState, useRef, useCallback } from 'react';
import usePrevious from 'hooks/usePrevious';
import EnvironmentDetails from './EnvironmentDetails';
import { IconDownload, IconUpload, IconSearch, IconPlus, IconCheck, IconX, IconFileAlert } from '@tabler/icons';
import StyledWrapper from './StyledWrapper';
import ConfirmSwitchEnv from 'components/Environments/ConfirmSwitchEnv';
import ImportEnvironmentModal from 'components/Environments/Common/ImportEnvironmentModal';
import CollapsibleSection from 'components/Environments/CollapsibleSection';
import DotEnvFileDetails from 'components/Environments/DotEnvFileDetails';
import DotEnvFileEditor from 'components/Environments/DotEnvFileEditor';
import Button from 'ui/Button';
import { isEqual } from 'lodash';
import { useDispatch, useSelector } from 'react-redux';
import type { DotEnvFile, DotEnvVariable } from '@bruno-types';
import {
  addEnvironment,
  renameEnvironment,
  selectEnvironment,
  saveDotEnvVariables,
  saveDotEnvRaw,
  createDotEnvFile,
  deleteDotEnvFile
} from 'providers/ReduxStore/slices/collections/actions';
import { setEnvironmentsDraft, clearEnvironmentsDraft } from 'providers/ReduxStore/slices/collections';
import { addGlobalEnvironment, renameGlobalEnvironment, selectGlobalEnvironment } from 'providers/ReduxStore/slices/global-environments';
import { validateName, validateNameError } from 'utils/common/regex';
import toast from 'react-hot-toast';

const EMPTY_ARRAY: DotEnvFile[] = [];

const DOTENV_NAME_PREFIX = '.env';

const EnvironmentList = ({
  environments,
  activeEnvironmentUid,
  selectedEnvironment,
  setSelectedEnvironment,
  isModified,
  setIsModified,
  collection,
  setShowExportModal,
  isGlobal
}: any) => {
  const dispatch = useDispatch();

  const [openImportModal, setOpenImportModal] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [isCreatingInline, setIsCreatingInline] = useState(false);
  const [renamingEnvUid, setRenamingEnvUid] = useState<string | null>(null);
  const [newEnvName, setNewEnvName] = useState('');
  const [envNameError, setEnvNameError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const renameContainerRef = useRef<HTMLDivElement>(null);
  const createContainerRef = useRef<HTMLDivElement>(null);

  const [switchEnvConfirmClose, setSwitchEnvConfirmClose] = useState(false);

  const [environmentsExpanded, setEnvironmentsExpanded] = useState(true);
  const [dotEnvExpanded, setDotEnvExpanded] = useState(false);
  const [activeView, setActiveView] = useState<'environment' | 'dotenv'>('environment');
  const [isDotEnvModified, setIsDotEnvModified] = useState(false);
  const [dotEnvViewMode, setDotEnvViewMode] = useState<'table' | 'raw'>('table');
  const [selectedDotEnvFile, setSelectedDotEnvFile] = useState<string | null>(null);
  const [isCreatingDotEnvInline, setIsCreatingDotEnvInline] = useState(false);
  const [newDotEnvName, setNewDotEnvName] = useState(DOTENV_NAME_PREFIX);
  const [dotEnvNameError, setDotEnvNameError] = useState('');
  const dotEnvInputRef = useRef<HTMLInputElement>(null);
  const dotEnvCreateContainerRef = useRef<HTMLDivElement>(null);

  const dotEnvFiles = useSelector((state: any) => {
    if (isGlobal) return EMPTY_ARRAY;
    const coll = state.collections.collections.find((c: any) => c.uid === collection?.uid);
    return coll?.dotEnvFiles || EMPTY_ARRAY;
  });

  const envUids = environments ? environments.map((env: any) => env.uid) : [];
  const prevEnvUids = usePrevious(envUids);

  const environmentsDraftUid = collection?.environmentsDraft?.environmentUid;

  const handleDotEnvModifiedChange = useCallback((modified: boolean) => {
    setIsDotEnvModified(modified);
    if (modified) {
      dispatch(setEnvironmentsDraft({
        collectionUid: collection.uid,
        environmentUid: `dotenv:${selectedDotEnvFile}`,
        variables: []
      }));
    } else if (environmentsDraftUid?.startsWith('dotenv:')) {
      dispatch(clearEnvironmentsDraft({ collectionUid: collection.uid }));
    }
  }, [dispatch, collection?.uid, selectedDotEnvFile, environmentsDraftUid]);

  useEffect(() => {
    if (!dotEnvFiles.length) {
      setSelectedDotEnvFile(null);
      setActiveView('environment');
      handleDotEnvModifiedChange(false);
      return;
    }

    const fileExists = dotEnvFiles.some((file: DotEnvFile) => file.filename === selectedDotEnvFile);
    if (!selectedDotEnvFile || !fileExists) {
      setSelectedDotEnvFile(dotEnvFiles[0].filename);
    }
  }, [dotEnvFiles]);

  useEffect(() => {
    if (!environments?.length) {
      setSelectedEnvironment(null);
      return;
    }

    if (selectedEnvironment) {
      let _selectedEnvironment = environments?.find((env: any) => env?.uid === selectedEnvironment?.uid);

      if (!_selectedEnvironment) {
        _selectedEnvironment = environments?.find((env: any) => env?.name === selectedEnvironment?.name);
      }

      if (!_selectedEnvironment) {
        _selectedEnvironment = environments?.find((env: any) => env.uid === activeEnvironmentUid) || environments?.[0];
      }

      const hasSelectedEnvironmentChanged = !isEqual(selectedEnvironment, _selectedEnvironment);
      if (hasSelectedEnvironmentChanged || selectedEnvironment.uid !== _selectedEnvironment?.uid) {
        setSelectedEnvironment(_selectedEnvironment);
      }
      return;
    }

    const environment = environments?.find((env: any) => env.uid === activeEnvironmentUid) || environments?.[0];

    setSelectedEnvironment(environment);
  }, [environments, activeEnvironmentUid, selectedEnvironment]);

  useEffect(() => {
    if (prevEnvUids && prevEnvUids.length && envUids.length > prevEnvUids.length) {
      const newEnv = environments.find((env: any) => !prevEnvUids.includes(env.uid));
      if (newEnv) {
        setSelectedEnvironment(newEnv);
      }
    }

    if (prevEnvUids && prevEnvUids.length && envUids.length < prevEnvUids.length) {
      setSelectedEnvironment(environments && environments.length ? environments[0] : null);
    }
  }, [envUids, environments, prevEnvUids]);

  useEffect(() => {
    if (!renamingEnvUid) return;

    const handleClickOutside = (event: any) => {
      if (renameContainerRef.current && !renameContainerRef.current.contains(event.target)) {
        handleCancelRename();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [renamingEnvUid]);

  useEffect(() => {
    if (!isCreatingInline) return;

    const handleClickOutside = (event: any) => {
      if (createContainerRef.current && !createContainerRef.current.contains(event.target)) {
        handleCancelCreate();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCreatingInline]);

  useEffect(() => {
    if (!isCreatingDotEnvInline) return;

    const handleClickOutside = (event: any) => {
      if (dotEnvCreateContainerRef.current && !dotEnvCreateContainerRef.current.contains(event.target)) {
        handleCancelDotEnvCreate();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCreatingDotEnvInline]);

  const handleEnvironmentClick = (env: any) => {
    if (activeView === 'dotenv' && isDotEnvModified) {
      setSwitchEnvConfirmClose(true);
      return;
    }
    if (!isModified) {
      setSelectedEnvironment(env);
      setActiveView('environment');
      setEnvironmentsExpanded(true);
    } else {
      setSwitchEnvConfirmClose(true);
    }
  };

  const handleDotEnvClick = (filename: string) => {
    if (isModified) {
      setSwitchEnvConfirmClose(true);
      return;
    }
    if (activeView === 'dotenv' && isDotEnvModified && selectedDotEnvFile !== filename) {
      setSwitchEnvConfirmClose(true);
      return;
    }
    setSelectedDotEnvFile(filename);
    setActiveView('dotenv');
    setDotEnvExpanded(true);
  };

  const handleEnvironmentDoubleClick = (env: any) => {
    setRenamingEnvUid(env.uid);
    setNewEnvName(env.name);
    setEnvNameError('');
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  };

  const handleActivateEnvironment = (e: any, env: any) => {
    e.stopPropagation();
    const action = isGlobal
      ? selectGlobalEnvironment({ environmentUid: env.uid })
      : selectEnvironment(env.uid, collection.uid);
    (dispatch(action) as unknown as Promise<void>)
      .then(() => {
        toast.success(`Environment "${env.name}" activated`);
      })
      .catch(() => {
        toast.error('Failed to activate environment');
      });
  };

  const validateEnvironmentName = (name: any, excludeUid: string | null = null) => {
    if (!name || name.trim() === '') {
      return 'Name is required';
    }

    if (!validateName(name)) {
      return validateNameError(name);
    }

    const trimmedName = name.toLowerCase().trim();
    const isDuplicate = environments.some(
      (env: any) => env?.uid !== excludeUid && env?.name?.toLowerCase().trim() === trimmedName
    );
    if (isDuplicate) {
      return 'Environment already exists';
    }

    return null;
  };

  const handleCreateEnvClick = () => {
    if (!isModified && !isDotEnvModified) {
      setIsCreatingInline(true);
      setNewEnvName('');
      setEnvNameError('');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setSwitchEnvConfirmClose(true);
    }
  };

  const handleCancelCreate = () => {
    setIsCreatingInline(false);
    setNewEnvName('');
    setEnvNameError('');
  };

  const handleSaveNewEnv = () => {
    const error = validateEnvironmentName(newEnvName);
    if (error) {
      setEnvNameError(error);
      return;
    }

    const action = isGlobal
      ? addGlobalEnvironment({ name: newEnvName })
      : addEnvironment(newEnvName, collection.uid);
    (dispatch(action) as unknown as Promise<void>)
      .then(() => {
        toast.success(isGlobal ? 'Global environment created!' : 'Environment created!');
        setIsCreatingInline(false);
        setNewEnvName('');
        setEnvNameError('');
      })
      .catch(() => {
        toast.error('An error occurred while creating the environment');
      });
  };

  const handleEnvNameChange = (e: any) => {
    const value = e.target.value;
    setNewEnvName(value);

    if (envNameError) {
      setEnvNameError('');
    }
  };

  const handleEnvNameKeyDown = (e: any) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (renamingEnvUid) {
        handleSaveRename();
      } else {
        handleSaveNewEnv();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (renamingEnvUid) {
        handleCancelRename();
      } else {
        handleCancelCreate();
      }
    }
  };

  const handleSaveRename = () => {
    const error = validateEnvironmentName(newEnvName, renamingEnvUid);
    if (error) {
      setEnvNameError(error);
      return;
    }

    const action = isGlobal
      ? renameGlobalEnvironment({ name: newEnvName, environmentUid: renamingEnvUid })
      : renameEnvironment(newEnvName, renamingEnvUid, collection.uid);
    (dispatch(action) as unknown as Promise<void>)
      .then(() => {
        toast.success('Environment renamed!');
        setRenamingEnvUid(null);
        setNewEnvName('');
        setEnvNameError('');
      })
      .catch(() => {
        toast.error('An error occurred while renaming the environment');
      });
  };

  const handleCancelRename = () => {
    setRenamingEnvUid(null);
    setNewEnvName('');
    setEnvNameError('');
  };

  const handleImportClick = () => {
    if (!isModified && !isDotEnvModified) {
      setOpenImportModal(true);
    } else {
      setSwitchEnvConfirmClose(true);
    }
  };

  const handleExportClick = () => {
    if (setShowExportModal) {
      setShowExportModal(true);
    }
  };

  const handleConfirmSwitch = (saveChanges: any) => {
    if (!saveChanges) {
      setSwitchEnvConfirmClose(false);
    }
  };

  const handleSaveDotEnv = (variables: DotEnvVariable[]) => {
    if (!selectedDotEnvFile) return Promise.reject(new Error('No file selected'));
    return dispatch(saveDotEnvVariables(collection.uid, variables, selectedDotEnvFile)) as unknown as Promise<unknown>;
  };

  const handleSaveDotEnvRaw = (content: string) => {
    if (!selectedDotEnvFile) return Promise.reject(new Error('No file selected'));
    return dispatch(saveDotEnvRaw(collection.uid, content, selectedDotEnvFile)) as unknown as Promise<unknown>;
  };

  const handleCreateDotEnvInlineClick = () => {
    if (isModified || isDotEnvModified) {
      setSwitchEnvConfirmClose(true);
      return;
    }
    setIsCreatingDotEnvInline(true);
    setNewDotEnvName(DOTENV_NAME_PREFIX);
    setDotEnvNameError('');
    setTimeout(() => {
      const input = dotEnvInputRef.current;
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    }, 50);
  };

  const handleCancelDotEnvCreate = () => {
    setIsCreatingDotEnvInline(false);
    setNewDotEnvName(DOTENV_NAME_PREFIX);
    setDotEnvNameError('');
  };

  const validateDotEnvName = (name: string) => {
    if (!name || name.trim() === '') {
      return 'Name is required';
    }

    if (!name.startsWith(DOTENV_NAME_PREFIX)) {
      return 'File name must start with .env';
    }

    // Same rule as isValidDotEnvFilename on the extension side
    if (!/^\.env(\.[a-zA-Z0-9._-]+)?$/.test(name)) {
      return 'File name must be .env or .env.<suffix>';
    }

    if (dotEnvFiles.some((file: DotEnvFile) => file.filename === name)) {
      return 'File already exists';
    }

    return null;
  };

  const handleSaveNewDotEnv = () => {
    const error = validateDotEnvName(newDotEnvName);
    if (error) {
      setDotEnvNameError(error);
      return;
    }

    (dispatch(createDotEnvFile(collection.uid, newDotEnvName)) as unknown as Promise<void>)
      .then(() => {
        toast.success(`${newDotEnvName} file created!`);
        setIsCreatingDotEnvInline(false);
        setSelectedDotEnvFile(newDotEnvName);
        setNewDotEnvName(DOTENV_NAME_PREFIX);
        setDotEnvNameError('');
        setActiveView('dotenv');
        setDotEnvExpanded(true);
      })
      .catch((error: Error) => {
        toast.error(error.message || 'Failed to create .env file');
      });
  };

  const handleDotEnvNameChange = (e: any) => {
    const value = e.target.value;
    setNewDotEnvName(value.startsWith(DOTENV_NAME_PREFIX) ? value : DOTENV_NAME_PREFIX);
    if (dotEnvNameError) {
      setDotEnvNameError('');
    }
  };

  const handleDotEnvNameKeyDown = (e: any) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveNewDotEnv();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelDotEnvCreate();
    } else if (e.key === 'Backspace') {
      const input = e.target;
      if (input.selectionStart <= DOTENV_NAME_PREFIX.length && input.selectionEnd <= DOTENV_NAME_PREFIX.length) {
        e.preventDefault();
      }
    }
  };

  const handleDeleteDotEnvFile = (filename: string) => {
    (dispatch(deleteDotEnvFile(collection.uid, filename)) as unknown as Promise<void>)
      .then(() => {
        toast.success(`${filename} file deleted!`);
        handleDotEnvModifiedChange(false);

        const remainingFiles = dotEnvFiles.filter((file: DotEnvFile) => file.filename !== filename);
        if (remainingFiles.length) {
          setSelectedDotEnvFile(remainingFiles[0].filename);
          return;
        }

        setActiveView('environment');
        if (environments?.length) {
          setSelectedEnvironment(environments.find((env: any) => env.uid === activeEnvironmentUid) || environments[0]);
        }
      })
      .catch((error: Error) => {
        toast.error(error.message || 'Failed to delete .env file');
      });
  };

  const filteredEnvironments
    = environments?.filter((env: any) => env.name.toLowerCase().includes(searchText.toLowerCase())) || [];

  const selectedDotEnvData = dotEnvFiles.find((file: DotEnvFile) => file.filename === selectedDotEnvFile);

  const renderContent = () => {
    if (activeView === 'dotenv' && selectedDotEnvData) {
      return (
        <DotEnvFileDetails
          title={selectedDotEnvData.filename}
          onDelete={() => handleDeleteDotEnvFile(selectedDotEnvData.filename)}
          viewMode={dotEnvViewMode}
          onViewModeChange={setDotEnvViewMode}
        >
          <DotEnvFileEditor
            variables={selectedDotEnvData.variables || []}
            content={selectedDotEnvData.content}
            onSave={handleSaveDotEnv}
            onSaveRaw={handleSaveDotEnvRaw}
            setIsModified={handleDotEnvModifiedChange}
            viewMode={dotEnvViewMode}
            collection={collection}
          />
        </DotEnvFileDetails>
      );
    }

    if (selectedEnvironment) {
      return (
        <EnvironmentDetails
          environment={selectedEnvironment}
          setIsModified={setIsModified}
          collection={collection}
          isGlobal={isGlobal}
        />
      );
    }

    return (
      <div className="empty-state">
        <IconFileAlert size={48} strokeWidth={1.5} />
        <div className="title">No Environments</div>
        <div className="actions">
          <Button size="sm" color="secondary" onClick={handleCreateEnvClick}>
            Create Environment
          </Button>
          <Button size="sm" color="secondary" onClick={handleImportClick}>
            Import Environment
          </Button>
        </div>
      </div>
    );
  };

  return (
    <StyledWrapper>
      {openImportModal && (
        <ImportEnvironmentModal type={isGlobal ? 'global' : 'collection'} collection={collection} onClose={() => setOpenImportModal(false)} />
      )}

      <div className="environments-container">
        {switchEnvConfirmClose && (
          <div className="confirm-switch-overlay">
            <ConfirmSwitchEnv onCancel={() => handleConfirmSwitch(false)} />
          </div>
        )}

        <div className="sidebar">
          <div className="sections-container">
            <CollapsibleSection
              title="Environments"
              expanded={environmentsExpanded}
              onToggle={() => setEnvironmentsExpanded(!environmentsExpanded)}
              actions={(
                <>
                  <button
                    type="button"
                    className="btn-action"
                    onClick={() => {
                      setEnvironmentsExpanded(true);
                      handleCreateEnvClick();
                    }}
                    title="Create environment"
                  >
                    <IconPlus size={14} strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    className="btn-action"
                    onClick={() => {
                      setEnvironmentsExpanded(true);
                      handleImportClick();
                    }}
                    title="Import environment"
                  >
                    <IconDownload size={14} strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    className="btn-action"
                    onClick={() => {
                      setEnvironmentsExpanded(true);
                      handleExportClick();
                    }}
                    title="Export environment"
                  >
                    <IconUpload size={14} strokeWidth={1.5} />
                  </button>
                </>
              )}
            >
              <div className="env-list-search">
                <IconSearch size={13} strokeWidth={1.5} className="env-list-search-icon" />
                <input
                  type="text"
                  placeholder="Search environments..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="env-list-search-input"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                />
                {searchText && (
                  <button
                    className="env-list-search-clear"
                    title="Clear search"
                    onClick={() => setSearchText('')}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <IconX size={12} strokeWidth={1.5} />
                  </button>
                )}
              </div>

              <div className="environments-list">
                {filteredEnvironments.map((env: any) => <div
                  key={env.uid}
                  id={env.uid}
                  className={`environment-item ${activeView === 'environment' && selectedEnvironment?.uid === env.uid ? 'active' : ''} ${renamingEnvUid === env.uid ? 'renaming' : ''} ${activeEnvironmentUid === env.uid ? 'activated' : ''}`}
                  onClick={() => renamingEnvUid !== env.uid && handleEnvironmentClick(env)}
                  onDoubleClick={() => handleEnvironmentDoubleClick(env)}
                >
                  {renamingEnvUid === env.uid ? (
                    <div className="rename-container" ref={renameContainerRef}>
                      <input
                        ref={inputRef}
                        type="text"
                        className="environment-name-input"
                        value={newEnvName}
                        onChange={handleEnvNameChange}
                        onKeyDown={handleEnvNameKeyDown}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck="false"
                      />
                      <div className="inline-actions">
                        <button
                          className="inline-action-btn save"
                          onClick={handleSaveRename}
                          onMouseDown={(e) => e.preventDefault()}
                          title="Save"
                        >
                          <IconCheck size={14} strokeWidth={2} />
                        </button>
                        <button
                          className="inline-action-btn cancel"
                          onClick={handleCancelRename}
                          onMouseDown={(e) => e.preventDefault()}
                          title="Cancel"
                        >
                          <IconX size={14} strokeWidth={2} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="environment-name">{env.name}</span>
                      <div className="environment-actions">
                        {activeEnvironmentUid === env.uid ? (
                          <div className="activated-checkmark" title="Active environment">
                            <IconCheck size={16} strokeWidth={2} />
                          </div>
                        ) : (
                          <button
                            className="activate-btn"
                            onClick={(e) => handleActivateEnvironment(e, env)}
                            title="Activate environment"
                          >
                            <IconCheck size={16} strokeWidth={2} />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>)}

                {isCreatingInline && (
                  <div className="environment-item creating" ref={createContainerRef}>
                    <input
                      ref={inputRef}
                      type="text"
                      className="environment-name-input"
                      value={newEnvName}
                      onChange={handleEnvNameChange}
                      onKeyDown={handleEnvNameKeyDown}
                      placeholder="Environment name..."
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                    />
                    <div className="inline-actions">
                      <button
                        className="inline-action-btn save"
                        onClick={handleSaveNewEnv}
                        onMouseDown={(e) => e.preventDefault()}
                        title="Save"
                      >
                        <IconCheck size={14} strokeWidth={2} />
                      </button>
                      <button
                        className="inline-action-btn cancel"
                        onClick={handleCancelCreate}
                        onMouseDown={(e) => e.preventDefault()}
                        title="Cancel"
                      >
                        <IconX size={14} strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                )}

                {envNameError && (isCreatingInline || renamingEnvUid) && <div className="env-error">{envNameError}</div>}

                {!filteredEnvironments.length && !isCreatingInline && (
                  <div className="no-env-file">
                    <span>No environments</span>
                  </div>
                )}
              </div>
            </CollapsibleSection>

            {!isGlobal && (
              <CollapsibleSection
                title=".env Files"
                testId="dotenv-files-section"
                expanded={dotEnvExpanded}
                onToggle={() => setDotEnvExpanded(!dotEnvExpanded)}
                badge={dotEnvFiles.length}
                actions={(
                  <button
                    type="button"
                    className="btn-action"
                    onClick={handleCreateDotEnvInlineClick}
                    title="Create .env file"
                    data-testid="create-dotenv-file"
                  >
                    <IconPlus size={14} strokeWidth={1.5} />
                  </button>
                )}
              >
                <div className="environments-list">
                  {dotEnvFiles.map((file: DotEnvFile) => (
                    <div
                      key={file.filename}
                      className={`environment-item ${activeView === 'dotenv' && selectedDotEnvFile === file.filename ? 'active' : ''}`}
                      onClick={() => handleDotEnvClick(file.filename)}
                      data-testid={`dotenv-file-${file.filename}`}
                    >
                      <span className="environment-name">{file.filename}</span>
                    </div>
                  ))}

                  {isCreatingDotEnvInline && (
                    <div className="environment-item creating" ref={dotEnvCreateContainerRef}>
                      <input
                        ref={dotEnvInputRef}
                        type="text"
                        className="environment-name-input"
                        data-testid="dotenv-name-input"
                        value={newDotEnvName}
                        onChange={handleDotEnvNameChange}
                        onKeyDown={handleDotEnvNameKeyDown}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck="false"
                      />
                      <div className="inline-actions">
                        <button
                          className="inline-action-btn save"
                          onClick={handleSaveNewDotEnv}
                          onMouseDown={(e) => e.preventDefault()}
                          title="Create"
                        >
                          <IconCheck size={14} strokeWidth={2} />
                        </button>
                        <button
                          className="inline-action-btn cancel"
                          onClick={handleCancelDotEnvCreate}
                          onMouseDown={(e) => e.preventDefault()}
                          title="Cancel"
                        >
                          <IconX size={14} strokeWidth={2} />
                        </button>
                      </div>
                    </div>
                  )}

                  {dotEnvNameError && isCreatingDotEnvInline && <div className="env-error">{dotEnvNameError}</div>}

                  {!dotEnvFiles.length && !isCreatingDotEnvInline && (
                    <div className="no-env-file">
                      <span>No .env files</span>
                    </div>
                  )}
                </div>
              </CollapsibleSection>
            )}
          </div>
        </div>

        {renderContent()}
      </div>
    </StyledWrapper>
  );
};

export default EnvironmentList;
