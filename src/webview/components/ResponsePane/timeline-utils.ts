import { useMemo } from 'react';
import { getEffectiveAuthSource } from 'utils/auth';
import { buildTimelineEntries } from './Timeline/buildEntries';
import type { TimelineDisplayEntry } from './Timeline/buildEntries';
import type { AppCollection, AppItem } from '@bruno-types';

/**
 * The rows the Timeline tab renders, newest first. Includes OAuth2 token calls recorded against an
 * ancestor when this item inherits its auth, so the calls that produced its credentials are visible;
 * each token call becomes its own row. The tab badge and the empty state must use this too, or the
 * count disagrees with what the panel shows.
 */
export const getTimelineEntries = (collection: AppCollection | undefined, item: AppItem): TimelineDisplayEntry[] => {
  if (!collection?.timeline?.length) {
    return [];
  }

  return buildTimelineEntries(collection.timeline, item.uid, getEffectiveAuthSource(collection, item));
};

export const useTimelineEntries = (collection: AppCollection | undefined, item: AppItem): TimelineDisplayEntry[] =>
  useMemo(() => getTimelineEntries(collection, item), [collection?.timeline, item]);
