import { customAlphabet } from 'nanoid';
import iconv from 'iconv-lite';
import { cloneDeep } from 'lodash';
import FormData from 'form-data';
import { formatMultipartData } from './form-data';

interface ResponseWithHeaders {
  headers: Record<string, string>;
  data: Buffer | string | unknown;
}

interface RequestWithData {
  mode?: string;
  data?: unknown;
  _originalMultipartData?: MultipartDataItem[];
  headers?: Record<string, string>;
}

interface MultipartDataItem {
  name: string;
  value: string | Buffer;
  type?: string;
}

interface ParsedData {
  data: unknown;
  dataBuffer: Buffer | null;
}

// a customized version of nanoid without using _ and -
export const uuid = (): string => {
  // https://github.com/ai/nanoid/blob/main/url-alphabet/index.js
  const urlAlphabet = 'useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict';
  const customNanoId = customAlphabet(urlAlphabet, 21);
  return customNanoId();
};

export const stringifyJson = async (str: unknown): Promise<string> => {
  try {
    return JSON.stringify(str, null, 2);
  } catch (err) {
    return Promise.reject(err);
  }
};

export const parseJson = async <T = unknown>(obj: string): Promise<T> => {
  try {
    return JSON.parse(obj) as T;
  } catch (err) {
    return Promise.reject(err);
  }
};

const getCircularReplacer = (): ((key: string, value: unknown) => unknown) => {
  const seen = new WeakSet();
  return (_key: string, value: unknown): unknown => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  };
};

export const safeStringifyJSON = (data: unknown, indent: number | null = null): string | undefined => {
  if (data === undefined) return undefined;
  try {
    return JSON.stringify(data, getCircularReplacer(), indent ?? undefined);
  } catch (e) {
    console.warn('Failed to stringify data:', (e as Error).message);
    return String(data);
  }
};

export const safeParseJSON = <T = unknown>(data: string): T | string => {
  try {
    return JSON.parse(data) as T;
  } catch {
    return data;
  }
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

export const generateUidBasedOnHash = (str: string): string => {
  const hash = simpleHash(str);
  return `${hash}`.padEnd(21, '0');
};

export const flattenDataForDotNotation = (data: unknown): Record<string, unknown> => {
  const result: Record<string, unknown> = {};

  function recurse(current: unknown, prop: string): void {
    if (Object(current) !== current) {
      result[prop] = current;
    } else if (Array.isArray(current)) {
      for (let i = 0, l = current.length; i < l; i++) {
        recurse(current[i], prop + '[' + i + ']');
      }
      if (current.length === 0) {
        result[prop] = [];
      }
    } else {
      let isEmpty = true;
      for (const p in current as Record<string, unknown>) {
        isEmpty = false;
        recurse((current as Record<string, unknown>)[p], prop ? prop + '.' + p : p);
      }
      if (isEmpty && prop) {
        result[prop] = {};
      }
    }
  }

  recurse(data, '');
  return result;
};

export const parseDataFromResponse = (
  response: ResponseWithHeaders,
  disableParsingResponseJson = false
): ParsedData => {
  const charsetMatch = /charset=([^()<>@,;:"/[\]?.=\s]*)/i.exec(response.headers['content-type'] || '');
  const charsetValue = charsetMatch?.[1];
  const dataBuffer = Buffer.from(response.data as Buffer | string);

  let data: unknown;
  if (charsetValue && iconv.encodingExists(charsetValue)) {
    data = iconv.decode(dataBuffer, charsetValue);
  } else {
    data = iconv.decode(dataBuffer, 'utf-8');
  }

  try {
    data = (data as string).replace(/^\uFEFF/, '');
    if (!disableParsingResponseJson) {
      data = JSON.parse(data as string);
    }
  } catch {
    // Keep data as string if JSON parse fails
  }

  return { data, dataBuffer };
};

export const parseDataFromRequest = (request: RequestWithData): ParsedData => {
  let requestDataString: string | undefined;

  // File uploads are redacted, multipart FormData is formatted from original data for readability
  if (request.mode === 'file') {
    requestDataString = '<request body redacted>';
  } else if (request?.data instanceof FormData && Array.isArray(request._originalMultipartData)) {
    const boundary = (request.data as FormData & { _boundary?: string })._boundary || 'boundary';
    requestDataString = formatMultipartData(request._originalMultipartData, boundary);
  } else {
    requestDataString = typeof request?.data === 'string' ? request?.data : safeStringifyJSON(request?.data);
  }

  const requestCopy = cloneDeep(request);
  if (!requestCopy.data) {
    return { data: null, dataBuffer: null };
  }
  requestCopy.data = requestDataString;
  return parseDataFromResponse(requestCopy as unknown as ResponseWithHeaders);
};
