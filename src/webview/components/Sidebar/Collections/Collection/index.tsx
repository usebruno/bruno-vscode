import React, { useState, useRef, useEffect } from 'react';
import { getEmptyImage } from 'react-dnd-html5-backend';
import classnames from 'classnames';
import filter from 'lodash/filter';
import { useDrop, useDrag } from 'react-dnd';
import {
  IconChevronRight,
  IconDots,
  IconLoader2,
  IconFilePlus,
  IconFolderPlus,
  IconCopy,
  IconClipboard,
  IconPlayerPlay,
  IconEdit,
  IconFolder,
  IconSettings,
  IconShare,
  IconX,
  IconPlus,
  IconApi,
  IconBrandGraphql,
  IconNetwork,
  IconPlugConnected
} from '@tabler/icons';
import { toggleCollection } from 'providers/ReduxStore/slices/collections';
import {
  mountCollection,
  moveCollectionAndPersist,
  handleCollectionItemDrop,
  pasteItem,
  saveCollectionSecurityConfig,
  renameCollection,
  newFolder,
  removeCollection
} from 'providers/ReduxStore/slices/collections/actions';
import { useDispatch, useSelector } from 'react-redux';
import { makeTabPermanent } from 'providers/ReduxStore/slices/tabs';
import toast from 'react-hot-toast';
import CollectionItem from './CollectionItem';
import { doesCollectionHaveItemsMatchingSearchText } from 'utils/collections/search';
import { isItemAFolder, isItemARequest } from 'utils/collections';
import { isTabForItemActive } from 'selectors/tab';
import StyledWrapper from './StyledWrapper';
import { areItemsLoading } from 'utils/collections';
import { scrollToTheActiveTab } from 'utils/tabs';
import { CollectionItemDragPreview } from './CollectionItem/CollectionItemDragPreview/index';
import { sortByNameThenSequence } from 'utils/common/index';
import { getRevealInFolderLabel } from 'utils/common/platform';
import ActionIcon from 'ui/ActionIcon';
import MenuDropdown from 'ui/MenuDropdown';
import { useSidebarAccordion } from 'components/Sidebar/SidebarAccordionContext';
import { ipcRenderer } from 'utils/ipc';
import { addTransientRequest } from 'providers/ReduxStore/slices/collections';
import transientManager from 'utils/transient-manager';

interface CollectionProps {
  collection: any;
  searchText?: string;
}

const Collection = ({ collection, searchText }: CollectionProps) => {
  const { dropdownContainerRef } = useSidebarAccordion();
  const [dropType, setDropType] = useState<string | null>(null);
  const [isKeyboardFocused, setIsKeyboardFocused] = useState(false);
  const dispatch = useDispatch();
  const isLoading = areItemsLoading(collection);
  const collectionRef = useRef<HTMLDivElement | null>(null);

  const isCollectionFocused = useSelector(isTabForItemActive({ itemUid: collection.uid }));
  const { hasCopiedItems } = useSelector((state: any) => state.app.clipboard);
  const menuDropdownRef = useRef<any>(null);

  const handleRun = () => {
    ensureCollectionIsMounted();
    ipcRenderer.send('sidebar:open-collection-runner', {
      collectionUid: collection.uid,
      collectionPath: collection.pathname
    });
  };

  const ensureCollectionIsMounted = () => {
    if (collection.mountStatus === 'mounted') {
      return;
    }
    dispatch(mountCollection({
      collectionUid: collection.uid,
      collectionPathname: collection.pathname,
      brunoConfig: collection.brunoConfig
    }));
  };

  const hasSearchText = searchText && searchText?.trim?.()?.length;
  const collectionIsCollapsed = hasSearchText ? false : collection.collapsed;

  const iconClassName = classnames({
    'rotate-90': !collectionIsCollapsed
  });

  const handleClick = (event: React.MouseEvent) => {
    if (event.detail !== 1) return;
    const isChevronClick = (event.target as HTMLElement).closest('svg')?.classList.contains('chevron-icon');
    setTimeout(scrollToTheActiveTab, 50);

    ensureCollectionIsMounted();

    if (collection.collapsed) {
      dispatch(toggleCollection(collection.uid));
      if (!collection.securityConfig?.jsSandboxMode) {
        dispatch(saveCollectionSecurityConfig(collection.uid, {
          jsSandboxMode: 'safe'
        }));
      }
    }

    if (!isChevronClick) {
      viewCollectionSettings();
    }
  };

  const handleDoubleClick = () => {
    dispatch(makeTabPermanent({ uid: collection.uid }));
  };

  const handleCollectionCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    ensureCollectionIsMounted();
    dispatch(toggleCollection(collection.uid));
  };

  const handleCollectionDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const handleRightClick = (event: React.MouseEvent) => {
    event.preventDefault();
    menuDropdownRef.current?.show();
  };

  const viewCollectionSettings = () => {
    ensureCollectionIsMounted();
    ipcRenderer.send('sidebar:open-collection-settings', {
      collectionUid: collection.uid,
      collectionPath: collection.pathname
    });
  };

  const handleShowInFolder = async () => {
    try {
      await ipcRenderer.invoke('sidebar:show-in-folder', collection.pathname);
    } catch (error) {
      console.error('Error opening the folder', error);
      toast.error('Error opening the folder');
    }
  };

  const handlePasteItem = () => {
    (dispatch(pasteItem(collection.uid, null)) as any)
      .then(() => {
        toast.success('Item pasted successfully');
      })
      .catch((err: Error) => {
        toast.error(err ? err.message : 'An error occurred while pasting the item');
      });
  };

  const handleRename = async () => {
    try {
      const newName = await ipcRenderer.invoke('sidebar:prompt-rename', {
        currentName: collection.name,
        itemType: 'collection'
      }) as string | null;
      if (newName) {
        (dispatch(renameCollection(newName, collection.uid)) as any)
          .then(() => toast.success('Collection renamed'))
          .catch((err: Error) => toast.error(err.message || 'Failed to rename collection'));
      }
    } catch (error) {
      console.error('Error renaming collection:', error);
    }
  };

  const handleNewFolder = async () => {
    ensureCollectionIsMounted();
    try {
      const folderName = await ipcRenderer.invoke('sidebar:prompt-new-folder', {}) as string | null;
      if (folderName) {
        (dispatch(newFolder(folderName, folderName, collection.uid, null)) as any)
          .then(() => toast.success('Folder created'))
          .catch((err: Error) => toast.error(err.message || 'Failed to create folder'));
      }
    } catch (error) {
      console.error('Error creating folder:', error);
    }
  };

  const handleNewRequest = () => {
    ensureCollectionIsMounted();
    ipcRenderer.send('sidebar:open-new-request', {
      collectionUid: collection.uid,
      collectionPath: collection.pathname,
      itemUid: null
    });
  };

  const handleExportCollection = () => {
    ensureCollectionIsMounted();
    ipcRenderer.send('sidebar:open-export-collection', {
      collectionUid: collection.uid,
      collectionPath: collection.pathname
    });
  };

  const handleRemove = async () => {
    try {
      const confirmed = await ipcRenderer.invoke('sidebar:confirm-remove', {
        collectionName: collection.name
      });
      if (confirmed) {
        (dispatch(removeCollection(collection.uid)) as any)
          .then(() => toast.success('Collection removed'))
          .catch((err: Error) => toast.error(err.message || 'Failed to remove collection'));
      }
    } catch (error) {
      console.error('Error removing collection:', error);
    }
  };

  const handleClone = () => {
    ensureCollectionIsMounted();
    ipcRenderer.send('sidebar:open-clone-collection', {
      collectionUid: collection.uid,
      collectionPath: collection.pathname
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const isMac = navigator.userAgent?.includes('Mac') || navigator.platform?.startsWith('Mac');
    const isModifierPressed = isMac ? e.metaKey : e.ctrlKey;

    if (isModifierPressed && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      e.stopPropagation();
      handlePasteItem();
    }
  };

  const handleFocus = () => {
    setIsKeyboardFocused(true);
  };

  const handleBlur = () => {
    setIsKeyboardFocused(false);
  };

  const isCollectionItem = (itemType: string | symbol | null) => {
    return itemType === 'collection-item';
  };

  const [{ isDragging }, drag, dragPreview] = useDrag({
    type: 'collection',
    item: collection,
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    }),
    options: {
      dropEffect: 'move'
    }
  });

  const [{ isOver }, drop] = useDrop({
    accept: ['collection', 'collection-item'],
    hover: (_draggedItem, monitor) => {
      const itemType = monitor.getItemType();
      if (isCollectionItem(itemType)) {
        setDropType('inside');
      } else {
        setDropType('adjacent');
      }
    },
    drop: (draggedItem: any, monitor) => {
      const itemType = monitor.getItemType();
      if (isCollectionItem(itemType)) {
        dispatch(handleCollectionItemDrop({ targetItem: collection, draggedItem, dropType: 'inside', collectionUid: collection.uid }));
      } else {
        dispatch(moveCollectionAndPersist({ draggedItem, targetItem: collection }));
      }
      setDropType(null);
    },
    canDrop: (draggedItem: any) => {
      return draggedItem.uid !== collection.uid;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver()
    })
  });

  useEffect(() => {
    dragPreview(getEmptyImage(), { captureDraggingState: true });
  }, []);

  useEffect(() => {
    if (isCollectionFocused && collectionRef.current) {
      try {
        (collectionRef.current as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (err) {
        // ignore scroll errors
      }
    }
  }, [isCollectionFocused]);

  if (searchText && (searchText as string).length) {
    if (!doesCollectionHaveItemsMatchingSearchText(collection, searchText)) {
      return null;
    }
  }

  const collectionRowClassName = classnames('flex py-1 collection-name items-center', {
    'item-hovered': isOver && dropType === 'adjacent',
    'drop-target': isOver && dropType === 'inside',
    'collection-focused-in-tab': isCollectionFocused && !isKeyboardFocused,
    'collection-keyboard-focused': isKeyboardFocused
  });

  const sortItemsBySequence = (items: any[] = []) => {
    return items.sort((a, b) => a.seq - b.seq);
  };

  const requestItems = sortItemsBySequence(filter(collection.items, (i: any) => isItemARequest(i) && !i.isTransient));
  const folderItems = sortByNameThenSequence(filter(collection.items, (i: any) => isItemAFolder(i)));

  const newRequestMenuRef = useRef<any>(null);

  const openTransientRequest = (item: any) => {
    dispatch(addTransientRequest({ collectionUid: collection.uid, item }));
    ipcRenderer.send('sidebar:open-transient-request', {
      itemUid: item.uid,
      itemName: item.name,
      collectionUid: collection.uid,
      collectionPath: collection.pathname,
      item
    });
  };

  const transientRequestMenuItems = [
    {
      id: 'new-http',
      leftSection: IconApi,
      label: 'HTTP',
      onClick: () => {
        ensureCollectionIsMounted();
        openTransientRequest(transientManager.createHttpRequest(collection));
      }
    },
    {
      id: 'new-graphql',
      leftSection: IconBrandGraphql,
      label: 'GraphQL',
      onClick: () => {
        ensureCollectionIsMounted();
        openTransientRequest(transientManager.createGraphQLRequest(collection));
      }
    },
    {
      id: 'new-grpc',
      leftSection: IconNetwork,
      label: 'gRPC',
      onClick: () => {
        ensureCollectionIsMounted();
        openTransientRequest(transientManager.createGrpcRequest(collection));
      }
    },
    {
      id: 'new-ws',
      leftSection: IconPlugConnected,
      label: 'WebSocket',
      onClick: () => {
        ensureCollectionIsMounted();
        openTransientRequest(transientManager.createWebSocketRequest(collection));
      }
    }
  ];

  const menuItems = [
    {
      id: 'new-request',
      leftSection: IconFilePlus,
      label: 'New Request',
      onClick: handleNewRequest
    },
    {
      id: 'new-folder',
      leftSection: IconFolderPlus,
      label: 'New Folder',
      onClick: handleNewFolder
    },
    {
      id: 'run',
      leftSection: IconPlayerPlay,
      label: 'Run',
      onClick: handleRun
    },
    {
      id: 'clone',
      leftSection: IconCopy,
      label: 'Clone',
      onClick: handleClone
    },
    {
      id: 'share',
      leftSection: IconShare,
      label: 'Export',
      onClick: handleExportCollection
    },
    ...(hasCopiedItems
      ? [
          {
            id: 'paste',
            leftSection: IconClipboard,
            label: 'Paste',
            onClick: handlePasteItem
          }
        ]
      : []),
    {
      id: 'rename',
      leftSection: IconEdit,
      label: 'Rename',
      onClick: handleRename
    },
    {
      id: 'show-in-folder',
      leftSection: IconFolder,
      label: getRevealInFolderLabel(),
      onClick: handleShowInFolder
    },
    {
      id: 'divider-1',
      type: 'divider'
    },
    {
      id: 'settings',
      leftSection: IconSettings,
      label: 'Settings',
      onClick: viewCollectionSettings
    },
    {
      id: 'remove',
      leftSection: IconX,
      label: 'Remove',
      onClick: handleRemove
    }
  ];

  return (
    <StyledWrapper className="flex flex-col" id={`collection-${collection.name.replace(/\s+/g, '-').toLowerCase()}`}>
      <CollectionItemDragPreview />
      <div
        className={collectionRowClassName}
        ref={(node) => {
          collectionRef.current = node;
          drag(drop(node));
        }}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        data-testid="sidebar-collection-row"
      >
        <div
          className="flex flex-grow items-center overflow-hidden"
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleRightClick}
        >
          <ActionIcon style={{ width: 16, minWidth: 16 }}>
            <IconChevronRight
              size={16}
              strokeWidth={2}
              className={`chevron-icon ${iconClassName}`}
              style={{ width: 16, minWidth: 16 }}
              onClick={handleCollectionCollapse}
              onDoubleClick={handleCollectionDoubleClick}
            />
          </ActionIcon>
          <div className="ml-1 w-full" id="sidebar-collection-name" title={collection.name}>
            {collection.name}
          </div>
          {isLoading ? <IconLoader2 className="animate-spin mx-1" size={18} strokeWidth={1.5} /> : null}
        </div>
        <div className="flex items-center">
          <MenuDropdown
            ref={newRequestMenuRef}
            items={transientRequestMenuItems}
            placement="bottom-start"
            appendTo={dropdownContainerRef?.current || document.body}
            popperOptions={{ strategy: 'fixed' }}
            data-testid="collection-new-request"
          >
            <ActionIcon className="collection-actions" data-testid="collection-new-request-btn">
              <IconPlus size={16} strokeWidth={2} />
            </ActionIcon>
          </MenuDropdown>
          <div className="pr-2">
            <MenuDropdown
              ref={menuDropdownRef}
              items={menuItems}
              placement="bottom-start"
              appendTo={dropdownContainerRef?.current || document.body}
              popperOptions={{ strategy: 'fixed' }}
              data-testid="collection-actions"
            >
              <ActionIcon className="collection-actions">
                <IconDots size={18} />
              </ActionIcon>
            </MenuDropdown>
          </div>
        </div>
      </div>
      <div>
        {!collectionIsCollapsed ? (
          <div>
            {folderItems?.map?.((i: any) => {
              return <CollectionItem key={i.uid} item={i} collectionUid={collection.uid} collectionPathname={collection.pathname} searchText={searchText} />;
            })}
            {requestItems?.map?.((i: any) => {
              return <CollectionItem key={i.uid} item={i} collectionUid={collection.uid} collectionPathname={collection.pathname} searchText={searchText} />;
            })}
          </div>
        ) : null}
      </div>
    </StyledWrapper>
  );
};

export default Collection;
