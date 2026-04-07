import React, { useState, useRef, useEffect } from 'react';
import { getEmptyImage } from 'react-dnd-html5-backend';
import range from 'lodash/range';
import filter from 'lodash/filter';
import classnames from 'classnames';
import { useDrag, useDrop } from 'react-dnd';
import {
  IconChevronRight,
  IconDots,
  IconFilePlus,
  IconFolderPlus,
  IconPlayerPlay,
  IconEdit,
  IconCopy,
  IconClipboard,
  IconFolder,
  IconTrash,
  IconSettings
} from '@tabler/icons';
import { useSelector, useDispatch } from 'react-redux';
import { addTab, focusTab, makeTabPermanent } from 'providers/ReduxStore/slices/tabs';
import {
  handleCollectionItemDrop,
  sendRequest,
  pasteItem,
  saveRequest,
  newFolder,
  renameItem,
  cloneItem,
  deleteItem
} from 'providers/ReduxStore/slices/collections/actions';
import { toggleCollectionItem } from 'providers/ReduxStore/slices/collections';
import { copyRequest } from 'providers/ReduxStore/slices/app';
import { isItemARequest, isItemAFolder } from 'utils/tabs';
import { doesRequestMatchSearchText, doesFolderHaveItemsMatchSearchText } from 'utils/collections/search';
import { getDefaultRequestPaneTab } from 'utils/collections';
import toast from 'react-hot-toast';
import StyledWrapper from './StyledWrapper';
import NetworkError from 'components/ResponsePane/NetworkError/index';
import CollectionItemIcon from './CollectionItemIcon';
import { scrollToTheActiveTab } from 'utils/tabs';
import { isTabForItemActive as isTabForItemActiveSelector, isTabForItemPresent as isTabForItemPresentSelector } from 'selectors/tab';
import { isEqual } from 'lodash';
import { calculateDraggedItemNewPathname, findParentItemInCollection } from 'utils/collections/index';
import { sortByNameThenSequence } from 'utils/common/index';
import { getRevealInFolderLabel } from 'utils/common/platform';
import ActionIcon from 'ui/ActionIcon';
import MenuDropdown from 'ui/MenuDropdown';
import { useSidebarAccordion } from 'components/Sidebar/SidebarAccordionContext';
import { isSidebarMode, openRequestInVSCodeEditor } from 'utils/webviewMode';
import { ipcRenderer } from 'utils/ipc';

interface CollectionItemProps {
  item: any;
  collectionUid: string;
  collectionPathname: string;
  searchText?: string;
}

const CollectionItem = ({ item, collectionUid, collectionPathname, searchText }: CollectionItemProps) => {
  const { dropdownContainerRef } = useSidebarAccordion();
  const _isTabForItemActiveSelector = isTabForItemActiveSelector({ itemUid: item.uid });
  const isTabForItemActive = useSelector(_isTabForItemActiveSelector, isEqual);

  const _isTabForItemPresentSelector = isTabForItemPresentSelector({ itemUid: item.uid });
  const isTabForItemPresent = useSelector(_isTabForItemPresentSelector, isEqual);

  const isSidebarDragging = useSelector((state: any) => state.app.isDragging);
  const collection = useSelector((state: any) => state.collections.collections?.find((c: any) => c.uid === collectionUid));
  const { hasCopiedItems } = useSelector((state: any) => state.app.clipboard);
  const dispatch = useDispatch();

  const ref = useRef<HTMLDivElement>(null);
  const menuDropdownRef = useRef<any>(null);

  const [isKeyboardFocused, setIsKeyboardFocused] = useState(false);
  const [dropType, setDropType] = useState<string | null>(null);

  const hasSearchText = searchText && searchText?.trim?.()?.length;
  const itemIsCollapsed = hasSearchText ? false : item.collapsed;
  const isFolder = isItemAFolder(item);

  const [{ isDragging }, drag, dragPreview] = useDrag({
    type: 'collection-item',
    item: { ...item, sourceCollectionUid: collectionUid },
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    }),
    options: {
      dropEffect: 'move'
    }
  });

  useEffect(() => {
    dragPreview(getEmptyImage(), { captureDraggingState: true });
  }, []);

  useEffect(() => {
    if (isTabForItemActive && ref.current) {
      try {
        ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (err) {
        // ignore scroll errors
      }
    }
  }, [isTabForItemActive]);

  const determineDropType = (monitor: any) => {
    const hoverBoundingRect = ref.current?.getBoundingClientRect();
    const clientOffset = monitor.getClientOffset();
    if (!hoverBoundingRect || !clientOffset) return null;

    const clientY = clientOffset.y - hoverBoundingRect.top;
    const folderUpperThreshold = hoverBoundingRect.height * 0.35;
    const fileUpperThreshold = hoverBoundingRect.height * 0.5;

    if (isItemAFolder(item)) {
      return clientY < folderUpperThreshold ? 'adjacent' : 'inside';
    } else {
      return clientY < fileUpperThreshold ? 'adjacent' : null;
    }
  };

  const canItemBeDropped = ({ draggedItem, targetItem, dropType }: any) => {
    const { uid: targetItemUid, pathname: targetItemPathname } = targetItem;
    const { uid: draggedItemUid, pathname: draggedItemPathname, sourceCollectionUid } = draggedItem;

    if (draggedItemUid === targetItemUid) return false;

    if (sourceCollectionUid !== collectionUid) {
      return true;
    }

    const newPathname = calculateDraggedItemNewPathname({ draggedItem, targetItem, dropType, collectionPathname });
    if (!newPathname) return false;

    if (targetItemPathname?.startsWith(draggedItemPathname)) return false;

    return true;
  };

  const [{ isOver }, drop] = useDrop({
    accept: 'collection-item',
    hover: (draggedItem: any, monitor) => {
      const { uid: targetItemUid } = item;
      const { uid: draggedItemUid } = draggedItem;

      if (draggedItemUid === targetItemUid) return;

      const dropType = determineDropType(monitor);
      const _canItemBeDropped = canItemBeDropped({ draggedItem, targetItem: item, dropType });
      setDropType(_canItemBeDropped ? dropType : null);
    },
    drop: async (draggedItem: any, monitor) => {
      const { uid: targetItemUid } = item;
      const { uid: draggedItemUid } = draggedItem;

      if (draggedItemUid === targetItemUid) return;

      const dropType = determineDropType(monitor);
      if (!dropType) return;

      await dispatch(handleCollectionItemDrop({ targetItem: item, draggedItem, dropType, collectionUid }));
      setDropType(null);
    },
    canDrop: (draggedItem: any) => draggedItem.uid !== item.uid,
    collect: (monitor) => ({
      isOver: monitor.isOver()
    })
  });

  const iconClassName = classnames({
    'rotate-90': !itemIsCollapsed
  });

  const itemRowClassName = classnames('flex collection-item-name relative items-center', {
    'item-focused-in-tab': isTabForItemActive,
    'item-hovered': isOver,
    'drop-target': isOver && dropType === 'inside',
    'drop-target-above': isOver && dropType === 'adjacent',
    'item-keyboard-focused': isKeyboardFocused
  });

  const handleRun = async () => {
    (dispatch(sendRequest(item, collectionUid)) as unknown as Promise<void>).catch(() =>
      toast.custom((t) => <NetworkError onClose={() => toast.dismiss(t.id)} />, {
        duration: 5000
      })
    );
  };

  const handleClick = (event: React.MouseEvent) => {
    if (event && event.detail !== 1) return;
    setTimeout(scrollToTheActiveTab, 50);
    const isRequest = isItemARequest(item);

    if (isSidebarMode() && isRequest) {
      openRequestInVSCodeEditor(item.pathname);
      return;
    }

    if (isRequest) {
      if (isTabForItemPresent) {
        dispatch(focusTab({ uid: item.uid }));
        return;
      }
      dispatch(
        addTab({
          uid: item.uid,
          collectionUid: collectionUid,
          requestPaneTab: getDefaultRequestPaneTab(item),
          type: 'request'
        })
      );
    } else {
      if (isSidebarMode()) {
        // Open folder settings in VSCode editor
        ipcRenderer.send('sidebar:open-folder-settings', {
          collectionUid,
          collectionPath: collection?.pathname,
          folderUid: item.uid,
          folderPath: item.pathname
        });
        // Also expand the folder if collapsed
        if (item.collapsed) {
          dispatch(
            toggleCollectionItem({
              itemUid: item.uid,
              collectionUid: collectionUid
            })
          );
        }
        return;
      }

      dispatch(
        addTab({
          uid: item.uid,
          collectionUid: collectionUid,
          type: 'folder-settings'
        })
      );
      if (item.collapsed) {
        dispatch(
          toggleCollectionItem({
            itemUid: item.uid,
            collectionUid: collectionUid
          })
        );
      }
    }
  };

  const handleFolderCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dispatch(
      toggleCollectionItem({
        itemUid: item.uid,
        collectionUid: collectionUid
      })
    );
  };

  const handleFolderDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    menuDropdownRef.current?.show();
  };

  const handleDoubleClick = () => {
    dispatch(makeTabPermanent({ uid: item.uid }));
  };

  const handleShowInFolder = async () => {
    try {
      await ipcRenderer.invoke('sidebar:show-in-folder', item.pathname);
    } catch (error) {
      console.error('Error opening the folder', error);
      toast.error('Error opening the folder');
    }
  };

  const handleCopyItem = () => {
    dispatch(copyRequest(item));
    const itemType = isFolder ? 'Folder' : 'Request';
    toast.success(`${itemType} copied to clipboard`);
  };

  const handlePasteItem = () => {
    let targetFolderUid = item.uid;
    if (!isFolder) {
      const parentFolder = findParentItemInCollection(collection, item.uid);
      targetFolderUid = parentFolder ? parentFolder.uid : null;
    }

    (dispatch(pasteItem(collectionUid, targetFolderUid)) as unknown as Promise<void>)
      .then(() => {
        toast.success('Item pasted successfully');
      })
      .catch((err: Error) => {
        toast.error(err ? err.message : 'An error occurred while pasting the item');
      });
  };

  const handleRename = async () => {
    try {
      const itemType = isFolder ? 'folder' : 'request';
      const newName = await ipcRenderer.invoke('sidebar:prompt-rename', {
        currentName: item.name,
        itemType
      });
      if (newName) {
        if (item.draft) {
          await dispatch(saveRequest(item.uid, collectionUid));
        }
        (dispatch(renameItem({ newName: newName as string, newFilename: newName as string, itemUid: item.uid, collectionUid })) as unknown as Promise<void>)
          .then(() => toast.success(`${isFolder ? 'Folder' : 'Request'} renamed`))
          .catch((err: Error) => toast.error(err.message || 'Failed to rename'));
      }
    } catch (error) {
      console.error('Error renaming item:', error);
    }
  };

  const handleNewFolder = async () => {
    try {
      const folderName = await ipcRenderer.invoke('sidebar:prompt-new-folder', {});
      if (folderName) {
        (dispatch(newFolder(folderName as string, folderName as string, collectionUid, item.uid)) as unknown as Promise<void>)
          .then(() => toast.success('Folder created'))
          .catch((err: Error) => toast.error(err.message || 'Failed to create folder'));
      }
    } catch (error) {
      console.error('Error creating folder:', error);
    }
  };

  const handleNewRequest = () => {
    ipcRenderer.send('sidebar:open-new-request', {
      collectionUid,
      collectionPath: collectionPathname,
      itemUid: item.uid
    });
  };

  const handleClone = async () => {
    try {
      const itemType = isFolder ? 'folder' : 'request';
      const newName = await ipcRenderer.invoke('sidebar:prompt-rename', {
        currentName: `${item.name} copy`,
        itemType: `cloned ${itemType}`
      });
      if (newName) {
        (dispatch(cloneItem(newName as string, newName as string, item.uid, collectionUid)) as unknown as Promise<void>)
          .then(() => toast.success(`${isFolder ? 'Folder' : 'Request'} cloned`))
          .catch((err: Error) => toast.error(err.message || 'Failed to clone'));
      }
    } catch (error) {
      console.error('Error cloning item:', error);
    }
  };

  const handleDelete = async () => {
    try {
      const itemType = isFolder ? 'folder' : 'request';
      const confirmed = await ipcRenderer.invoke('sidebar:confirm-delete', {
        itemName: item.name,
        itemType
      });
      if (confirmed) {
        (dispatch(deleteItem(item.uid, collectionUid)) as unknown as Promise<void>)
          .then(() => toast.success(`${isFolder ? 'Folder' : 'Request'} deleted`))
          .catch((err: Error) => toast.error(err.message || 'Failed to delete'));
      }
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const viewFolderSettings = () => {
    if (isItemAFolder(item)) {
      if (isSidebarMode()) {
        ipcRenderer.send('sidebar:open-folder-settings', {
          collectionUid,
          collectionPath: collection?.pathname,
          folderUid: item.uid,
          folderPath: item.pathname
        });
        return;
      }
      if (isTabForItemPresent) {
        dispatch(focusTab({ uid: item.uid }));
        return;
      }
      dispatch(
        addTab({
          uid: item.uid,
          collectionUid,
          type: 'folder-settings'
        })
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const isMac = navigator.userAgent?.includes('Mac') || navigator.platform?.startsWith('Mac');
    const isModifierPressed = isMac ? e.metaKey : e.ctrlKey;

    if (isModifierPressed && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      e.stopPropagation();
      handleCopyItem();
    } else if (isModifierPressed && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      e.stopPropagation();
      handlePasteItem();
    }
  };

  const handleFocus = () => setIsKeyboardFocused(true);
  const handleBlur = () => setIsKeyboardFocused(false);

  const buildMenuItems = () => {
    const items: any[] = [];

    if (isFolder) {
      items.push(
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
          onClick: () => {
            ipcRenderer.send('sidebar:open-collection-runner', {
              collectionUid,
              collectionPath: collection?.pathname,
              folderUid: item.uid
            });
          }
        }
      );
    }

    items.push(
      {
        id: 'clone',
        leftSection: IconCopy,
        label: 'Clone',
        onClick: handleClone
      },
      {
        id: 'copy',
        leftSection: IconCopy,
        label: 'Copy',
        onClick: handleCopyItem
      }
    );

    if (isFolder && hasCopiedItems) {
      items.push({
        id: 'paste',
        leftSection: IconClipboard,
        label: 'Paste',
        onClick: handlePasteItem
      });
    }

    items.push({
      id: 'rename',
      leftSection: IconEdit,
      label: 'Rename',
      onClick: handleRename
    });

    if (!isFolder && isItemARequest(item) && !(item.type === 'http-request' || item.type === 'graphql-request')) {
      items.push({
        id: 'run',
        leftSection: IconPlayerPlay,
        label: 'Run',
        onClick: handleRun
      });
    }

    items.push({
      id: 'show-in-folder',
      leftSection: IconFolder,
      label: getRevealInFolderLabel(),
      onClick: handleShowInFolder
    });

    items.push({ id: 'separator-1', type: 'divider' });

    if (isFolder) {
      items.push({
        id: 'settings',
        leftSection: IconSettings,
        label: 'Settings',
        onClick: viewFolderSettings
      });
    }

    items.push({
      id: 'delete',
      leftSection: IconTrash,
      label: 'Delete',
      className: 'delete-item',
      onClick: handleDelete
    });

    return items;
  };

  const className = classnames('flex flex-col w-full', {
    'is-sidebar-dragging': isSidebarDragging
  });

  if (searchText && searchText.length) {
    if (isItemARequest(item)) {
      if (!doesRequestMatchSearchText(item, searchText)) {
        return null;
      }
    } else {
      if (!doesFolderHaveItemsMatchSearchText(item, searchText)) {
        return null;
      }
    }
  }

  const sortItemsBySequence = (items: any[] = []) => {
    return items.sort((a, b) => a.seq - b.seq);
  };

  const folderItems = sortByNameThenSequence(filter(item.items, (i: any) => isItemAFolder(i)));
  const requestItems = sortItemsBySequence(filter(item.items, (i: any) => isItemARequest(i)));
  const indents = range(item.depth);
  const showEmptyFolderMessage = isFolder && !hasSearchText && !folderItems?.length && !requestItems?.length;

  return (
    <StyledWrapper className={className}>
      <div
        className={itemRowClassName}
        ref={(node) => {
          ref.current = node;
          drag(drop(node));
        }}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onContextMenu={handleContextMenu}
        data-testid="sidebar-collection-item-row"
      >
        <div className="flex items-center h-full w-full">
          {indents && indents.length
            ? indents.map((i) => (
                <div
                  onClick={handleClick}
                  onDoubleClick={handleDoubleClick}
                  className="indent-block"
                  key={i}
                  style={{ width: 16, minWidth: 16, height: '100%' }}
                >
                  &nbsp;
                </div>
              ))
            : null}
          <div
            className="flex flex-grow items-center h-full overflow-hidden"
            style={{ paddingLeft: 8 }}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
          >
            {isFolder ? (
              <ActionIcon style={{ width: 16, minWidth: 16 }}>
                <IconChevronRight
                  size={16}
                  strokeWidth={2}
                  className={iconClassName}
                  style={{  }}
                  onClick={handleFolderCollapse}
                  onDoubleClick={handleFolderDoubleClick}
                  data-testid="folder-chevron"
                />
              </ActionIcon>
            ) : null}

            <div className="ml-1 flex w-full h-full items-center overflow-hidden">
              <CollectionItemIcon item={item} />
              <span className="item-name" title={item.name}>
                {item.name}
              </span>
            </div>
          </div>
          <div className="pr-2">
            <MenuDropdown
              ref={menuDropdownRef}
              items={buildMenuItems()}
              placement="bottom-start"
              data-testid="collection-item-menu"
              popperOptions={{ strategy: 'fixed' }}
              appendTo={dropdownContainerRef?.current || document.body}
            >
              <ActionIcon className="menu-icon">
                <IconDots size={18} className="collection-item-menu-icon" />
              </ActionIcon>
            </MenuDropdown>
          </div>
        </div>
      </div>
      {!itemIsCollapsed ? (
        <div>
          {folderItems && folderItems.length
            ? folderItems.map((i: any) => {
                return <CollectionItem key={i.uid} item={i} collectionUid={collectionUid} collectionPathname={collectionPathname} searchText={searchText} />;
              })
            : null}
          {requestItems && requestItems.length
            ? requestItems.map((i: any) => {
                return <CollectionItem key={i.uid} item={i} collectionUid={collectionUid} collectionPathname={collectionPathname} searchText={searchText} />;
              })
            : null}
          {showEmptyFolderMessage ? (
            <div className="empty-folder-message flex items-center" style={{ opacity: 0.6 }}>
              {range(item.depth + 1).map((i: number) => (
                <div className="indent-block" key={i} style={{ width: 16, minWidth: 16, height: '100%' }}>
                  &nbsp;
                </div>
              ))}
              <div style={{ paddingLeft: 8 }}>
                <button
                  className="ml-1 add-request-link text-xs cursor-pointer hover:underline"
                  onClick={handleNewRequest}
                  style={{ background: 'none', border: 'none', color: 'inherit' }}
                >
                  + Add request
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </StyledWrapper>
  );
};

export default React.memo(CollectionItem);
