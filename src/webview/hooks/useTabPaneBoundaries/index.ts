import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppSelector } from 'providers/ReduxStore/hooks';

const MIN_TOP_PANE_HEIGHT = 380;

interface TabPaneBoundaries {
  left: number;
  top: number;
  setLeft: (value: number) => void;
  setTop: (value: number) => void;
  reset: () => void;
}

// Global storage for pane sizes per key - persists across component remounts
const paneSizeCache: Record<string, { left: number | null; top: number | null }> = {};

export function useTabPaneBoundaries(activeTabUid?: string): TabPaneBoundaries {
  const screenWidth = useAppSelector((state) => state.app.screenWidth);

  // Default to half the screen width
  const defaultPaneWidth = screenWidth / 2;

  // Use a cache key - fall back to 'default' if no key provided
  const cacheKey = activeTabUid || 'default';

  // Initialize from cache or use defaults
  const getCachedValues = () => {
    const cached = paneSizeCache[cacheKey];
    return {
      left: cached?.left ?? null,
      top: cached?.top ?? null
    };
  };

  const [leftOverride, setLeftOverrideState] = useState<number | null>(() => getCachedValues().left);
  const [topOverride, setTopOverrideState] = useState<number | null>(() => getCachedValues().top);

  // Track the current cache key to detect changes
  const prevKeyRef = useRef(cacheKey);

  // When the key changes, restore from cache
  useEffect(() => {
    if (prevKeyRef.current !== cacheKey) {
      const cached = paneSizeCache[cacheKey];
      setLeftOverrideState(cached?.left ?? null);
      setTopOverrideState(cached?.top ?? null);
      prevKeyRef.current = cacheKey;
    }
  }, [cacheKey]);

  const left = leftOverride ?? defaultPaneWidth;
  const top = topOverride ?? MIN_TOP_PANE_HEIGHT;

  const setLeft = useCallback((value: number) => {
    setLeftOverrideState(value);
    // Update cache
    if (!paneSizeCache[cacheKey]) {
      paneSizeCache[cacheKey] = { left: null, top: null };
    }
    paneSizeCache[cacheKey].left = value;
  }, [cacheKey]);

  const setTop = useCallback((value: number) => {
    setTopOverrideState(value);
    // Update cache
    if (!paneSizeCache[cacheKey]) {
      paneSizeCache[cacheKey] = { left: null, top: null };
    }
    paneSizeCache[cacheKey].top = value;
  }, [cacheKey]);

  const reset = useCallback(() => {
    setLeftOverrideState(null);
    setTopOverrideState(null);
    // Clear cache for this key
    if (paneSizeCache[cacheKey]) {
      paneSizeCache[cacheKey] = { left: null, top: null };
    }
  }, [cacheKey]);

  return { left, top, setLeft, setTop, reset };
}
