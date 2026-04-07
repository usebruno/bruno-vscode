import { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useDispatch, useSelector } from 'react-redux';
import {
  IconArrowsSort,
  IconDotsVertical,
  IconDownload,
  IconFolder,
  IconPlus,
  IconSearch,
  IconSortAscendingLetters,
  IconSortDescendingLetters,
  IconSquareX,
  IconBox
} from '@tabler/icons';

import { openCollection } from 'providers/ReduxStore/slices/collections/actions';
import { sortCollections } from 'providers/ReduxStore/slices/collections/index';
import { normalizePath } from 'utils/common/path';
import { ipcRenderer } from 'utils/ipc';
import { RootState } from 'providers/ReduxStore';

import MenuDropdown from 'ui/MenuDropdown';
import ActionIcon from 'ui/ActionIcon';
import RemoveCollectionsModal from 'components/Sidebar/Collections/RemoveCollectionsModal/index';
import CreateCollection from 'components/Sidebar/CreateCollection';
import Collections from 'components/Sidebar/Collections';
import SidebarSection from 'components/Sidebar/SidebarSection';

interface CollectionsSectionProps {
  rawData?: unknown[];
  type?: unknown;
}


const CollectionsSection = () => {
  const [showSearch, setShowSearch] = useState(false);
  const dispatch = useDispatch();

  const { workspaces, activeWorkspaceUid } = useSelector((state: RootState) => state.workspaces);
  const activeWorkspace = workspaces.find((w: any) => w.uid === activeWorkspaceUid);

  const { collections } = useSelector((state: RootState) => state.collections);
  const { collectionSortOrder } = useSelector((state: RootState) => state.collections);
  const [collectionsToClose, setCollectionsToClose] = useState<string[]>([]);
  const [createCollectionModalOpen, setCreateCollectionModalOpen] = useState(false);

  const workspaceCollections = useMemo(() => {
    if (!activeWorkspace) return [];
    return collections.filter((c: any) => activeWorkspace.collections?.some((wc: any) => normalizePath(wc.path) === normalizePath(c.pathname))
    );
  }, [activeWorkspace, collections]);

  const handleToggleSearch = () => {
    setShowSearch((prev) => !prev);
  };

  const handleSortCollections = () => {
    let order: 'default' | 'alphabetical' | 'reverseAlphabetical';
    switch (collectionSortOrder) {
      case 'default':
        order = 'alphabetical';
        break;
      case 'alphabetical':
        order = 'reverseAlphabetical';
        break;
      case 'reverseAlphabetical':
        order = 'default';
        break;
      default:
        order = 'default';
        break;
    }
    dispatch(sortCollections({ order }));
  };

  const getSortIcon = () => {
    switch (collectionSortOrder) {
      case 'alphabetical':
        return IconSortDescendingLetters;
      case 'reverseAlphabetical':
        return IconArrowsSort;
      default:
        return IconSortAscendingLetters;
    }
  };

  const getSortLabel = () => {
    switch (collectionSortOrder) {
      case 'alphabetical':
        return 'Sort Z-A';
      case 'reverseAlphabetical':
        return 'Clear sort';
      default:
        return 'Sort A-Z';
    }
  };

  const selectAllCollectionsToClose = () => {
    setCollectionsToClose(workspaceCollections.map((c: any) => c.uid));
  };

  const clearCollectionsToClose = () => {
    setCollectionsToClose([]);
  };

  const handleOpenCollection = () => {
    (dispatch(openCollection()) as any).catch((err: any) => {
      toast.error('An error occurred while opening the collection');
    });
  };

  const addDropdownItems = [
    {
      id: 'create',
      leftSection: IconPlus,
      label: 'Create collection',
      onClick: () => {
        setCreateCollectionModalOpen(true);
      }
    },
    {
      id: 'open',
      leftSection: IconFolder,
      label: 'Open collection',
      onClick: () => {
        handleOpenCollection();
      }
    },
    {
      id: 'import',
      leftSection: IconDownload,
      label: 'Import collection',
      onClick: () => {
        ipcRenderer.send('sidebar:open-import-collection');
      }
    }
  ];

  const actionsDropdownItems = [
    {
      id: 'sort',
      leftSection: getSortIcon(),
      label: getSortLabel(),
      onClick: () => {
        handleSortCollections();
      }
    },
    {
      id: 'close-all',
      leftSection: IconSquareX,
      label: 'Close all',
      onClick: () => {
        selectAllCollectionsToClose();
      }
    }
  ];

  const sectionActions = (
    <>
      <ActionIcon
        onClick={handleToggleSearch}
        label="Search requests"
      >
        <IconSearch size={14} stroke={1.5} aria-hidden="true" />
      </ActionIcon>

      <MenuDropdown
        data-testid="collections-header-add-menu"
        items={addDropdownItems}
        placement="bottom-end"
      >
        <ActionIcon
          label="Add new collection"
        >
          <IconPlus size={14} stroke={1.5} aria-hidden="true" />
        </ActionIcon>
      </MenuDropdown>

      <MenuDropdown
        data-testid="collections-header-actions-menu"
        items={actionsDropdownItems}
        placement="bottom-end"
      >
        <ActionIcon
          label="More actions"
        >
          <IconDotsVertical size={14} stroke={1.5} aria-hidden="true" />
        </ActionIcon>
      </MenuDropdown>

      {collectionsToClose.length > 0 && (
        <RemoveCollectionsModal collectionUids={collectionsToClose} onClose={clearCollectionsToClose} />
      )}
    </>
  );

  return (
    <>
      {createCollectionModalOpen && (
        <CreateCollection
          onClose={() => setCreateCollectionModalOpen(false)}
        />
      )}
      <SidebarSection
        id="collections"
        title="Collections"
        icon={IconBox}
        actions={sectionActions}
      >
        <Collections showSearch={showSearch} />
      </SidebarSection>
    </>
  );
};

export default CollectionsSection;
