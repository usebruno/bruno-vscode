import { isObject } from './object';
import { isNonEmptyString } from './string';

/** On-disk formats a collection can use: .bru request files, or OpenCollection YAML. */
export type CollectionFormat = 'bru' | 'yml';

/** The contents of bruno.json for BRU, or the config half of opencollection.yml for YAML. */
export type BrunoConfig = {
  /** BRU collections carry a config version. */
  version?: string;
  /** YAML collections carry the OpenCollection spec version instead. */
  opencollection?: string;
  name: string;
  type: 'collection';
  /** Directory names the collection never reads requests from. */
  ignore: string[];
};

export const DEFAULT_IGNORE = ['node_modules', '.git'] as const;

/** The config the Bruno app writes for a new collection of the given format. */
export function defaultBrunoConfig(name: string, format: CollectionFormat): BrunoConfig {
  const ignore = [...DEFAULT_IGNORE];
  return format === 'yml'
    ? { opencollection: '1.0.0', name, type: 'collection', ignore }
    : { version: '1', name, type: 'collection', ignore };
}

/** The collection-level settings a new collection starts with: just its name. */
export function defaultCollectionRoot(name: string): { meta: { name: string } } {
  return { meta: { name } };
}

export const POSTMAN_SCHEMAS = [
  'https://schema.getpostman.com/json/collection/v2.0.0/collection.json',
  'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  'https://schema.postman.com/json/collection/v2.0.0/collection.json',
  'https://schema.postman.com/json/collection/v2.1.0/collection.json'
];

export const WSDL_MARKERS = [
  'xmlns:wsdl=',
  'xmlns="http://schemas.xmlsoap.org/wsdl/"',
  'xmlns="http://www.w3.org/2001/XMLSchema"',
  'wsdl:definitions',
  'definitions',
  'wsdl:types',
  'wsdl:message',
  'wsdl:portType',
  'wsdl:binding',
  'wsdl:service'
];

/** OpenAPI 3.x or Swagger 2.x: an `info` object plus a version marker. */
export function isOpenApiSpec(data: unknown): boolean {
  return isObject(data) && isObject(data.info) && (isNonEmptyString(data.openapi) || isNonEmptyString(data.swagger));
}

/** WSDL arrives as XML text; any of the usual namespace or element markers will do. */
export function isWSDLCollection(data: unknown): boolean {
  return typeof data === 'string' && WSDL_MARKERS.some((marker) => data.includes(marker));
}

/** Postman v2.0 or v2.1, bare or wrapped in the `{ collection: ... }` envelope newer exports use. */
export function isPostmanCollection(data: unknown): boolean {
  if (!isObject(data)) {
    return false;
  }

  const info = isObject(data.collection) ? data.collection.info : data.info;

  return isObject(info) && typeof info.schema === 'string' && POSTMAN_SCHEMAS.includes(info.schema);
}

/** Insomnia v5 (`type` plus a `collection` array) or the v4 export format. */
export function isInsomniaCollection(data: unknown): boolean {
  if (!isObject(data)) {
    return false;
  }

  if (typeof data.type === 'string' && data.type.startsWith('collection.insomnia.rest/5')) {
    return Array.isArray(data.collection);
  }

  if (data._type === 'export') {
    return Array.isArray(data.resources) && typeof data.__export_format === 'number';
  }

  return false;
}

export function isOpenCollection(data: unknown): boolean {
  return isObject(data) && isNonEmptyString(data.opencollection) && isObject(data.info);
}

/** A Bruno JSON export: version, name and an items array. */
export function isBrunoCollection(data: unknown): boolean {
  return isObject(data) && isNonEmptyString(data.version) && isNonEmptyString(data.name) && Array.isArray(data.items);
}
