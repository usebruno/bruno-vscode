import find from 'lodash/find';
import type { AppItem, Tab } from '@bruno-types';

export const isItemARequest = (item: AppItem): boolean => {
  if (!item) return false;
  return 'request' in item && ['http-request', 'graphql-request', 'grpc-request', 'ws-request'].includes(item.type);
};

export const isItemAFolder = (item: AppItem): boolean => {
  if (!item) return false;
  return !('request' in item) && item.type === 'folder';
};

export const itemIsOpenedInTabs = (item: AppItem, tabs: Tab[]): Tab | undefined => {
  return find(tabs, (t) => t.uid === item.uid);
};

export const scrollToTheActiveTab = (): void => {
  const activeTab = document.querySelector('.request-tab.active');
  if (activeTab) {
    activeTab.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};
