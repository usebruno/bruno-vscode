import React, { useMemo } from 'react';
import Modal from 'components/Modal';
import { IconUpload, IconLoader2, IconAlertTriangle } from '@tabler/icons';
import StyledWrapper from './StyledWrapper';
import Bruno from 'components/Bruno';
import OpenCollectionIcon from 'components/Icons/OpenCollectionIcon';
import { cloneDeep, each, get } from 'lodash';
import { useSelector } from 'react-redux';
import { findCollectionByUid, areItemsLoading } from 'utils/collections/index';
import { ipcRenderer } from 'utils/ipc';
import toast from 'react-hot-toast';

interface ShareCollectionProps {
  onClose: () => void;
  collectionUid: string;
}

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
      if (item.type === 'graphql-request') {
        item.type = 'graphql';
      }
      if (item.type === 'http-request') {
        item.type = 'http';
      }
      if (item.type === 'grpc-request') {
        item.type = 'grpc';
      }
      if (item.type === 'ws-request') {
        item.type = 'ws';
      }
    }

    each(get(item, 'examples'), (example: any) => {
      if (example.type === 'graphql-request') {
        example.type = 'graphql';
      } else if (example.type === 'http-request') {
        example.type = 'http';
      } else if (example.type === 'grpc-request') {
        example.type = 'grpc';
      } else if (example.type === 'ws-request') {
        example.type = 'ws';
      }
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
      if (variable.secret) {
        variable.value = '';
      }
    });
  });
};

const prepareCollectionForExport = (collection: any, format: 'bruno' | 'postman' = 'bruno') => {
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

const ShareCollection: React.FC<ShareCollectionProps> = ({ onClose, collectionUid }) => {
  const collection = useSelector((state: any) => findCollectionByUid(state.collections.collections, collectionUid));
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
    if (isCollectionLoading) return;

    try {
      const exportData = prepareCollectionForExport(collection, 'bruno');
      const content = JSON.stringify(exportData, null, 2);

      const result = await ipcRenderer.invoke('sidebar:save-file', {
        defaultFileName: `${collection.name}.json`,
        content,
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      });

      if (result) {
        toast.success('Collection exported successfully');
        onClose();
      }
    } catch (error) {
      console.error('Error exporting collection:', error);
      toast.error('Failed to export collection');
    }
  };

  const handleExportPostmanCollection = async () => {
    if (isCollectionLoading) return;

    try {
      const exportData = prepareCollectionForExport(collection, 'postman');
      const content = JSON.stringify(exportData, null, 2);

      const result = await ipcRenderer.invoke('sidebar:save-file', {
        defaultFileName: `${collection.name}_postman.json`,
        content,
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      });

      if (result) {
        toast.success('Collection exported in Postman format');
        onClose();
      }
    } catch (error) {
      console.error('Error exporting collection:', error);
      toast.error('Failed to export collection');
    }
  };

  return (
    <Modal
      size="md"
      title="Export Collection"
      confirmText="Close"
      handleConfirm={onClose}
      handleCancel={onClose}
      hideCancel
    >
      <StyledWrapper className="flex flex-col h-full w-full">
        <div className="space-y-2">
          <div
            className={`share-button ${isCollectionLoading ? 'disabled' : ''}`}
            onClick={isCollectionLoading ? undefined : handleExportBrunoCollection}
          >
            <div className="mr-3 p-1 rounded-full">
              {isCollectionLoading ? <IconLoader2 size={28} className="animate-spin" /> : <Bruno width={28} />}
            </div>
            <div className="flex-1">
              <div className="font-medium">Bruno Collection</div>
              <div className="text-xs opacity-70">
                {isCollectionLoading ? 'Loading collection...' : 'Export in Bruno JSON format'}
              </div>
            </div>
          </div>

          <div
            className={`share-button ${isCollectionLoading ? 'disabled' : ''}`}
            onClick={isCollectionLoading ? undefined : handleExportPostmanCollection}
          >
            <div className="mr-3 p-1 rounded-full">
              {isCollectionLoading ? (
                <IconLoader2 size={28} className="animate-spin" />
              ) : (
                <IconUpload size={28} strokeWidth={1} />
              )}
            </div>
            <div className="flex-1">
              <div className="font-medium">Postman Collection</div>
              <div className="text-xs opacity-70">
                {isCollectionLoading ? 'Loading collection...' : 'Export in Postman-compatible format'}
              </div>
            </div>
            {hasNonExportableRequestTypes.has && (
              <div className="flex items-center text-xs note-warning px-2 py-1 rounded">
                <IconAlertTriangle size={14} className="mr-1" />
                {hasNonExportableRequestTypes.types.join(', ')} requests will be skipped
              </div>
            )}
          </div>
        </div>
      </StyledWrapper>
    </Modal>
  );
};

export default ShareCollection;
