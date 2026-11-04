// Keys must match getEntryKind() in buildEntries.ts.
// `kind` is a stable identifier used for data-testids (e.g. timeline-badge-oauth).
export interface EntryMeta {
  kind: string;
  chipLabel: string;
  badgeLabel: string;
  badgeClass: string;
}

export const ENTRY_KINDS: Record<string, EntryMeta> = {
  main: { kind: 'main', chipLabel: 'Request', badgeLabel: 'request', badgeClass: 'tl-badge tl-badge--main' },
  oauth: { kind: 'oauth', chipLabel: 'OAuth', badgeLabel: 'oauth2.0', badgeClass: 'tl-badge tl-badge--oauth2' }
};

export const FILTER_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'main', label: ENTRY_KINDS.main.chipLabel },
  { id: 'oauth', label: ENTRY_KINDS.oauth.chipLabel }
];

export const getBadge = (isOauth2?: boolean): EntryMeta => (isOauth2 ? ENTRY_KINDS.oauth : ENTRY_KINDS.main);
