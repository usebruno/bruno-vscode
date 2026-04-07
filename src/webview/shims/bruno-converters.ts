/**
 * Shim for @usebruno/converters - provides browser-compatible implementations
 * Re-exports available functions from npm and stubs unavailable ones
 */

// Note: The npm package uses worker_threads which doesn't work in browser
// We'll need to use the synchronous versions or implement browser-compatible versions

// For now, stub all exports to avoid worker_threads dependency
// The actual conversion will be handled by the extension backend

export interface BrunoCollection {
  name: string;
  uid?: string;
  items?: any[];
  [key: string]: any;
}

export interface OpenCollection {
  name: string;
  items?: any[];
  extensions?: any;
  [key: string]: any;
}

/**
 * Convert OpenAPI spec to Bruno collection format
 * Note: Stubbed - actual conversion should happen on extension side
 */
export async function openApiToBruno(data: any, options: any = {}): Promise<BrunoCollection> {
  throw new Error('OpenAPI import is not yet supported in VS Code extension. Please use the desktop app for this feature.');
}

/**
 * Convert Insomnia collection to Bruno format
 * Note: Stubbed - actual conversion should happen on extension side
 */
export async function insomniaToBruno(data: any): Promise<BrunoCollection> {
  throw new Error('Insomnia import is not yet supported in VS Code extension. Please use the desktop app for this feature.');
}

/**
 * Convert Postman collection to Bruno format
 * Note: Stubbed - actual conversion should happen on extension side
 */
export async function postmanToBruno(data: any): Promise<BrunoCollection> {
  throw new Error('Postman import is not yet supported in VS Code extension. Please use the desktop app for this feature.');
}

/**
 * Convert Postman environment to Bruno format
 */
export function postmanToBrunoEnvironment(data: any): any {
  // Simple environment conversion can work in browser
  if (!data || !data.values) {
    return { name: data?.name || 'Untitled', variables: [] };
  }

  return {
    name: data.name || 'Untitled',
    variables: data.values
      .filter((v: any) => !(v.key == null && v.value == null))
      .map((v: any) => ({
        name: v.key || '',
        value: v.value ?? '',
        enabled: v.enabled !== false,
        secret: v.type === 'secret',
        type: 'text'
      }))
  };
}

/**
 * Convert Bruno collection to Postman format
 */
export function brunoToPostman(collection: BrunoCollection): any {
  // Basic implementation for export
  return {
    info: {
      name: collection.name,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: (collection.items || []).map(item => ({
      name: item.name,
      request: item.request ? {
        method: item.request.method || 'GET',
        url: item.request.url || '',
        header: item.request.headers || [],
        body: item.request.body || {}
      } : undefined
    }))
  };
}

/**
 * Convert Bruno collection to OpenCollection format
 * Note: Stubbed - actual conversion should happen on extension side
 */
export function brunoToOpenCollection(collection: BrunoCollection): OpenCollection {
  return {
    name: collection.name,
    items: collection.items || [],
    extensions: {}
  };
}

/**
 * Convert OpenCollection format to Bruno collection
 * Note: Stubbed - actual conversion should happen on extension side
 */
export async function openCollectionToBruno(data: OpenCollection): Promise<BrunoCollection> {
  throw new Error('OpenCollection import is not yet supported in VS Code extension. Please use the desktop app for this feature.');
}

/**
 * Convert WSDL to Bruno collection
 * Note: Stubbed - actual conversion should happen on extension side
 */
export async function wsdlToBruno(wsdlData: string): Promise<BrunoCollection> {
  throw new Error('WSDL import is not yet supported in VS Code extension. Please use the desktop app for this feature.');
}

/**
 * Postman translation utilities
 */
export const postmanTranslation = {
  translatePostmanScripts: async () => {
    throw new Error('Postman script translation is not yet supported in VS Code extension.');
  }
};
