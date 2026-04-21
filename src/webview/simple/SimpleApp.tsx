import React, { useEffect, useState, Suspense, lazy } from 'react';
import { ipcRenderer } from 'utils/ipc';
import CreateCollectionView from './views/CreateCollectionView';
import CloneCollectionView from './views/CloneCollectionView';

const ImportCollectionView = lazy(() => import('./views/ImportCollectionView'));

interface ViewData {
  viewType: string;
  collectionUid?: string;
  collectionPath?: string;
  [key: string]: unknown;
}

const SimpleApp: React.FC = () => {
  const [viewData, setViewData] = useState<ViewData | null>(null);
  const [collection, setCollection] = useState<{ name: string; pathname: string } | null>(null);

  useEffect(() => {
    const removeSetView = ipcRenderer.on('main:set-view', (data: ViewData) => {
      setViewData(data);
    });

    const removeCollectionOpened = ipcRenderer.on(
      'main:collection-opened',
      (pathname: string, _uid: string, brunoConfig: any) => {
        setCollection({
          name: brunoConfig?.name || pathname.split('/').pop() || 'Collection',
          pathname
        });
      }
    );

    return () => {
      removeSetView();
      removeCollectionOpened();
    };
  }, []);

  if (!viewData) {
    return <div style={{ padding: 20 }} />;
  }

  switch (viewData.viewType) {
    case 'create-collection':
      return <CreateCollectionView />;
    case 'import-collection':
      return (
        <Suspense fallback={<div style={{ padding: 20 }} />}>
          <ImportCollectionView />
        </Suspense>
      );
    case 'clone-collection':
      return <CloneCollectionView collection={collection} />;
    default:
      return (
        <div style={{ padding: 20, color: 'var(--vscode-foreground)' }}>
          Unknown view: {viewData.viewType}
        </div>
      );
  }
};

export default SimpleApp;
