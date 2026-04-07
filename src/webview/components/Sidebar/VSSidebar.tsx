import { useState, useMemo, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import styled from 'styled-components';
import {
  IconWorld,
  IconPlus,
  IconFolder,
  IconDownload,
  IconSearch
} from '@tabler/icons';
import { ipcRenderer } from 'utils/ipc';
import { openCollection } from 'providers/ReduxStore/slices/collections/actions';
import MenuDropdown from 'ui/MenuDropdown';
import ActionIcon from 'ui/ActionIcon';
import Collection from './Collections/Collection';
import CollectionSearch from './Collections/CollectionSearch/index';
import { SidebarAccordionProvider } from './SidebarAccordionContext';

const StyledVSSidebar = styled.div`
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--vscode-sideBar-background, ${(props) => props.theme?.sidebar?.bg || '#1e1e1e'});
  color: var(--vscode-sideBar-foreground, var(--vscode-foreground, ${(props) => props.theme?.sidebar?.color || '#333333'}));

  .sidebar-header {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, ${(props) => props.theme?.sidebar?.collection?.item?.hoverBg || '#2d2d2d'});
    flex-shrink: 0;
  }

  .sidebar-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sidebar-header-right {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .sidebar-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground, ${(props) => props.theme?.sidebar?.color || '#333333'}));
  }

  .sidebar-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .collections-container {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    text-align: center;
    color: var(--vscode-descriptionForeground, var(--vscode-foreground, ${(props) => props.theme?.sidebar?.color || '#333333'}));

    .empty-message {
      font-size: 12px;
      margin-bottom: 16px;
    }

    .empty-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
      max-width: 200px;
    }

    .empty-action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 16px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      transition: background-color 0.1s ease;

      &.primary {
        background-color: var(--vscode-button-background, ${(props) => props.theme?.button?.primary?.bg || '#0e639c'});
        color: var(--vscode-button-foreground, ${(props) => props.theme?.button?.primary?.color || '#ffffff'});

        &:hover {
          background-color: var(--vscode-button-hoverBackground, ${(props) => props.theme?.button?.primary?.hoverBg || '#1177bb'});
        }
      }

      &.secondary {
        background-color: var(--vscode-button-secondaryBackground, transparent);
        color: var(--vscode-button-secondaryForeground, var(--vscode-foreground, ${(props) => props.theme?.sidebar?.color || '#333333'}));
        border-color: var(--vscode-button-border, ${(props) => props.theme?.sidebar?.collection?.item?.hoverBg || '#2d2d2d'});

        &:hover {
          background-color: var(--vscode-button-secondaryHoverBackground, ${(props) => props.theme?.sidebar?.collection?.item?.hoverBg || '#2d2d2d'});
        }
      }
    }
  }
`;

const VSSidebar = () => {
  const dispatch = useDispatch();
  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [isInitializing, setIsInitializing] = useState(true);

  const { collections } = useSelector((state: any) => state.collections);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    // Fast path: first collection arrives → stop initializing immediately
    const unsubCollection = ipcRenderer.on('main:collection-opened', () => {
      clearTimeout(timer);
      setIsInitializing(false);
    });

    // Slow path: after sidebar:ready, wait a bit then show empty state
    // (covers workspaces with no collections)
    const unsubReady = ipcRenderer.on('sidebar:ready', () => {
      timer = setTimeout(() => setIsInitializing(false), 800);
    });

    return () => {
      unsubCollection();
      unsubReady();
      clearTimeout(timer);
    };
  }, []);

  // Show all collections from Redux state directly (no workspace filtering)
  const workspaceCollections = useMemo(() => {
    return collections || [];
  }, [collections]);

  const handleOpenGlobalEnvironments = () => {
    ipcRenderer.send('sidebar:open-global-environments');
  };

  const handleCreateCollection = () => {
    ipcRenderer.send('sidebar:open-create-collection');
  };

  const handleOpenCollection = () => {
    dispatch(openCollection() as any).catch(() => {
      toast.error('An error occurred while opening the collection');
    });
  };

  const handleImportCollection = () => {
    ipcRenderer.send('sidebar:open-import-collection');
  };

  const handleToggleSearch = () => {
    setShowSearch((prev) => !prev);
    if (showSearch) {
      setSearchText('');
    }
  };

  const addDropdownItems = [
    {
      id: 'create',
      leftSection: IconPlus,
      label: 'Create collection',
      onClick: handleCreateCollection
    },
    {
      id: 'open',
      leftSection: IconFolder,
      label: 'Open collection',
      onClick: handleOpenCollection
    },
    {
      id: 'import',
      leftSection: IconDownload,
      label: 'Import collection',
      onClick: handleImportCollection
    }
  ];

  const hasCollections = workspaceCollections && workspaceCollections.length > 0;

  return (
    <SidebarAccordionProvider defaultExpanded={[]}>
      <StyledVSSidebar>
        <div className="sidebar-header">
        <div className="sidebar-header-left">
          <span className="sidebar-title">Collections</span>
        </div>
        <div className="sidebar-header-right">
          <ActionIcon onClick={handleOpenGlobalEnvironments} label="Global Environments">
            <IconWorld size={14} stroke={1.5} aria-hidden="true" />
          </ActionIcon>

          <ActionIcon onClick={handleToggleSearch} label="Search requests">
            <IconSearch size={14} stroke={1.5} aria-hidden="true" />
          </ActionIcon>

          <MenuDropdown
            data-testid="collections-header-add-menu"
            items={addDropdownItems}
            placement="bottom-end"
          >
            <ActionIcon label="Add new collection">
              <IconPlus size={14} stroke={1.5} aria-hidden="true" />
            </ActionIcon>
          </MenuDropdown>

        </div>
      </div>

      <div className="sidebar-content">
        {showSearch && (
          <CollectionSearch searchText={searchText} setSearchText={setSearchText} />
        )}

        <div className="collections-container">
          {isInitializing ? null : hasCollections ? (
            workspaceCollections.map((c: any) => (
              <Collection searchText={searchText} collection={c} key={c.uid} />
            ))
          ) : (
            <div className="empty-state">
              <div className="empty-message">No collections found.</div>
              <div className="empty-actions">
                <button
                  className="empty-action-btn primary"
                  onClick={handleCreateCollection}
                >
                  <IconPlus size={14} strokeWidth={1.5} />
                  Create Collection
                </button>
                <button
                  className="empty-action-btn secondary"
                  onClick={handleOpenCollection}
                >
                  <IconFolder size={14} strokeWidth={1.5} />
                  Open Collection
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      </StyledVSSidebar>
    </SidebarAccordionProvider>
  );
};

export default VSSidebar;
