import React, { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import styled from 'styled-components';
import { IconUpload, IconLoader2, IconAlertTriangle, IconShare } from '@tabler/icons';
import Bruno from 'components/Bruno';
import OpenCollectionIcon from 'components/Icons/OpenCollectionIcon';
import { cloneDeep, each, get } from 'lodash';
import { findCollectionByUid, areItemsLoading } from 'utils/collections/index';
import { ipcRenderer } from 'utils/ipc';
import toast from 'react-hot-toast';

const StyledWrapper = styled.div`
  width: 100%;
  min-height: 100vh;
  background-color: var(--vscode-editor-background, ${(props: any) => props.theme?.bg || '#1e1e1e'});
  color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
  font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  font-size: 13px;
  padding: 32px;

  .export-container {
    max-width: 560px;
    margin: 0 auto;
  }

  .export-header {
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

  .export-options {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .export-option {
    display: flex;
    align-items: center;
    padding: 16px;
    border: 1px solid var(--vscode-input-border, ${(props: any) => props.theme?.input?.border || '#454545'});
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    background-color: var(--vscode-editor-background, ${(props: any) => props.theme?.bg || '#1e1e1e'});

    &:hover:not(.disabled) {
      border-color: var(--vscode-focusBorder, ${(props: any) => props.theme?.button?.primary?.bg || '#007acc'});
      background-color: var(--vscode-list-hoverBackground, ${(props: any) => props.theme?.sidebar?.collection?.item?.hoverBg || '#2d2d2d'});
    }

    &.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .icon-container {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background-color: var(--vscode-input-background, ${(props: any) => props.theme?.input?.bg || '#3c3c3c'});
      margin-right: 16px;
    }

    .option-content {
      flex: 1;
    }

    .option-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
      margin-bottom: 4px;
    }

    .option-description {
      font-size: 12px;
      color: var(--vscode-descriptionForeground, ${(props: any) => props.theme?.textMuted || '#999999'});
    }

    .warning-badge {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border-radius: 4px;
      background-color: rgba(245, 158, 11, 0.1);
      color: #f59e0b;
      font-size: 11px;
      margin-left: 12px;
    }
  }

  .form-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 32px;
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
`;

const deleteUidsInItems = (items: any[]) => {
  each(items, (item) => {
    delete item.uid;

    if (['http-request', 'graphql-request', 'grpc-request'].includes(item.type)) {
      each(get(item, 'request.headers'), (header: any) => delete header.uid);
      each(get(item, 'request.params'), (param: any) => delete param.uid);
      each(get(item, 'request.vars.req'), (v: any) => delete v.uid);
      each(get(item, 'request.vars.res'), (v: any) => delete v.uid);
      each(get(item, 'request.vars.assertions'), (a: any) => delete a.uid);
      each(get(item, 'request.body.multipartForm'), (param: any) => delete param.uid);
      each(get(item, 'request.body.formUrlEncoded'), (param: any) => delete param.uid);
      each(get(item, 'request.body.file'), (param: any) => delete param.uid);

      each(get(item, 'examples'), (example: any) => {
        delete example.uid;
        delete example.itemUid;
        each(get(example, 'request.headers'), (header: any) => delete header.uid);
        each(get(example, 'request.params'), (param: any) => delete param.uid);
        each(get(example, 'request.body.multipartForm'), (param: any) => delete param.uid);
        each(get(example, 'request.body.formUrlEncoded'), (param: any) => delete param.uid);
        each(get(example, 'request.body.file'), (param: any) => delete param.uid);
        each(get(example, 'response.headers'), (header: any) => delete header.uid);
      });
    }

    if (item.items && item.items.length) {
      deleteUidsInItems(item.items);
    }
  });
};

const transformItem = (items: any[] = []) => {
  each(items, (item) => {
    if (['http-request', 'graphql-request', 'grpc-request', 'ws-request'].includes(item.type)) {
      if (item.type === 'graphql-request') item.type = 'graphql';
      if (item.type === 'http-request') item.type = 'http';
      if (item.type === 'grpc-request') item.type = 'grpc';
      if (item.type === 'ws-request') item.type = 'ws';
    }

    each(get(item, 'examples'), (example: any) => {
      if (example.type === 'graphql-request') example.type = 'graphql';
      else if (example.type === 'http-request') example.type = 'http';
      else if (example.type === 'grpc-request') example.type = 'grpc';
      else if (example.type === 'ws-request') example.type = 'ws';
    });

    if (item.items && item.items.length) {
      transformItem(item.items);
    }
  });
};

const deleteUidsInEnvs = (envs: any[]) => {
  each(envs, (env) => {
    delete env.uid;
    each(env.variables, (variable: any) => delete variable.uid);
  });
};

const deleteSecretsInEnvs = (envs: any[]) => {
  each(envs, (env) => {
    each(env.variables, (variable: any) => {
      if (variable.secret) variable.value = '';
    });
  });
};

const prepareCollectionForExport = (collection: any) => {
  const collectionCopy = cloneDeep(collection);

  delete collectionCopy.uid;
  delete collectionCopy.processEnvVariables;
  delete collectionCopy.pathname;
  delete collectionCopy.collapsed;
  delete collectionCopy.mountStatus;

  if (collectionCopy.items) {
    deleteUidsInItems(collectionCopy.items);
    transformItem(collectionCopy.items);
  }
  if (collectionCopy.environments) {
    deleteUidsInEnvs(collectionCopy.environments);
    deleteSecretsInEnvs(collectionCopy.environments);
  }

  collectionCopy.exportedAt = new Date().toISOString();
  collectionCopy.exportedUsing = 'Bruno VS Code Extension';

  return collectionCopy;
};

interface ExportCollectionViewProps {
  collection: any;
}

const ExportCollectionView: React.FC<ExportCollectionViewProps> = ({ collection }) => {
  const [isExporting, setIsExporting] = useState(false);
  const isCollectionLoading = areItemsLoading(collection);

  const hasNonExportableRequestTypes = useMemo(() => {
    const types = new Set<string>();
    const checkItem = (item: any): boolean => {
      if (item.type === 'grpc-request') {
        types.add('gRPC');
        return true;
      }
      if (item.type === 'ws-request') {
        types.add('WebSocket');
        return true;
      }
      if (item.items) {
        return item.items.some(checkItem);
      }
      return false;
    };
    return {
      has: collection?.items?.filter(checkItem).length || false,
      types: [...types]
    };
  }, [collection]);

  const handleExportBrunoCollection = async () => {
    if (isCollectionLoading || isExporting) return;

    setIsExporting(true);
    try {
      const exportData = prepareCollectionForExport(collection);
      const content = JSON.stringify(exportData, null, 2);

      const result = await ipcRenderer.invoke('sidebar:save-file', {
        defaultFileName: `${collection.name}.json`,
        content,
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      });

      if (result) {
        toast.success('Collection exported successfully');
        ipcRenderer.send('export-collection:close');
      }
    } catch (error) {
      console.error('Error exporting collection:', error);
      toast.error('Failed to export collection');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPostmanCollection = async () => {
    if (isCollectionLoading || isExporting) return;

    setIsExporting(true);
    try {
      const exportData = prepareCollectionForExport(collection);
      const content = JSON.stringify(exportData, null, 2);

      const result = await ipcRenderer.invoke('sidebar:save-file', {
        defaultFileName: `${collection.name}_postman.json`,
        content,
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      });

      if (result) {
        toast.success('Collection exported in Postman format');
        ipcRenderer.send('export-collection:close');
      }
    } catch (error) {
      console.error('Error exporting collection:', error);
      toast.error('Failed to export collection');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCancel = () => {
    ipcRenderer.send('export-collection:close');
  };

  const isDisabled = isCollectionLoading || isExporting;

  return (
    <StyledWrapper>
      <div className="export-container">
        <div className="export-header">
          <h1>
            <IconShare size={22} strokeWidth={1.5} />
            Export Collection
          </h1>
          <p>
            Export "{collection?.name || 'collection'}" to share with others or use in other tools.
          </p>
        </div>

        <div className="export-options">
          <div
            className={`export-option ${isDisabled ? 'disabled' : ''}`}
            onClick={isDisabled ? undefined : handleExportBrunoCollection}
          >
            <div className="icon-container">
              {isExporting ? <IconLoader2 size={24} className="animate-spin" /> : <Bruno width={24} />}
            </div>
            <div className="option-content">
              <div className="option-title">Bruno Collection</div>
              <div className="option-description">
                {isCollectionLoading ? 'Loading collection...' : 'Export in Bruno JSON format for backup or sharing'}
              </div>
            </div>
          </div>

          <div
            className={`export-option ${isDisabled ? 'disabled' : ''}`}
            onClick={isDisabled ? undefined : handleExportPostmanCollection}
          >
            <div className="icon-container">
              {isExporting ? <IconLoader2 size={24} className="animate-spin" /> : <IconUpload size={24} strokeWidth={1.5} />}
            </div>
            <div className="option-content">
              <div className="option-title">Postman Collection</div>
              <div className="option-description">
                {isCollectionLoading ? 'Loading collection...' : 'Export in Postman-compatible format'}
              </div>
            </div>
            {hasNonExportableRequestTypes.has && (
              <div className="warning-badge">
                <IconAlertTriangle size={12} />
                {hasNonExportableRequestTypes.types.join(', ')} not supported
              </div>
            )}
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCancel}
            disabled={isExporting}
          >
            Close
          </button>
        </div>
      </div>
    </StyledWrapper>
  );
};

export default ExportCollectionView;
