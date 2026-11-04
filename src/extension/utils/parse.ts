import { stripDirtyMarker } from './dirty-marker';

const {
  parseRequest: parseRequestFile,
  parseRequestViaWorker: parseRequestFileViaWorker,
  parseCollection: parseCollectionFile,
  parseFolder: parseFolderFile,
  parseEnvironment: parseEnvironmentFile
} = require('@usebruno/filestore');

interface ParseOptions {
  format?: string;
  filename?: string;
}

interface ParsedRequest {
  request?: {
    body?: {
      json?: string;
      text?: string;
      xml?: string;
      sparql?: string;
      graphql?: {
        query?: string;
      };
    };
  };
}

// Collection files go through these wrappers so a marker persisted by an older build still
// parses. See dirty-marker.ts.
export const parseRequest = (content: string, options?: ParseOptions): any =>
  parseRequestFile(stripDirtyMarker(content), options);

export const parseRequestViaWorker = (content: string, options?: ParseOptions): Promise<any> =>
  parseRequestFileViaWorker(stripDirtyMarker(content), options);

export const parseCollection = (content: string, options?: ParseOptions): any =>
  parseCollectionFile(stripDirtyMarker(content), options);

export const parseFolder = (content: string, options?: ParseOptions): any =>
  parseFolderFile(stripDirtyMarker(content), options);

export const parseEnvironment = (content: string, options?: ParseOptions): any =>
  parseEnvironmentFile(stripDirtyMarker(content), options);

export async function parseLargeRequestWithRedaction(bruContent: string): Promise<ParsedRequest> {
  try {
    return await parseRequestViaWorker(bruContent) as ParsedRequest;
  } catch (err) {
    console.warn('Worker parsing failed, falling back to sync:', err);
    return parseRequest(bruContent) as ParsedRequest;
  }
}
