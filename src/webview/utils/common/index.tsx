import { customAlphabet } from 'nanoid';
import xmlFormat from 'xml-formatter';
import { JSONPath } from 'jsonpath-plus';
import fastJsonFormat from 'fast-json-format';
import { format, applyEdits } from 'jsonc-parser';
// @ts-expect-error - @usebruno/common/utils types incomplete
import { patternHasher } from '@usebruno/common/utils';

declare global {
  interface Window {
    isPlaywright?: boolean;
  }
}

export const isPlaywright = (): boolean => {
  return typeof window !== 'undefined' && window.isPlaywright === true;
};

// a customized version of nanoid without using _ and -
export const uuid = (): string => {
  // https://github.com/ai/nanoid/blob/main/url-alphabet/index.js
  const urlAlphabet = 'useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict';
  const customNanoId = customAlphabet(urlAlphabet, 21);

  return customNanoId();
};

export const simpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash &= hash; // Convert to 32bit integer
  }
  return new Uint32Array([hash])[0].toString(36);
};

export const waitForNextTick = (): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), 0);
  });
};

export const safeParseJSON = <T = unknown>(str: string | null | undefined): T | string => {
  if (!str || typeof str !== 'string') {
    return str as string;
  }
  try {
    return JSON.parse(str) as T;
  } catch (e) {
    return str;
  }
};

export const safeStringifyJSON = (obj: unknown, indent = false): string | undefined => {
  if (obj === undefined) {
    return undefined;
  }
  try {
    if (indent) {
      return JSON.stringify(obj, null, 2);
    }
    return JSON.stringify(obj);
  } catch (e) {
    return String(obj);
  }
};

interface XmlFormatOptions {
  collapseContent?: boolean;
  lineSeparator?: string;
  whiteSpaceAtEndOfSelfClosingTag?: boolean;
}

export const safeParseXML = (str: string | null | undefined, options?: XmlFormatOptions): string => {
  if (!str || typeof str !== 'string') {
    return str ?? '';
  }
  try {
    return xmlFormat(str, options);
  } catch (e) {
    return str;
  }
};

export const normalizeFileName = (name: string | null | undefined): string => {
  if (!name) {
    return name ?? '';
  }

  const validChars = /[^\w\s-]/g;
  const formattedName = name.replace(validChars, '-');

  return formattedName;
};

export const getContentType = (headers: Record<string, string> | null | undefined): string => {
  if (!headers || typeof headers !== 'object' || Object.keys(headers).length === 0) {
    return '';
  }

  const contentTypeHeader = Object.entries(headers)
    .find(([key]) => key.toLowerCase() === 'content-type');

  const contentType = contentTypeHeader?.[1];

  if (!contentType || typeof contentType !== 'string') {
    return '';
  }
  // This pattern matches content types like application/json, application/ld+json, text/json, etc.
  const JSON_PATTERN = /^[\w\-]+\/([\w\-]+\+)?json/;
  // This pattern matches content types like image/svg.
  const SVG_PATTERN = /^image\/svg/i;
  // This pattern matches content types like application/xml, text/xml, application/atom+xml, etc.
  const XML_PATTERN = /^[\w\-]+\/([\w\-]+\+)?xml/;
  // This pattern matches JavaScript content types: application/javascript, text/javascript, application/ecmascript, text/ecmascript
  const JAVASCRIPT_PATTERN = /^(application|text)\/(javascript|ecmascript)/i;

  if (JSON_PATTERN.test(contentType)) {
    return 'application/ld+json';
  } else if (SVG_PATTERN.test(contentType)) {
    return 'image/svg+xml';
  } else if (XML_PATTERN.test(contentType)) {
    return 'application/xml';
  } else if (JAVASCRIPT_PATTERN.test(contentType)) {
    return 'application/javascript';
  }

  return contentType;
};

export const startsWith = (str: string | null | undefined, search: string | null | undefined): boolean => {
  if (!str || typeof str !== 'string') {
    return false;
  }

  if (!search || typeof search !== 'string') {
    return false;
  }

  return str.substr(0, search.length) === search;
};

export const pluralizeWord = (word: string, count: number): string => {
  return count === 1 ? word : `${word}s`;
};

export const relativeDate = (dateString: string | Date): string => {
  const date = new Date(dateString);
  const currentDate = new Date();

  const difference = currentDate.getTime() - date.getTime();
  const secondsDifference = Math.floor(difference / 1000);
  const minutesDifference = Math.floor(secondsDifference / 60);
  const hoursDifference = Math.floor(minutesDifference / 60);
  const daysDifference = Math.floor(hoursDifference / 24);
  const weeksDifference = Math.floor(daysDifference / 7);
  const monthsDifference = Math.floor(daysDifference / 30);

  if (secondsDifference < 60) {
    return 'Few seconds ago';
  } else if (minutesDifference < 60) {
    return `${minutesDifference} minute${minutesDifference > 1 ? 's' : ''} ago`;
  } else if (hoursDifference < 24) {
    return `${hoursDifference} hour${hoursDifference > 1 ? 's' : ''} ago`;
  } else if (daysDifference < 7) {
    return `${daysDifference} day${daysDifference > 1 ? 's' : ''} ago`;
  } else if (weeksDifference < 4) {
    return `${weeksDifference} week${weeksDifference > 1 ? 's' : ''} ago`;
  } else {
    return `${monthsDifference} month${monthsDifference > 1 ? 's' : ''} ago`;
  }
};

export const humanizeDate = (dateString: string | null | undefined): string => {
  // See this discussion for why .split is necessary
  // https://stackoverflow.com/questions/7556591/is-the-javascript-date-object-always-one-day-off

  if (!dateString || typeof dateString !== 'string') {
    return 'Invalid Date';
  }
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return 'Invalid Date';
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

export const generateUidBasedOnHash = (str: string): string => {
  const hash = simpleHash(str);

  return `${hash}`.padEnd(21, '0');
};

export const stringifyIfNot = (v: unknown): string => typeof v === 'string' ? v : String(v);

export const getEncoding = (headers: Record<string, string> | null | undefined): string | undefined => {
  // Parse the charset from content type: https://stackoverflow.com/a/33192813
  const charsetMatch = /charset=([^()<>@,;:"/[\]?.=\s]*)/i.exec(headers?.['content-type'] || '');
  return charsetMatch?.[1];
};

export const multiLineMsg = (...messages: (string | null | undefined)[]): string => {
  return messages.filter((m) => m !== undefined && m !== null && m !== '').join('\n');
};

export const formatSize = (bytes: number): string => {
  if (isNaN(bytes) || typeof bytes !== 'number') {
    return '0B';
  }

  if (bytes < 1024) {
    return bytes + 'B';
  }
  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + 'KB';
  }
  if (bytes < 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
  }

  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + 'GB';
};

interface SortableItem {
  name?: string;
  seq?: number;
  [key: string]: unknown;
}

export const sortByNameThenSequence = <T extends SortableItem>(items: T[]): T[] => {
  const isSeqValid = (seq: number | undefined): seq is number =>
    Number.isFinite(seq) && Number.isInteger(seq) && (seq as number) > 0;

  const alphabeticallySorted = [...items].sort((a, b) =>
    a.name && b.name ? a.name.localeCompare(b.name) : 0
  );

  const withoutSeq = alphabeticallySorted.filter((f) => !isSeqValid(f.seq));

  const withSeq = alphabeticallySorted
    .filter((f): f is T & { seq: number } => isSeqValid(f.seq))
    .sort((a, b) => a.seq - b.seq);

  const sortedItems: (T | T[])[] = [...withoutSeq];

  // Insert folders with 'seq' at their specified positions
  withSeq.forEach((item) => {
    const position = item.seq - 1;
    const existingItem = sortedItems[position];

    const hasItemWithSameSeq = Array.isArray(existingItem)
      ? (existingItem[0] as SortableItem)?.seq === item.seq
      : (existingItem as SortableItem)?.seq === item.seq;

    if (hasItemWithSameSeq) {
      // If there's a conflict, group items with same sequence together
      const newGroup = Array.isArray(existingItem)
        ? [...existingItem, item]
        : [existingItem as T, item];

      sortedItems.splice(position, 1, newGroup);
    } else {
      // Insert item at the specified position
      sortedItems.splice(position, 0, item);
    }
  });

  return sortedItems.flat() as T[];
};

// Memory threshold to prevent crashes when decoding large buffers
const LARGE_BUFFER_THRESHOLD = 50 * 1024 * 1024; // 50 MB

const applyJSONPathFilter = (data: unknown, filter: string): unknown => {
  try {
    return JSONPath({ path: filter, json: data });
  } catch (e) {
    console.warn('Could not apply JSONPath filter:', (e as Error).message);
    return data;
  }
};

export const formatResponse = (
  data: unknown,
  dataBufferString: string | null | undefined,
  mode: string | null | undefined,
  filter: string | null | undefined,
  bufferThreshold = LARGE_BUFFER_THRESHOLD
): string => {
  if (data === undefined || !dataBufferString || !mode) {
    return '';
  }

  let bufferSize = 0, rawData = '', isVeryLargeResponse = false;
  try {
    const dataBuffer = Buffer.from(dataBufferString, 'base64');
    bufferSize = dataBuffer.length;
    isVeryLargeResponse = bufferSize > bufferThreshold;
    if (!isVeryLargeResponse) {
      rawData = dataBuffer.toString();
    }
  } catch (error) {
    console.warn('Failed to calculate buffer size:', error);
  }

  if (mode.includes('json')) {
    try {
      if (filter) {
        return safeStringifyJSON(applyJSONPathFilter(data, filter), true) ?? '';
      }
    } catch (error) {}

    if (isVeryLargeResponse) {
      return safeStringifyJSON(data, false) ?? '';
    }

    try {
      return fastJsonFormat(rawData);
    } catch (error) {}

    if (typeof data === 'string') {
      return data;
    }
    // Try to stringify the data, fallback to String conversion if needed
    const stringified = safeStringifyJSON(data, false);
    return typeof stringified === 'string' ? stringified : String(data);
  }

  if (mode.includes('xml')) {
    if (isVeryLargeResponse) {
      return typeof data === 'string' ? data : safeStringifyJSON(data, false) ?? '';
    }

    const parsed = safeParseXML(typeof data === 'string' ? data : '', { collapseContent: true });
    if (typeof parsed === 'string') {
      return parsed;
    }
    return safeStringifyJSON(parsed, true) ?? '';
  }

  if (mode.includes('html')) {
    if (isVeryLargeResponse) {
      if (typeof data === 'string') {
        return data;
      }
      if (data === null || data === undefined) {
        return String(data);
      }
      if (typeof data === 'object') {
        return safeStringifyJSON(data, false) ?? '';
      }
      return String(data);
    }

    const htmlString = rawData;
    try {
      return prettifyHtmlString(htmlString);
    } catch (error) {
      return htmlString;
    }
  }

  if (mode.includes('javascript')) {
    if (isVeryLargeResponse) {
      if (typeof data === 'string') {
        return data;
      }
      if (data === null || data === undefined) {
        return String(data);
      }
      if (typeof data === 'object') {
        return safeStringifyJSON(data, false) ?? '';
      }
      return String(data);
    }

    const jsString = rawData;

    try {
      return prettifyJavaScriptString(jsString);
    } catch (error) {
      return jsString;
    }
  }

  if (mode.includes('hex')) {
    if (typeof data === 'string' && isHexFormat(data)) {
      // Data is already in hex format, return it as-is
      return data;
    }

    // Data is not in hex format, encode it to hex
    try {
      const dataBuffer = Buffer.from(dataBufferString, 'base64');
      const hexView = formatHexView(dataBuffer);
      return hexView;
    } catch (error) {
      // If buffer conversion fails, try to encode the string data directly
      if (typeof data === 'string') {
        try {
          const stringBuffer = Buffer.from(data, 'utf8');
          return formatHexView(stringBuffer);
        } catch (stringError) {
          return '';
        }
      }
      return '';
    }
  }

  if (mode.includes('base64')) {
    return dataBufferString;
  }

  if (mode.includes('text') || mode.includes('raw')) {
    if (isVeryLargeResponse) {
      if (typeof data === 'string') {
        return data;
      }
      if (data === null || data === undefined) {
        return String(data);
      }
      if (typeof data === 'object') {
        return safeStringifyJSON(data, false) ?? '';
      }
      return String(data);
    }
    return rawData;
  }

  if (typeof data === 'string') {
    return data;
  }

  return safeStringifyJSON(data, !isVeryLargeResponse) ?? '';
};

export const prettifyJsonString = (jsonDataString: string): string => {
  if (typeof jsonDataString !== 'string') return jsonDataString;

  try {
    const { hashed, restore } = patternHasher(jsonDataString);
    const edits = format(hashed, undefined, { tabSize: 2, insertSpaces: true });
    const formattedJsonDataStringHashed = applyEdits(hashed, edits);
    const formattedJsonDataString = restore(formattedJsonDataStringHashed);
    return formattedJsonDataString;
  } catch (error) {
    console.error(error);
  }
  return jsonDataString;
};

/**
 * Returns the given string value converted to title case.
 * - If the value is falsy, returns an empty string.
 * - Special-case: if the value is 'default', returns 'Default'.
 * - Otherwise, splits the string on whitespace, hyphens, or underscores,
 *   uppercases the first letter of each word, and lowercases the rest.
 *
 * @param str - The input string to convert.
 * @returns The converted title-case string.
 */
export const toTitleCase = (str: string | null | undefined): string => {
  if (!str) return '';
  if (str === 'default') return 'Default';
  return str
    .split(/[\s-_]+/)
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// Simple HTML formatter that indents HTML properly
export function prettifyHtmlString(htmlString: string): string {
  if (typeof htmlString !== 'string') return htmlString;

  try {
    return xmlFormat(htmlString, {
      collapseContent: true,
      lineSeparator: '\n',
      whiteSpaceAtEndOfSelfclosingTag: true
    });
  } catch (error) {
    console.error(error);
    // Fallback: return original string if formatting fails
    return htmlString;
  }
}

// Simple JavaScript formatter
// Note: In Prettier v3+, format() is async, so we just return the raw string
// since making the entire formatResponse chain async would be a larger refactor
export function prettifyJavaScriptString(jsString: string): string {
  if (typeof jsString !== 'string') return jsString;

  // Return raw string - prettification would require async handling
  // which isn't compatible with the current synchronous formatResponse chain
  return jsString;
}

export const isValidHtml = (str: string | null | undefined): boolean => {
  if (typeof str !== 'string' || !str.trim()) return false;
  return /<\s*html[\s>]/i.test(str);
};

export function formatHexView(buffer: Buffer): string {
  const width = 16;
  let output = '';

  for (let i = 0; i < buffer.length; i += width) {
    const slice = buffer.slice(i, i + width);
    const hex = Array.from(slice)
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');
    const ascii = Array.from(slice)
      .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
      .join('');

    output += `${i.toString(16).padStart(8, '0')}: ${hex.padEnd(48)} ${ascii}\n`;
  }

  return output;
}

// Function to detect if a string is already in hex format
// Checks if the string looks like hex dump format (with addresses and ASCII) or plain hex
export function isHexFormat(str: string | null | undefined): boolean {
  if (typeof str !== 'string' || !str.trim()) {
    return false;
  }

  const trimmed = str.trim();

  const hexDumpPattern = /^[0-9a-fA-F]{8}:\s+([0-9a-fA-F]{2}\s+){1,16}/m;
  if (hexDumpPattern.test(trimmed)) {
    return true;
  }

  const hexOnly = trimmed.replace(/\s+/g, '');
  if (hexOnly.length > 0 && /^[0-9a-fA-F]+$/i.test(hexOnly)) {
    // Make sure it's not too short (could be a regular number) and has even length
    // Require minimum length of 6 to reduce false positives (e.g., "dead", "beef")
    // Also require at least one digit 0-9 to avoid matching all-letter words
    if (hexOnly.length >= 6 && hexOnly.length % 2 === 0 && /[0-9]/.test(hexOnly)) {
      return true;
    }
  }

  return false;
}
