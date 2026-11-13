import * as vscode from 'vscode';
import yaml from 'js-yaml';
import type { ItemType } from '@bruno-types';
import { insomniaToBruno, openApiToBruno, openCollectionToBruno, postmanToBruno, wsdlToBruno } from '@usebruno/converters';
import { transformExampleStatusInCollection } from '@usebruno/common';
import { stringifyEnvironment, stringifyFolder, stringifyRequest } from '@usebruno/filestore';
import { sanitizeName, uniqueFolderName } from './filesystem';
import { writeText } from './file';
import { isObject } from '../../utils/object';
import type {
  CollectionFormat,
} from '../../utils/collection';
import { writeCollectionConfig, type CollectionRootFile } from './collection-v2';
import {
  isBrunoCollection,
  isInsomniaCollection,
  isOpenApiSpec,
  isOpenCollection,
  isPostmanCollection,
  isWSDLCollection
} from '../../utils/collection';

/** File kinds the Bruno app can import, in the order they are tested. */
export type ImportSource = 'openapi' | 'wsdl' | 'postman' | 'insomnia' | 'opencollection' | 'bruno';

export const IMPORT_SOURCE_LABELS: Record<ImportSource, string> = {
  openapi: 'OpenAPI',
  wsdl: 'WSDL',
  postman: 'Postman',
  insomnia: 'Insomnia',
  opencollection: 'OpenCollection',
  bruno: 'Bruno'
};

/** A parsed import file. WSDL stays text; every other kind is a JSON or YAML document. */
export type ImportFile =
  | { source: 'wsdl'; data: string }
  | { source: Exclude<ImportSource, 'wsdl'>; data: Record<string, unknown> };

export interface ConvertOptions {
  /** OpenAPI only: put requests in folders by tag or by URL path. */
  groupBy?: 'tags' | 'path';
  /** The format the collection will be written in; converters name files differently per format. */
  collectionFormat?: CollectionFormat;
}

/** Something a converter could not carry over faithfully, e.g. a Postman script it could not translate. */
export interface ConvertIssue {
  severity: 'error' | 'warning';
  path: string;
  message: string;
}

export interface ConvertResult {
  collection: ImportedCollection;
  issues: ConvertIssue[];
}

type RequestItemType = Extract<ItemType, `${string}-request`>;
/** Bruno JSON exports from before the "-request" suffix. */
type LegacyRequestType = 'http' | 'graphql' | 'grpc' | 'ws';

/** The subset of Bruno's in-memory collection shape that the writer needs. */
export interface ImportedCollection {
  /** Every converter sets one, falling back to "Untitled Collection". */
  name: string;
  brunoConfig?: Record<string, unknown>;
  root?: CollectionRootFile;
  environments?: ImportedEnvironment[];
  items: ImportedItem[];
}

interface ImportedEnvironment {
  name?: string;
  variables?: unknown;
}

interface ImportedItem {
  type: ItemType | LegacyRequestType;
  name: string;
  filename?: string;
  seq?: number;
  items?: ImportedItem[];
  root?: CollectionRootFile;
  fileContent?: string;
  request?: ImportedRequest;
  examples?: ImportedExample[];
}

interface ImportedExample {
  type?: ItemType | LegacyRequestType;
  request?: ImportedRequest;
}

/** A request in a legacy Bruno export, as seen by the upgrade step. */
interface ImportedRequest {
  /** Removed from WebSocket requests, which have none. */
  method?: string;
  /** Always written by Bruno, but may be a non-string in old exports; the upgrade coerces it. */
  url?: unknown;
  /** Pre-`params` exports only; copied into `params` then removed. */
  query?: Record<string, unknown>[];
  /** Built from `query`; removed again for gRPC and WebSocket requests. */
  params?: Record<string, unknown>[];
  /** Absent when the request has no body; `multipartForm` only exists for that mode, and old entries lack `type`. */
  body?: { multipartForm?: { type?: string }[] };
}

/**
 * A Bruno JSON export carries two metadata fields the collection shape does
 * not. Both are optional because the upgrade deletes them, which TypeScript
 * only allows on optional properties, and hand-edited exports may lack them.
 */
interface BrunoExport extends ImportedCollection {
  exportedAt?: string;
  exportedUsing?: string;
}

export interface WriteResult {
  /** The collection's new folder. */
  dir: vscode.Uri;
  /** Names of requests that could not be serialized and were left out. */
  skipped: string[];
}

const REQUEST_TYPES: readonly RequestItemType[] = ['http-request', 'graphql-request', 'grpc-request', 'ws-request'];
const LEGACY_REQUEST_TYPES: readonly LegacyRequestType[] = ['http', 'graphql', 'grpc', 'ws'];

function isRequestType(type: ImportedItem['type']): type is RequestItemType {
  return (REQUEST_TYPES as readonly string[]).includes(type);
}

function isLegacyRequestType(type: ImportedItem['type']): type is LegacyRequestType {
  return (LEGACY_REQUEST_TYPES as readonly string[]).includes(type);
}

function unsupported(fileName: string): Error {
  return new Error(`"${fileName}" is not a collection or API spec Bruno can import`);
}

/**
 * True for the opencollection.yml at the root of a collection kept as separate
 * files. It looks like an OpenCollection document but holds no requests, since
 * those live beside it; such a collection is opened, not imported. Exports of
 * a whole collection into one document are marked `bundled: true` and carry
 * their items inline; root files may omit `bundled` entirely.
 */
export function isUnbundledCollectionRoot(file: ImportFile): boolean {
  return file.source === 'opencollection' && file.data.bundled !== true && !Array.isArray(file.data.items);
}

/**
 * The collection's own name, read from where each kind of export keeps it.
 * A WSDL names its service only once parsed, so it gives nothing here.
 */
export function getImportedCollectionName(file: ImportFile): string | undefined {
  if (file.source === 'wsdl') {
    return undefined;
  }

  const { data } = file;
  let name: unknown;

  switch (file.source) {
    case 'bruno':
    case 'insomnia':
      // Insomnia v5 exports carry the name at the top; v4 exports keep it on the workspace resource.
      name = data.name ?? (Array.isArray(data.resources)
        ? data.resources.find((resource) => isObject(resource) && resource._type === 'workspace')?.name
        : undefined);
      break;

    case 'postman': {
      const info = isObject(data.collection) ? data.collection.info : data.info;
      name = isObject(info) ? info.name : undefined;
      break;
    }

    case 'openapi':
      name = isObject(data.info) ? data.info.title : undefined;
      break;

    case 'opencollection':
      name = isObject(data.info) ? data.info.name : undefined;
      break;
  }

  return typeof name === 'string' && name.trim() ? name.trim() : undefined;
}

/** Parse the file and recognise its kind by shape, as the Import Collection panel does. */
export function readImportFile(text: string, fileName: string): ImportFile {
  const data = parseDocument(text, fileName);

  if (typeof data === 'string') {
    if (isWSDLCollection(data)) {
      return { source: 'wsdl', data };
    }
    throw unsupported(fileName);
  }

  const source = detectDocumentSource(data);
  if (!source) {
    throw unsupported(fileName);
  }

  return { source, data };
}

function parseDocument(text: string, fileName: string): string | Record<string, unknown> {
  const normalisedName = fileName.toLowerCase();

  if (normalisedName.endsWith('.wsdl') || normalisedName.endsWith('.xml') || text.trimStart().startsWith('<')) {
    // XML, e.g. a WSDL. Detection works on the text itself.
    return text;
  }

  try {
    // JSON_SCHEMA keeps YAML values JSON-typed: no Date objects or other YAML-only types.
    const parsed: unknown = normalisedName.endsWith('.json') ? JSON.parse(text) : yaml.load(text, { schema: yaml.JSON_SCHEMA });

    if (!isObject(parsed)) {
      throw new Error('Document root must be an object');
    }

    return parsed;
  } catch {
    throw new Error(`Could not parse "${fileName}": make sure it is valid JSON or YAML`);
  }
}

function detectDocumentSource(data: Record<string, unknown>): Exclude<ImportSource, 'wsdl'> | undefined {
  if (isOpenApiSpec(data)) {
    return 'openapi';
  }

  if (isPostmanCollection(data)) {
    return 'postman';
  }

  if (isInsomniaCollection(data)) {
    return 'insomnia';
  }

  if (isOpenCollection(data)) {
    return 'opencollection';
  }

  if (isBrunoCollection(data)) {
    return 'bruno';
  }

  return undefined;
}

/** Turn the parsed file into Bruno's collection shape, ready to be written out. */
export async function convertToBruno(file: ImportFile, options: ConvertOptions = {}): Promise<ConvertResult> {
  let collection: ImportedCollection;
  let issues: ConvertIssue[] = [];

  switch (file.source) {
    case 'openapi':
      collection = validateImport(openApiToBruno(file.data, {
        groupBy: options.groupBy ?? 'tags',
        collectionFormat: options.collectionFormat
      }));
      break;

    case 'wsdl':
      collection = validateImport(await wsdlToBruno(file.data));
      break;

    case 'postman': {
      const result = await postmanToBruno(file.data);
      collection = validateImport(result.collection);
      issues = result.issues ?? [];
      break;
    }

    case 'insomnia':
      collection = validateImport(insomniaToBruno(file.data));
      break;

    case 'opencollection':
      collection = transformExampleStatusInCollection(
        validateImport(openCollectionToBruno(file.data))
      );
      break;

    case 'bruno':
      collection = transformExampleStatusInCollection(
        upgradeBrunoExport(validateImport(file.data))
      );
      break;
  }

  provideSequenceNums(collection.items);

  return { collection, issues };
}

/**
 * The converters are untyped, so this is the one place their output is
 * checked before the rest of the pipeline relies on its shape. Only name and
 * items are verified; the rest is taken on trust from the converter.
 */
function validateImport(value: unknown): ImportedCollection {
  if (!isValidImport(value)) {
    throw new Error('The converter did not produce a collection');
  }

  return value;
}

function isValidImport(value: unknown): value is ImportedCollection {
  return isObject(value) && typeof value.name === 'string' && Array.isArray(value.items);
}

/**
 * Older Bruno JSON exports used bare types ("http") and `query` instead of
 * `params`. Bring them up to the current shape so they serialize correctly.
 */
function upgradeBrunoExport(collection: BrunoExport): ImportedCollection {
  delete collection.exportedAt;
  delete collection.exportedUsing;

  const upgrade = (items: ImportedItem[]): void => {
    for (const item of items) {
      if (isLegacyRequestType(item.type)) {
        item.type = `${item.type}-request`;
        upgradeRequest(item.type, item.request);

        for (const example of item.examples ?? []) {
          if (isLegacyRequestType(example.type)) {
            example.type = `${example.type}-request`;
            upgradeRequest(example.type, example.request);
          }
        }
      }

      upgrade(item.items ?? []);
    }
  };

  upgrade(collection.items);

  return collection;
}

function upgradeRequest(type: RequestItemType, request: ImportedRequest | undefined): void {
  if (!request) {
    return;
  }

  if (request.url !== undefined && typeof request.url !== 'string') {
    request.url = String(request.url);
  }

  if (request.query) {
    request.params = request.query.map((entry) => ({ ...entry, type: 'query' }));
  }

  delete request.query;

  if (type === 'grpc-request') {
    delete request.params;
  }

  if (type === 'ws-request') {
    delete request.params;
    delete request.method;
  }

  // Multipart entries gained a type in Feb 2024; older exports carry none.
  for (const form of request.body?.multipartForm ?? []) {
    form.type ||= 'text';
  }
}

/** Give every request a sequence number, in document order, where the source had none. */
function provideSequenceNums(items: ImportedItem[]): void {
  let next = 1;
  for (const item of items) {
    if (isRequestType(item.type) && !item.seq) {
      item.seq = next++;
    }

    provideSequenceNums(item.items ?? []);
  }
}

/**
 * Goes through workspace.fs, so `location` can be on a remote.
 */
export async function writeCollection(
  collection: ImportedCollection,
  location: vscode.Uri,
  format: CollectionFormat
): Promise<WriteResult> {
  const name = await uniqueFolderName(collection.name, location);
  const dir = vscode.Uri.joinPath(location, sanitizeName(name));

  await vscode.workspace.fs.createDirectory(dir);

  await writeCollectionConfig(dir, name, format, {
    root: collection.root,
    brunoConfig: collection.brunoConfig
  });

  const environments = (collection.environments ?? []).filter((env) => env.name && env.variables);
  if (environments.length > 0) {
    const envDir = vscode.Uri.joinPath(dir, 'environments');
    await vscode.workspace.fs.createDirectory(envDir);

    for (const env of environments) {
      await writeText(
        vscode.Uri.joinPath(envDir, `${sanitizeName(env.name)}.${format}`),
        await stringifyEnvironment(env, { format })
      );
    }
  }

  const skipped: string[] = [];
  await writeItems(collection.items, dir, format, skipped);

  return { dir, skipped };
}

async function writeItems(
  items: ImportedItem[],
  dir: vscode.Uri,
  format: CollectionFormat,
  skipped: string[]
): Promise<void> {
  for (const item of items) {
    if (isRequestType(item.type)) {
      const uri = vscode.Uri.joinPath(dir, sanitizeName(requestFileName(item, format)));

      try {
        await writeText(uri, await stringifyRequest(item, { format }));
      } catch {
        skipped.push(item.name);
      }

      continue;
    }

    if (item.type === 'folder' || item.items?.length) {
      const folderDir = vscode.Uri.joinPath(dir, sanitizeName(item.filename || item.name));
      await vscode.workspace.fs.createDirectory(folderDir);

      if (item.root?.meta?.name) {
        item.root.meta.seq = item.seq;
        try {
          await writeText(vscode.Uri.joinPath(folderDir, `folder.${format}`), await stringifyFolder(item.root, { format }));
        } catch {
          // The folder still works without its metadata file.
        }
      }

      await writeItems(item.items ?? [], folderDir, format, skipped);
      continue;
    }

    if (item.type === 'js') {
      await writeText(vscode.Uri.joinPath(dir, sanitizeName(item.filename || `${item.name}.js`)), item.fileContent || '');
    }
  }
}

/**
 * A converter may name the file; otherwise the request name is used. Either
 * way the file gets the chosen format's extension, replacing a source `.bru`
 * or `.yml`, so the new collection's listing always recognises it.
 */
function requestFileName(item: ImportedItem, format: CollectionFormat): string {
  const filename = (item.filename || item.name).replace(/\.(bru|yml)$/, '');
  return `${filename}.${format}`;
}
