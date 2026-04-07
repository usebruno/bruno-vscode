import { useDispatch, useSelector } from 'react-redux';
import type { TypedUseSelectorHook } from 'react-redux';
import type { RootState, AppDispatch } from './index';

/**
 * Use this typed version of useDispatch throughout the app instead of plain `useDispatch`.
 * This ensures all dispatched actions are properly typed.
 */
export const useAppDispatch: () => AppDispatch = useDispatch;

/**
 * Use this typed version of useSelector throughout the app instead of plain `useSelector`.
 * This provides proper typing for the state parameter without needing to annotate it each time.
 *
 * @example
 * // Before (requires explicit typing):
 * const collections = useSelector((state: RootState) => state.collections.collections);
 *
 * // After (type-safe by default):
 * const collections = useAppSelector((state) => state.collections.collections);
 */
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
