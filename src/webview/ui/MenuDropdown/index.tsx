import React, { forwardRef, useRef, useCallback, useState, useImperativeHandle, useEffect, useMemo, ReactNode } from 'react';
import Dropdown from 'components/Dropdown';

interface MenuItem {
  id: string;
  type?: 'item' | 'label' | 'divider';
  label?: string;
  ariaLabel?: string;
  title?: string;
  leftSection?: ReactNode;
  rightSection?: ReactNode;
  onClick?: () => void;
  testId?: string;
  disabled?: boolean;
  className?: string;
}

interface MenuGroup {
  name: string;
  options: MenuItem[];
}

type MenuItems = MenuItem[] | MenuGroup[];

interface MenuDropdownProps {
  items?: MenuItems;
  children?: ReactNode;
  placement?: string;
  className?: string;
  selectedItemId?: string;
  opened?: boolean;
  onChange?: (opened: boolean) => void;
  header?: ReactNode;
  footer?: ReactNode;
  showTickMark?: boolean;
  showGroupDividers?: boolean;
  groupStyle?: 'action' | 'select';
  autoFocusFirstOption?: boolean;
  'data-testid'?: string;
}

interface TippyInstance {
  popper: HTMLElement;
  hide: () => void;
  show: () => void;
}

export interface MenuDropdownRef {
  show: () => void;
  hide: () => void;
  toggle: () => void;
}

const NAVIGATION_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape'];
const ACTION_KEYS = ['Enter', ' '];

const getNextIndex = (currentIndex: number, total: number, key: string, noFocus: boolean): number => {
  if (key === 'Home') return 0;
  if (key === 'End') return total - 1;
  if (key === 'ArrowDown') return noFocus ? 0 : (currentIndex + 1) % total;
  if (key === 'ArrowUp') return noFocus ? total - 1 : (currentIndex - 1 + total) % total;
  return currentIndex;
};

/**
 * MenuDropdown - A reusable dropdown menu component with keyboard navigation
 */
const MenuDropdown = forwardRef<MenuDropdownRef, MenuDropdownProps & Record<string, unknown>>(({
  items = [],
  children,
  placement = 'bottom-end',
  className,
  selectedItemId,
  opened,
  onChange,
  header,
  footer,
  showTickMark = true,
  showGroupDividers = true,
  groupStyle = 'action',
  autoFocusFirstOption = false,
  'data-testid': testId = 'menu-dropdown',
  ...dropdownProps
}, ref) => {
  const tippyRef = useRef<TippyInstance | undefined>(undefined);
  const selectedItemIdRef = useRef(selectedItemId);
  const autoFocusFirstOptionRef = useRef(autoFocusFirstOption);
  const [internalIsOpen, setInternalIsOpen] = useState(false);

  // Cast props that may be unknown due to Record<string, unknown> intersection
  const onChangeCallback = onChange as ((opened: boolean) => void) | undefined;
  const headerContent = header as ReactNode;
  const footerContent = footer as ReactNode;
  const childrenContent = children as ReactNode;
  const openedState = opened as boolean | undefined;
  const testIdValue = testId as string;

  // Keep refs in sync
  useEffect(() => {
    selectedItemIdRef.current = selectedItemId;
  }, [selectedItemId]);

  useEffect(() => {
    autoFocusFirstOptionRef.current = autoFocusFirstOption;
  }, [autoFocusFirstOption]);

  const isControlled = openedState !== undefined;

  // Use controlled state if provided, otherwise use internal state
  const isOpen = isControlled ? openedState : internalIsOpen;

  const getMenuItems = useCallback((): Element[] => {
    const popper = tippyRef.current?.popper;
    if (!popper) return [];

    const menuContainer = popper.querySelector('[role="menu"]');
    if (!menuContainer) return [];

    return Array.from(
      menuContainer.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])')
    );
  }, []);

  const updateOpenState = useCallback((newState: boolean) => {
    if (isControlled) {
      onChangeCallback?.(newState);
    } else {
      setInternalIsOpen(newState);
    }
  }, [isControlled, onChangeCallback]);

  const handleItemClick = useCallback((item: MenuItem) => {
    if (item.disabled) return;
    item.onClick?.();
    updateOpenState(false);
  }, [updateOpenState]);

  // Convert legacy formats (grouped or flat) to standard MenuDropdown items format
  const normalizeItems = useCallback((itemsToNormalize: any) => {
    if (!Array.isArray(itemsToNormalize) || itemsToNormalize.length === 0) {
      return [];
    }

    const firstItem = itemsToNormalize[0];
    const isGrouped = firstItem != null && typeof firstItem === 'object' && 'options' in firstItem;

    if (isGrouped) {
      const result: any = [];
      itemsToNormalize.forEach((group, groupIndex) => {
        if (groupIndex > 0 && showGroupDividers) {
          result.push({ type: 'divider', id: `divider-${groupIndex}` });
        }

        if (group.name) {
          const normalizeGroupNameForId = (group.name || '').toLowerCase().replace(/ /g, '-');
          result.push({ type: 'label', id: `label-${normalizeGroupNameForId}-${groupIndex}`, label: group.name, groupStyle });
        }

        group.options.forEach((option: any) => {
          result.push({
            id: option.id,
            label: option.label,
            type: 'item',
            onClick: option.onClick,
            disabled: option.disabled,
            className: option.className,
            leftSection: option.leftSection,
            rightSection: option.rightSection,
            ariaLabel: option.ariaLabel,
            title: option.title,
            groupStyle: groupStyle
          });
        });
      });
      return result;
    }

    // Already in standard format, return as-is
    return itemsToNormalize;
  }, [showGroupDividers, groupStyle]);

  // Normalize items to standard format
  const normalizedItems = useMemo(() => normalizeItems(items), [items, normalizeItems]);

  // Enhance items with tick mark for selected item if showTickMark is enabled
  const enhancedItems = useMemo(() => {
    if (!showTickMark || selectedItemId == null) {
      return normalizedItems;
    }

    return normalizedItems.map((item: any) => {
      // Skip non-item types (dividers, labels)
      if (item.type && item.type !== 'item') {
        return item;
      }

      const isSelected = item.id === selectedItemId;

      // Only add tick mark if item is selected and doesn't already have a rightSection
      if (isSelected && !item.rightSection) {
        return {
          ...item,
          rightSection: <span className="ml-auto">✓</span>
        };
      }

      return item;
    });
  }, [normalizedItems, showTickMark, selectedItemId]);

  const clearFocusedClass = (menuContainer: any) => {
    if (menuContainer) {
      menuContainer.querySelectorAll('.dropdown-item-focused').forEach((el: any) => {
        el.classList.remove('dropdown-item-focused');
      });
    }
  };

  // Focus a menu item
  const focusMenuItem = (item: any, addFocusedClass = true) => {
    if (item) {
      const menuContainer = item.closest('[role="menu"]');
      clearFocusedClass(menuContainer);

      if (addFocusedClass) {
        item.classList.add('dropdown-item-focused');
      }
      item.focus();
      // scrollIntoView may not be available in test environments (jsdom)
      if (typeof item.scrollIntoView === 'function') {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  };

  // Keyboard navigation handler (handles all keyboard events at menu level)
  const handleMenuKeyDown = useCallback((e: any) => {
    const itemsToNavigate = getMenuItems();
    if (itemsToNavigate.length === 0) return;

    const currentIndex = itemsToNavigate.findIndex((el) => el === document.activeElement);
    const isNoMenuItemFocused = currentIndex === -1;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      updateOpenState(false);
      return;
    }

    if (ACTION_KEYS.includes(e.key) && !isNoMenuItemFocused) {
      e.preventDefault();
      e.stopPropagation();
      const currentItem = itemsToNavigate[currentIndex];
      const itemId = currentItem?.getAttribute('data-item-id');
      const item = enhancedItems.find((i: any) => i.id === itemId);
      if (item && !item.disabled) {
        handleItemClick(item);
      }
      return;
    }

    if (NAVIGATION_KEYS.includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      const nextIndex = getNextIndex(currentIndex, itemsToNavigate.length, e.key, isNoMenuItemFocused);
      focusMenuItem(itemsToNavigate[nextIndex], true);
    }
  }, [getMenuItems, enhancedItems, handleItemClick, updateOpenState]);

  const handleTriggerClick = useCallback(() => {
    updateOpenState(!isOpen);
  }, [isOpen, updateOpenState]);

  const handleClickOutside = useCallback(() => {
    updateOpenState(false);
  }, [updateOpenState]);

  // Expose imperative methods via ref
  useImperativeHandle(ref, () => ({
    show: () => {
      updateOpenState(true);
    },
    hide: () => {
      updateOpenState(false);
    },
    toggle: () => {
      updateOpenState(!isOpen);
    }
  }), [updateOpenState, isOpen]);

  const onDropdownCreate = useCallback((ref: any) => {
    tippyRef.current = ref;
    if (ref) {
      ref.setProps({
        onShow: () => {
          // Focus selected item if available, otherwise focus menu container
          // Use requestAnimationFrame to ensure DOM is ready
          requestAnimationFrame(() => {
            const menuContainer = ref.popper?.querySelector('[role="menu"]');
            if (!menuContainer) return;

            const menuItems: Element[] = Array.from(
              menuContainer.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])')
            );

            // If selectedItemId is provided, find and focus that item
            const currentSelectedItemId = selectedItemIdRef.current;
            if (currentSelectedItemId != null) {
              const selectedItemIdStr = String(currentSelectedItemId);
              const selectedItem = menuItems.find(
                (item) => item.getAttribute('data-item-id') === selectedItemIdStr
              );

              if (selectedItem) {
                focusMenuItem(selectedItem, true);
                return;
              }
            }

            // If autoFocusFirstOption is true, focus the first item
            if (autoFocusFirstOptionRef.current && menuItems.length > 0) {
              focusMenuItem(menuItems[0], true);
              return;
            }

            // Fallback: focus menu container
            menuContainer.focus();
          });
        },
        onHide: () => {
          const menuContainer = ref.popper?.querySelector('[role="menu"]');
          clearFocusedClass(menuContainer);
        }
      });
    }
  }, []);

  const renderSection = (section: any) => {
    if (!section) return null;

    // If it's a React component (function), render it with default icon props
    if (typeof section === 'function') {
      const SectionComponent = section;
      return <SectionComponent size={16} stroke={1.5} className="dropdown-icon" aria-hidden="true" />;
    }

    // If it's already a React element, render it as-is
    return section;
  };

  const renderMenuItem = (item: any) => {
    const selectIndentClass = item.groupStyle === 'select' ? 'dropdown-item-select' : '';
    const isActive = item.id === selectedItemId;
    const activeClass = isActive ? 'dropdown-item-active' : '';

    return (
      <div
        key={item.id}
        className={`dropdown-item ${item.disabled ? 'disabled' : ''} ${selectIndentClass} ${activeClass} ${item.className || ''}`.trim()}
        role="menuitem"
        data-item-id={item.id}
        onClick={() => !item.disabled && handleItemClick(item)}
        tabIndex={item.disabled ? -1 : 0}
        aria-label={item.ariaLabel}
        aria-disabled={item.disabled}
        aria-current={isActive ? 'true' : undefined}
        title={item.title}
        data-testid={`${testId}-${String(item.id).toLowerCase()}`}
      >
        {renderSection(item.leftSection)}
        <span className="dropdown-label">{item.label}</span>
        {item.rightSection && (
          <div
            className="dropdown-right-section"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {renderSection(item.rightSection)}
          </div>
        )}
      </div>
    );
  };

  const renderLabel = (item: any) => <div
    key={item.id || `label-${item.label}`}
    className={`label-item ${item.groupStyle === 'select' ? 'label-select' : ''}`}
    role="presentation"
    data-testid={`${testId}-label-${(item.label || '').toLowerCase().replace(/ /g, '-')}`}
  >
    {item.groupStyle === 'select' ? (item.label || '').toUpperCase() : item.label || ''}
  </div>;

  const renderDivider = (item: any, index: any) => (
    <div key={item.id || `divider-${index}`} className="dropdown-separator" role="separator" />
  );

  const renderMenuContent = () => {
    let dividerIndex = 0;

    return enhancedItems.map((item: any) => {
      const itemType = item.type || 'item';

      if (itemType === 'label') {
        return renderLabel(item);
      }

      if (itemType === 'divider') {
        return renderDivider(item, dividerIndex++);
      }

      return renderMenuItem(item);
    });
  };

  // Clone children to attach click handler and aria-expanded
  const triggerElement = React.isValidElement(childrenContent)
    ? React.cloneElement(childrenContent as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void; 'aria-expanded'?: boolean; 'data-testid'?: string }>, {
        'onClick': (e: React.MouseEvent) => {
          (childrenContent as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>).props.onClick?.(e);
          handleTriggerClick();
        },
        'aria-expanded': isOpen,
        'data-testid': testIdValue
      })
    : <div onClick={handleTriggerClick} aria-expanded={isOpen} data-testid={testIdValue}>{childrenContent}</div>;

  return (
    <Dropdown
      onCreate={onDropdownCreate}
      icon={triggerElement}
      placement={placement}
      className={className}
      visible={isOpen}
      onClickOutside={handleClickOutside}
      {...dropdownProps}
    >
      <div {...(testIdValue && { 'data-testid': testIdValue + '-dropdown' })}>
        {headerContent && (
          <div className="dropdown-header-container" onClick={handleClickOutside}>
            {headerContent}
            <div className="dropdown-divider"></div>
          </div>
        )}
        <div role="menu" tabIndex={-1} onKeyDown={handleMenuKeyDown}>
          {renderMenuContent()}
        </div>
        {footerContent && (
          <>
            <div className="dropdown-divider"></div>
            <div className="dropdown-footer-container">
              {footerContent}
            </div>
          </>
        )}
      </div>
    </Dropdown>
  );
});

export default MenuDropdown;
