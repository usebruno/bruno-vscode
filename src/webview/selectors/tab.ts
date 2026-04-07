import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from 'providers/ReduxStore';

interface TabSelectorArgs {
  itemUid: string;
}

export const isTabForItemActive = ({ itemUid }: TabSelectorArgs) => createSelector(
  [(state: RootState) => state.tabs?.activeTabUid],
  (activeTabUid) => activeTabUid === itemUid
);

export const isTabForItemPresent = ({ itemUid }: TabSelectorArgs) => createSelector(
  [(state: RootState) => state.tabs.tabs],
  (tabs) => tabs.some((tab: { uid: string }) => tab.uid === itemUid)
);
