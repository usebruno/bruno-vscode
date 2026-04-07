const { parseRequestViaWorker, parseRequest } = require('@usebruno/filestore');

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

export async function parseLargeRequestWithRedaction(bruContent: string): Promise<ParsedRequest> {
  try {
    // Try worker-based parsing first (async)
    const parsedData = await parseRequestViaWorker(bruContent) as ParsedRequest;
    return parsedData;
  } catch (err) {
    // Fall back to sync parsing
    console.warn('Worker parsing failed, falling back to sync:', err);
    const parsedData = parseRequest(bruContent) as ParsedRequest;
    return parsedData;
  }
}
