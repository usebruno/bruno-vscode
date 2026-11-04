import type { NetworkLogEntry } from '@bruno-types';

export interface SentHeader {
  name: string;
  value: string;
}

/** Headers sent on the final hop. A redirect logs one `requestHeader` block per hop, and only the last reached the responding server. */
export const getRequestHeaders = (timeline?: NetworkLogEntry[] | null): SentHeader[] => {
  console.log("timeline", timeline)
  if (!Array.isArray(timeline)) {
    return [];
  }

  const headers: SentHeader[] = [];
  let foundBlock = false;

  // Scan backward: the first header opens the last hop's block, the next non-header ends it. `unshift` restores wire order.
  for (let i = timeline.length - 1; i >= 0; i--) {
    const item = timeline[i];
    const isHeader = item?.type === 'requestHeader';

    if (foundBlock && !isHeader) {
      break;
    }
    if (!isHeader) {
      continue;
    }

    foundBlock = true;

    if (typeof item.message === 'string') {
      const separatorIdx = item.message.indexOf(':');
      if (separatorIdx !== -1) {
        headers.unshift({
          name: item.message.slice(0, separatorIdx).trim(),
          value: item.message.slice(separatorIdx + 1).trim()
        });
      }
    }
  }
  return headers;
};
