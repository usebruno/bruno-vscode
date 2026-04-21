import { useEffect, useState } from 'react';
import { ipcRenderer } from 'utils/ipc';

export interface WorkspaceSummary {
  uid: string;
  name: string;
  pathname: string;
  type?: string;
}

export interface Bootstrap {
  preferences: any;
  workspaces: WorkspaceSummary[];
  activeWorkspaceUid: string | null;
}

export const useBootstrap = (): Bootstrap | null => {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);

  useEffect(() => {
    ipcRenderer
      .invoke<Bootstrap>('renderer:simple-panel-bootstrap')
      .then((data) => setBootstrap(data))
      .catch((err) => {
        console.error('[Bruno Simple] Bootstrap failed:', err);
        setBootstrap({ preferences: {}, workspaces: [], activeWorkspaceUid: null });
      });
  }, []);

  return bootstrap;
};

export const getDefaultLocation = (bootstrap: Bootstrap | null): string => {
  if (!bootstrap) return '';
  const active = bootstrap.workspaces.find((w) => w.uid === bootstrap.activeWorkspaceUid);
  const isDefault = !active || active.type === 'default';
  if (isDefault) {
    return bootstrap.preferences?.general?.defaultCollectionLocation || '';
  }
  return active?.pathname ? `${active.pathname}/collections` : '';
};
