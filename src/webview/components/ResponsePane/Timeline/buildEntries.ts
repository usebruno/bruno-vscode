import type { TimelineEntry } from '@bruno-types';

export interface OAuth2DebugCall {
  request?: unknown;
  response?: unknown;
}

export interface AuthSource {
  type: string;
  uid: string;
  auth?: unknown;
}

/** A timeline entry as rendered: an OAuth2 parent is expanded into one entry per token call. */
export type TimelineDisplayEntry = TimelineEntry & {
  _oauth2Child?: OAuth2DebugCall;
};

export type EntryKind = 'main' | 'oauth';

export const getEntryKind = (entry: TimelineDisplayEntry): EntryKind =>
  (entry.type === 'oauth2' ? 'oauth' : 'main');

const findPairedMainTimestamps = (fullTimeline: TimelineDisplayEntry[]) => {
  const map = new Map<number, number>();
  fullTimeline.forEach((entry, idx) => {
    if (entry.type !== 'oauth2') return;
    for (let j = idx + 1; j < fullTimeline.length; j++) {
      const candidate = fullTimeline[j];
      if (
        candidate.type === 'request'
        && candidate.itemUid === entry.itemUid
        && typeof candidate.timestamp === 'number'
      ) {
        map.set(idx, candidate.timestamp);
        break;
      }
    }
  });
  return map;
};

const isVisibleEntry = (entry: TimelineDisplayEntry, itemUid: string, authSource: AuthSource | null) => {
  if (entry.itemUid === itemUid) return true;
  if (entry.type === 'oauth2' && authSource) {
    if (authSource.type === 'folder' && entry.folderUid === authSource.uid) return true;
    if (authSource.type === 'collection' && !entry.folderUid) return true;
  }
  return false;
};

/** Token calls are placed just before the request they authorized, in the order they were made. */
const expandOauthEntry = (entry: TimelineDisplayEntry, paired?: number): TimelineDisplayEntry[] => {
  const debugInfo = (entry.data?.debugInfo || []) as OAuth2DebugCall[];
  // No sub-calls to render, so drop the parent and the OAuth chip count with it.
  if (debugInfo.length === 0) return [];
  const n = debugInfo.length;
  const mainAnchor = paired != null ? paired : entry.timestamp + n;
  return debugInfo.map((sub, i) => ({
    ...entry,
    timestamp: mainAnchor - (n - i),
    _oauth2Child: sub
  }));
};

export const buildTimelineEntries = (
  timeline: TimelineEntry[] | undefined,
  itemUid: string,
  authSource: AuthSource | null
): TimelineDisplayEntry[] => {
  const fullTimeline: TimelineDisplayEntry[] = timeline || [];
  const pairedMainByOauthIdx = findPairedMainTimestamps(fullTimeline);

  const flat: TimelineDisplayEntry[] = [];
  fullTimeline.forEach((entry, idx) => {
    if (!isVisibleEntry(entry, itemUid, authSource)) return;
    if (entry.type === 'oauth2') {
      flat.push(...expandOauthEntry(entry, pairedMainByOauthIdx.get(idx)));
    } else {
      flat.push(entry);
    }
  });

  // Two token fetches before the same send share an anchor, so ties fall back to timeline order.
  return flat
    .map((entry, order) => ({ entry, order }))
    .sort((a, b) => (b.entry.timestamp - a.entry.timestamp) || (b.order - a.order))
    .map(({ entry }) => entry);
};

export type KindCounts = Record<string, number>;

export const countByKind = (entries: TimelineDisplayEntry[]): KindCounts => {
  const counts: KindCounts = { all: entries.length, main: 0, oauth: 0 };
  entries.forEach((entry) => {
    counts[getEntryKind(entry)]++;
  });
  return counts;
};
