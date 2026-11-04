import { useState } from 'react';

interface UseSearchCollapseResult {
  collapsed: boolean;
  toggleCollapsed: () => void;
}

/**
 * Collapse state for a sidebar tree row that also honors an active search.
 *
 * During a search every matching branch auto-expands so results stay visible,
 * yet the user can still collapse a branch — that choice lives in local state
 * and resets when the search session ends. Without a search the persisted
 * Redux `collapsed` flag drives the row.
 */
const useSearchCollapse = (
  hasSearchText: boolean,
  persistedCollapsed: boolean,
  togglePersisted: () => void
): UseSearchCollapseResult => {
  const [searchCollapsed, setSearchCollapsed] = useState(false);
  const [prevHasSearchText, setPrevHasSearchText] = useState(hasSearchText);

  if (prevHasSearchText !== hasSearchText) {
    setPrevHasSearchText(hasSearchText);
    setSearchCollapsed(false);
  }

  const collapsed = hasSearchText ? searchCollapsed : persistedCollapsed;

  const toggleCollapsed = () => {
    if (hasSearchText) {
      setSearchCollapsed((prev) => !prev);
    } else {
      togglePersisted();
    }
  };

  return { collapsed, toggleCollapsed };
};

export default useSearchCollapse;
