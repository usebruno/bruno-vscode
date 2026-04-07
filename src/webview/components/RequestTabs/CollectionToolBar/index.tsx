import React from 'react';
import { IconBox, IconRun, IconSettings } from '@tabler/icons';
import EnvironmentSelector from 'components/Environments/EnvironmentSelector';
import JsSandboxMode from 'components/SecuritySettings/JsSandboxMode';
import ToolHint from 'components/ToolHint';
import StyledWrapper from './StyledWrapper';
import ActionIcon from 'ui/ActionIcon';
import { ipcRenderer } from 'utils/ipc';

interface CollectionToolBarProps {
  collection: any;
}

const CollectionToolBar: React.FC<CollectionToolBarProps> = ({ collection }) => {
  const handleRun = () => {
    ipcRenderer.send('sidebar:open-collection-runner', {
      collectionUid: collection.uid,
      collectionPath: collection.pathname
    });
  };

  const viewCollectionSettings = () => {
    ipcRenderer.send('sidebar:open-collection-settings', {
      collectionUid: collection.uid,
      collectionPath: collection.pathname
    });
  };

  return (
    <StyledWrapper>
      <div className="flex items-center justify-between gap-2 py-2 px-4">
        <button className="flex items-center cursor-pointer hover:underline bg-transparent border-none p-0 text-inherit" onClick={viewCollectionSettings}>
          <IconBox size={18} strokeWidth={1.5} />
          <span className="ml-2 mr-4 font-medium">{collection?.name}</span>
        </button>
        <div className="flex flex-grow gap-1 items-center justify-end">
          <ToolHint text="Runner" toolhintId="RunnerToolhintId" place="bottom">
            <ActionIcon onClick={handleRun} aria-label="Runner" size="sm">
              <IconRun size={16} strokeWidth={1.5} />
            </ActionIcon>
          </ToolHint>
          <ToolHint text="Collection Settings" toolhintId="CollectionSettingsToolhintId">
            <ActionIcon onClick={viewCollectionSettings} aria-label="Collection Settings" size="sm">
              <IconSettings size={16} strokeWidth={1.5} />
            </ActionIcon>
          </ToolHint>
          <JsSandboxMode collection={collection} />
          <span className="ml-2">
            <EnvironmentSelector collection={collection} />
          </span>
        </div>
      </div>
    </StyledWrapper>
  );
};

export default CollectionToolBar;
