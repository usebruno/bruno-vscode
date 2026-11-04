/**
 * Collection utility functions for VS Code Extension
 * Converted from bruno-electron/src/utils/collection.js
 */

import path from 'path';
import { get, each, find, compact, isString, filter } from 'lodash';
import { parseValueByDataType, BrunoVariableDataType } from '@usebruno/common/utils';
import type { ScriptMetadata, ScriptSegment } from '@bruno-types';
import { posixifyPath, getCollectionFormat } from './filesystem';
import { getRequestUid, getExampleUid } from '../cache/requestUids';
import { uuid } from './common';
import { preferencesUtil } from '../store/preferences';
import { getUnsavedRoot } from '../store/unsaved-roots';

const FORMAT_CONFIG = {
  yml: { collectionFile: 'opencollection.yml', folderFile: 'folder.yml' },
  bru: { collectionFile: 'collection.bru', folderFile: 'folder.bru' }
} as const;

type SegmentSource = Omit<ScriptSegment, 'startLine' | 'endLine'>;

interface ScopeInfo {
  type: 'collection' | 'folder' | 'request';
  sourceFile: string;
}

/** Memoised because detection hits the filesystem and `mergeScripts` runs on every request. */
const collectionFormatCache = new Map<string, keyof typeof FORMAT_CONFIG>();

const getFormat = (collection: Collection): keyof typeof FORMAT_CONFIG => {
  const pathname = collection?.pathname;
  if (!pathname) return 'bru';

  const cached = collectionFormatCache.get(pathname);
  if (cached) return cached;

  try {
    const format = getCollectionFormat(pathname);
    collectionFormatCache.set(pathname, format);
    return format;
  } catch {
    // A collection still being created has neither config file yet, so this is not cached.
    return 'bru';
  }
};

interface Header {
  uid?: string;
  name: string;
  value: string;
  enabled?: boolean;
  description?: string;
}

type VariableValue = string | number | boolean | Record<string, unknown> | null;

interface Variable {
  uid?: string;
  name: string;
  value: VariableValue;
  enabled?: boolean;
  type?: string;
  dataType?: BrunoVariableDataType;
}

/** Coercing here rather than trusting the parsed value picks up an unsaved data type change. */
const resolveTypedValue = (v: Variable): VariableValue => parseValueByDataType(v.value, v.dataType);

interface CollectionRoot {
  request?: {
    headers?: Header[];
    vars?: {
      req?: Variable[];
      res?: Variable[];
    };
    script?: {
      req?: string;
      res?: string;
    };
    tests?: string;
    auth?: { mode: string };
  };
}

interface Collection {
  uid?: string;
  pathname?: string;
  draft?: {
    root?: CollectionRoot;
  };
  root?: CollectionRoot;
  items?: Item[];
}

interface Item {
  uid: string;
  type: string;
  name?: string;
  pathname?: string;
  seq?: number;
  draft?: ItemDraft;
  root?: CollectionRoot;
  items?: Item[];
  request?: ItemRequest;
  examples?: Example[];
  settings?: Record<string, unknown>;
  tags?: string[];
}

interface ItemDraft {
  uid?: string;
  type?: string;
  name?: string;
  request?: ItemRequest;
  root?: CollectionRoot;
}

interface ItemRequest {
  method?: string;
  url?: string;
  headers?: Header[];
  params?: Param[];
  body?: Body;
  vars?: {
    req?: Variable[];
    res?: Variable[];
  };
  script?: {
    req?: string;
    res?: string;
  };
  tests?: string;
  auth?: { mode: string };
  assertions?: Assertion[];
  docs?: string;
  methodType?: string;
  protoPath?: string;
}

interface Param {
  uid?: string;
  name: string;
  value: string;
  description?: string;
  type?: string;
  enabled?: boolean;
}

interface Body {
  mode: string;
  json?: string;
  grpc?: Array<{ name?: string; content: string }>;
  formUrlEncoded?: Param[];
  multipartForm?: Param[];
  file?: Param[];
}

interface Assertion {
  uid?: string;
  name: string;
  value: string;
  enabled?: boolean;
}

interface Example {
  uid?: string;
  itemUid?: string;
  request?: {
    params?: Param[];
    headers?: Header[];
    body?: Body;
  };
  response?: {
    headers?: Header[];
  };
}

interface Environment {
  name?: string;
  variables?: Variable[];
}

interface Request {
  uid?: string;
  pathname?: string;
  type?: string;
  name?: string;
  seq?: number;
  headers?: Header[];
  vars?: {
    req?: Variable[];
    res?: Variable[];
  };
  script?: {
    req?: string;
    res?: string;
    reqMetadata?: ScriptMetadata | null;
    resMetadata?: ScriptMetadata | null;
  };
  tests?: string;
  testsMetadata?: ScriptMetadata | null;
  auth?: { mode: string };
  collectionVariables?: Record<string, VariableValue>;
  folderVariables?: Record<string, VariableValue>;
  requestVariables?: Record<string, VariableValue>;
  oauth2Credentials?: {
    folderUid?: string | null;
    itemUid?: string | null;
    mode?: string;
  };
  settings?: Record<string, unknown>;
  request?: ItemRequest;
  examples?: Example[];
  tags?: string[];
}

const effectiveCollectionRoot = (collection: Collection): CollectionRoot =>
  collection?.draft?.root
    || (getUnsavedRoot('collection', collection?.pathname) as CollectionRoot | undefined)
    || collection?.root
    || {};

const effectiveFolderRoot = (folder: Item): CollectionRoot | undefined =>
  folder?.draft?.root
    || (getUnsavedRoot('folder', folder?.pathname) as CollectionRoot | undefined)
    || folder?.root;

const mergeHeaders = (collection: Collection, request: Request, requestTreePath: Item[]): void => {
  const headers = new Map<string, string>();

  const collectionHeaders: Header[] = get(effectiveCollectionRoot(collection), 'request.headers', []);

  collectionHeaders.forEach((header) => {
    if (header.enabled) {
      if (header?.name?.toLowerCase?.() === 'content-type') {
        headers.set('content-type', header.value);
      } else {
        headers.set(header.name, header.value);
      }
    }
  });

  for (const i of requestTreePath) {
    if (i.type === 'folder') {
      const _headers: Header[] = get(effectiveFolderRoot(i), 'request.headers', []);
      _headers.forEach((header) => {
        if (header.enabled) {
          if (header.name.toLowerCase() === 'content-type') {
            headers.set('content-type', header.value);
          } else {
            headers.set(header.name, header.value);
          }
        }
      });
    } else {
      const _headers: Header[] = i?.draft
        ? get(i, 'draft.request.headers', [])
        : get(i, 'request.headers', []);
      _headers.forEach((header) => {
        if (header.enabled) {
          if (header.name.toLowerCase() === 'content-type') {
            headers.set('content-type', header.value);
          } else {
            headers.set(header.name, header.value);
          }
        }
      });
    }
  }

  request.headers = Array.from(headers, ([name, value]) => ({ name, value, enabled: true }));
};

/** Post-response vars hold an expression, not a literal; coercing one breaks its evaluation. */
const rawValue = (_var: Variable): VariableValue => _var.value;

const getItemVars = (item: Item, phase: 'req' | 'res'): Variable[] =>
  item.type === 'folder'
    ? get(effectiveFolderRoot(item), `request.vars.${phase}`, [])
    : get(item, item?.draft ? `draft.request.vars.${phase}` : `request.vars.${phase}`, []);

const collectVars = (
  vars: Variable[],
  resolve: (_var: Variable) => VariableValue,
  merged: Map<string, VariableValue>,
  scope?: Record<string, VariableValue>
): void => {
  vars.forEach((_var) => {
    if (!_var.enabled) return;

    const value = resolve(_var);
    merged.set(_var.name, value);
    if (scope) {
      scope[_var.name] = value;
    }
  });
};

const mergeVars = (collection: Collection, request: Request, requestTreePath: Item[] = []): void => {
  const collectionRoot = effectiveCollectionRoot(collection);
  const collectionVariables: Record<string, VariableValue> = {};
  const folderVariables: Record<string, VariableValue> = {};
  const requestVariables: Record<string, VariableValue> = {};

  const reqVars = new Map<string, VariableValue>();
  collectVars(get(collectionRoot, 'request.vars.req', []), resolveTypedValue, reqVars, collectionVariables);

  for (const i of requestTreePath) {
    const scope = i.type === 'folder' ? folderVariables : requestVariables;
    collectVars(getItemVars(i, 'req'), resolveTypedValue, reqVars, scope);
  }

  request.collectionVariables = collectionVariables;
  request.folderVariables = folderVariables;
  request.requestVariables = requestVariables;

  const resVars = new Map<string, VariableValue>();
  collectVars(get(collectionRoot, 'request.vars.res', []), rawValue, resVars);

  for (const i of requestTreePath) {
    collectVars(getItemVars(i, 'res'), rawValue, resVars);
  }

  if (request?.vars) {
    request.vars.req = Array.from(reqVars, ([name, value]) => ({
      name,
      value,
      enabled: true,
      type: 'request'
    }));

    request.vars.res = Array.from(resVars, ([name, value]) => ({
      name,
      value,
      enabled: true,
      type: 'response'
    }));
  }
};

const wrapScriptInClosure = (script: string, scopeInfo: ScopeInfo | null = null): string => {
  if (!script || script.trim() === '') {
    return '';
  }

  // Names the segment's scope inside the sandbox so `bru` calls know which file they came from.
  const scopeSetter = scopeInfo ? ` __bruSetScope(${JSON.stringify(scopeInfo)});` : '';
  return `await (async () => {${scopeSetter}
${script}
})();`;
};

/** The recorded line ranges are what trace a stack-trace line back to its source file. Joined with
 *  `\n`; a platform EOL would throw the counts off on Windows. */
const buildCombinedScript = (
  scripts: string[],
  requestIndex: number,
  segmentSources: (SegmentSource | null)[],
  requestSegmentSource: { displayPath: string } | null,
  requestScriptContent: string
): { code: string; metadata: ScriptMetadata | null } => {
  const buildScopeInfo = (i: number): ScopeInfo | null => {
    if (i === requestIndex && requestSegmentSource?.displayPath) {
      return { type: 'request', sourceFile: requestSegmentSource.displayPath };
    }

    const segment = segmentSources[i];
    if (!segment?.type || !segment?.displayPath) return null;

    return { type: segment.type, sourceFile: segment.displayPath };
  };

  const wrapped = scripts.map((script, i) => wrapScriptInClosure(script, buildScopeInfo(i)));
  const code = compact(wrapped).join('\n\n');

  let offset = 0;
  let metadata: ScriptMetadata | null = null;
  const segments: ScriptSegment[] = [];

  for (let i = 0; i < scripts.length; i++) {
    if (!wrapped[i]) continue;

    const lineCount = wrapped[i].split('\n').length;
    const startLine = offset + 1;
    const endLine = offset + lineCount;

    if (i === requestIndex) {
      metadata = { requestStartLine: startLine, requestEndLine: endLine };
    }

    const source = segmentSources[i];
    if (source) {
      segments.push({ startLine, endLine, ...source });
    }

    offset += lineCount + 1;
  }

  // An empty range keeps inherited errors from being mapped onto a request that has no script.
  if (!metadata && code) {
    metadata = { requestStartLine: 0, requestEndLine: 0 };
  }

  if (metadata) {
    metadata.requestScriptContent = requestScriptContent;
    if (segments.length) {
      metadata.segments = segments;
    }
  }

  return { code, metadata };
};

const mergeScripts = (
  collection: Collection,
  request: Request,
  requestTreePath: Item[],
  scriptFlow: string
): void => {
  const collectionRoot = effectiveCollectionRoot(collection);
  const collectionPreReqScript = get(collectionRoot, 'request.script.req', '');
  const collectionPostResScript = get(collectionRoot, 'request.script.res', '');
  const collectionTests = get(collectionRoot, 'request.tests', '');

  const config = FORMAT_CONFIG[getFormat(collection)];
  const collectionPathname = collection?.pathname || '';

  const collectionSource: SegmentSource = {
    type: 'collection',
    filePath: path.join(collectionPathname, config.collectionFile),
    displayPath: config.collectionFile
  };

  const requestItem = requestTreePath?.[requestTreePath.length - 1];
  const requestPathname = request?.pathname || requestItem?.pathname;
  const requestSegmentSource = requestPathname && collectionPathname
    ? { displayPath: posixifyPath(path.relative(collectionPathname, requestPathname)) }
    : null;

  const withContent = (source: SegmentSource, script: string): SegmentSource =>
    script?.trim() ? { ...source, scriptContent: script } : source;

  const combinedPreReqScript: string[] = [];
  const combinedPreReqSources: SegmentSource[] = [];
  const combinedPostResScript: string[] = [];
  const combinedPostResSources: SegmentSource[] = [];
  const combinedTests: string[] = [];
  const combinedTestsSources: SegmentSource[] = [];

  for (const i of requestTreePath) {
    if (i.type === 'folder') {
      const folderRoot = effectiveFolderRoot(i);
      const folderFilePath = path.join(i.pathname || '', config.folderFile);
      const folderSource: SegmentSource = {
        type: 'folder',
        filePath: folderFilePath,
        displayPath: posixifyPath(path.relative(collectionPathname, folderFilePath))
      };

      const preReqScript = get(folderRoot, 'request.script.req', '');
      if (preReqScript && preReqScript.trim() !== '') {
        combinedPreReqScript.push(preReqScript);
        combinedPreReqSources.push(withContent(folderSource, preReqScript));
      }

      const postResScript = get(folderRoot, 'request.script.res', '');
      if (postResScript && postResScript.trim() !== '') {
        combinedPostResScript.push(postResScript);
        combinedPostResSources.push(withContent(folderSource, postResScript));
      }

      const tests = get(folderRoot, 'request.tests', '');
      if (tests && tests?.trim?.() !== '') {
        combinedTests.push(tests);
        combinedTestsSources.push(withContent(folderSource, tests));
      }
    }
  }

  const originalPreReqScript = request?.script?.req || '';
  const originalPostResScript = request?.script?.res || '';
  const originalTests = request?.tests || '';

  const build = (
    scripts: string[],
    requestIndex: number,
    sources: (SegmentSource | null)[],
    originalScript: string
  ) => buildCombinedScript(scripts, requestIndex, sources, requestSegmentSource, originalScript);

  if (request.script) {
    const preReqScripts = [
      collectionPreReqScript,
      ...combinedPreReqScript,
      originalPreReqScript
    ];
    const preReqSources = [withContent(collectionSource, collectionPreReqScript), ...combinedPreReqSources, null];
    const preReq = build(preReqScripts, preReqScripts.length - 1, preReqSources, originalPreReqScript);
    request.script.req = preReq.code;
    request.script.reqMetadata = preReq.metadata;

    const collectionPostResSource = withContent(collectionSource, collectionPostResScript);
    if (scriptFlow === 'sequential') {
      const postResScripts = [
        collectionPostResScript,
        ...combinedPostResScript,
        originalPostResScript
      ];
      const postResSources = [collectionPostResSource, ...combinedPostResSources, null];
      const postRes = build(postResScripts, postResScripts.length - 1, postResSources, originalPostResScript);
      request.script.res = postRes.code;
      request.script.resMetadata = postRes.metadata;
    } else {
      const postResScripts = [
        originalPostResScript,
        ...[...combinedPostResScript].reverse(),
        collectionPostResScript
      ];
      const postResSources = [null, ...[...combinedPostResSources].reverse(), collectionPostResSource];
      const postRes = build(postResScripts, 0, postResSources, originalPostResScript);
      request.script.res = postRes.code;
      request.script.resMetadata = postRes.metadata;
    }
  }

  const collectionTestsSource = withContent(collectionSource, collectionTests);
  if (scriptFlow === 'sequential') {
    const testScripts = [
      collectionTests,
      ...combinedTests,
      originalTests
    ];
    const testSources = [collectionTestsSource, ...combinedTestsSources, null];
    const tests = build(testScripts, testScripts.length - 1, testSources, originalTests);
    request.tests = tests.code;
    request.testsMetadata = tests.metadata;
  } else {
    const testScripts = [
      originalTests,
      ...[...combinedTests].reverse(),
      collectionTests
    ];
    const testSources = [null, ...[...combinedTestsSources].reverse(), collectionTestsSource];
    const tests = build(testScripts, 0, testSources, originalTests);
    request.tests = tests.code;
    request.testsMetadata = tests.metadata;
  }
};

const flattenItems = (items: Item[] = []): Item[] => {
  const flattenedItems: Item[] = [];

  const flatten = (itms: Item[], flattened: Item[]): void => {
    each(itms, (i) => {
      flattened.push(i);
      if (i.items && i.items.length) {
        flatten(i.items, flattened);
      }
    });
  };

  flatten(items, flattenedItems);
  return flattenedItems;
};

const findItem = (items: Item[] = [], itemUid: string): Item | undefined => {
  return find(items, (i) => i.uid === itemUid);
};

const findItemInCollection = (collection: Collection, itemUid: string): Item | undefined => {
  const flattenedItems = flattenItems(collection.items);
  return findItem(flattenedItems, itemUid);
};

const findParentItemInCollection = (collection: Collection, itemUid: string): Item | undefined => {
  const flattenedItems = flattenItems(collection.items);
  return find(flattenedItems, (item: Item) => {
    return item.items && find(item.items, (i: Item) => i.uid === itemUid);
  }) as Item | undefined;
};

const findParentItemInCollectionByPathname = (collection: Collection, pathname: string): Item | undefined => {
  const flattenedItems = flattenItems(collection.items);
  return find(flattenedItems, (item: Item) => {
    return item.items && find(item.items, (i: Item) => i.pathname === pathname);
  }) as Item | undefined;
};

const getTreePathFromCollectionToItem = (collection: Collection, _item: Item): Item[] => {
  const path: Item[] = [];
  let item = findItemInCollection(collection, _item.uid);
  while (item) {
    path.unshift(item);
    item = findParentItemInCollection(collection, item.uid);
  }
  return path;
};

const HTTP_METHOD_BLOCK_REGEX = /^\s*(get|post|put|delete|patch|options|head|trace|connect)\s*\{/mi;

const parseBruFileMeta = (data: string): Record<string, unknown> | null => {
  try {
    const metaRegex = /meta\s*{\s*([\s\S]*?)\s*}/;
    const match = data?.match?.(metaRegex);
    if (match) {
      const metaContent = match[1].trim();
      const lines = metaContent.replace(/\r\n/g, '\n').split('\n');
      const metaJson: Record<string, unknown> = {};

      let insideArray = false;
      lines.forEach((line) => {
        const trimmed = line.trim();
        if (insideArray) {
          if (trimmed === ']') {
            insideArray = false;
          }
          return;
        }
        const [key, value] = trimmed.split(':').map((str) => str.trim());
        if (key && value) {
          if (value === '[' || value.startsWith('[')) {
            insideArray = !value.includes(']');
            return;
          }
          metaJson[key] = isNaN(Number(value)) ? value : Number(value);
        }
      });

      let requestType = metaJson.type as string;
      const isApp = requestType === 'app';
      if (requestType === 'http') {
        requestType = 'http-request';
      } else if (requestType === 'graphql') {
        requestType = 'graphql-request';
      } else if (requestType === 'grpc') {
        requestType = 'grpc-request';
      } else if (requestType === 'ws' || requestType === 'websocket') {
        requestType = 'ws-request';
      } else if (isApp) {
        requestType = 'app';
      } else {
        requestType = 'http-request';
      }

      const sequence = metaJson.seq as number;
      if (isApp) {
        return {
          type: 'app',
          name: metaJson.name,
          seq: !isNaN(sequence) ? Number(sequence) : 1,
          settings: {},
          tags: Array.isArray(metaJson.tags) ? metaJson.tags : [],
          request: null,
          app: { code: '' }
        };
      }

      // Extract HTTP method via regex so the sidebar can render the method
      // badge without paying for a full parse of every request file.
      let method = '';
      const methodMatch = data.match(HTTP_METHOD_BLOCK_REGEX);
      if (methodMatch) {
        method = methodMatch[1].toLowerCase();
      }

      return {
        type: requestType,
        name: metaJson.name,
        seq: !isNaN(sequence) ? Number(sequence) : 1,
        settings: {},
        tags: Array.isArray(metaJson.tags) ? metaJson.tags : [],
        request: {
          method,
          url: '',
          params: [],
          headers: [],
          auth: { mode: 'none' },
          body: { mode: 'none' },
          script: {},
          vars: {},
          assertions: [],
          tests: '',
          docs: ''
        }
      };
    }
    return null;
  } catch (err) {
    console.error('Error parsing file meta:', err);
    return null;
  }
};

const YML_METHOD_BLOCKS = ['http', 'graphql', 'grpc', 'ws', 'websocket', 'sse'];

const parseYmlFileMeta = (data: string): Record<string, unknown> | null => {
  try {
    // Extract the `info:` block (name / type / seq). YAML keeps top-level
    // keys left-flush, so capture every indented line that follows until
    // we hit another top-level key or EOF.
    const infoMatch = data.match(/^info:\s*\n((?:[ \t]+[^\n]*\n?)+)/m);
    if (!infoMatch) return null;

    const infoJson: Record<string, string> = {};
    infoMatch[1].split('\n').forEach((line) => {
      const kv = line.match(/^\s+([a-zA-Z0-9_]+)\s*:\s*(.*?)\s*$/);
      if (kv) {
        infoJson[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
      }
    });

    let requestType = infoJson.type;
    const isApp = requestType === 'app';
    if (requestType === 'http') requestType = 'http-request';
    else if (requestType === 'graphql') requestType = 'graphql-request';
    else if (requestType === 'grpc') requestType = 'grpc-request';
    else if (requestType === 'ws' || requestType === 'websocket') requestType = 'ws-request';
    else if (isApp) requestType = 'app';
    else requestType = 'http-request';

    const seq = Number(infoJson.seq);
    if (isApp) {
      return {
        type: 'app',
        name: infoJson.name,
        seq: !isNaN(seq) ? seq : 1,
        settings: {},
        tags: [],
        request: null,
        app: { code: '' }
      };
    }

    // Find the first top-level method block (http:, graphql:, ...) and
    // pull its `method:` field if present.
    let method = '';
    for (const block of YML_METHOD_BLOCKS) {
      const blockMatch = data.match(new RegExp(`^${block}:\\s*\\n((?:[ \\t]+[^\\n]*\\n?)+)`, 'm'));
      if (blockMatch) {
        const methodLine = blockMatch[1].match(/^\s+method\s*:\s*(\S+)/m);
        if (methodLine) {
          method = methodLine[1].replace(/^["']|["']$/g, '').toLowerCase();
        }
        break;
      }
    }

    return {
      type: requestType,
      name: infoJson.name,
      seq: !isNaN(seq) ? seq : 1,
      settings: {},
      tags: [],
      request: {
        method,
        url: '',
        params: [],
        headers: [],
        auth: { mode: 'none' },
        body: { mode: 'none' },
        script: {},
        vars: {},
        assertions: [],
        tests: '',
        docs: ''
      }
    };
  } catch (err) {
    console.error('Error parsing YML file meta:', err);
    return null;
  }
};

const parseFileMeta = (data: string, format = 'bru'): Record<string, unknown> | null => {
  if (format === 'yml') {
    return parseYmlFileMeta(data);
  }
  return parseBruFileMeta(data);
};

const hydrateRequestWithUuid = (request: Request, pathname: string): Request => {
  request.uid = getRequestUid(pathname);

  const params: Param[] = get(request, 'request.params', []);
  const headers: Header[] = get(request, 'request.headers', []);
  const requestVars: Variable[] = get(request, 'request.vars.req', []);
  const responseVars: Variable[] = get(request, 'request.vars.res', []);
  const assertions: Assertion[] = get(request, 'request.assertions', []);
  const bodyFormUrlEncoded: Param[] = get(request, 'request.body.formUrlEncoded', []);
  const bodyMultipartForm: Param[] = get(request, 'request.body.multipartForm', []);
  const file: Param[] = get(request, 'request.body.file', []);
  const examples: Example[] = get(request, 'examples', []);

  params.forEach((param) => (param.uid = uuid()));
  headers.forEach((header) => (header.uid = uuid()));
  requestVars.forEach((variable) => (variable.uid = uuid()));
  responseVars.forEach((variable) => (variable.uid = uuid()));
  assertions.forEach((assertion) => (assertion.uid = uuid()));
  bodyFormUrlEncoded.forEach((param) => (param.uid = uuid()));
  bodyMultipartForm.forEach((param) => (param.uid = uuid()));
  file.forEach((param) => (param.uid = uuid()));

  examples.forEach((example, eIndex) => {
    example.uid = getExampleUid(pathname, eIndex);
    example.itemUid = request.uid;
    const exParams: Param[] = get(example, 'request.params', []);
    const exHeaders: Header[] = get(example, 'request.headers', []);
    const responseHeaders: Header[] = get(example, 'response.headers', []);
    const exBodyMultipartForm: Param[] = get(example, 'request.body.multipartForm', []);
    const exBodyFormUrlEncoded: Param[] = get(example, 'request.body.formUrlEncoded', []);
    const exFile: Param[] = get(example, 'request.body.file', []);

    exParams.forEach((param) => (param.uid = uuid()));
    exHeaders.forEach((header) => (header.uid = uuid()));
    responseHeaders.forEach((header) => (header.uid = uuid()));
    exBodyMultipartForm.forEach((param) => (param.uid = uuid()));
    exBodyFormUrlEncoded.forEach((param) => (param.uid = uuid()));
    exFile.forEach((param) => (param.uid = uuid()));
  });

  return request;
};

const findItemByPathname = (items: Item[] = [], pathname: string): Item | undefined => {
  return find(items, (i) => i.pathname === pathname);
};

const findItemInCollectionByPathname = (collection: Collection, pathname: string): Item | undefined => {
  const flattenedItems = flattenItems(collection.items);
  return findItemByPathname(flattenedItems, pathname);
};

const replaceTabsWithSpaces = (str: string, numSpaces = 2): string => {
  if (!str || !str.length || !isString(str)) {
    return '';
  }
  return str.replace(/\t/g, ' '.repeat(numSpaces));
};

const transformRequestToSaveToFilesystem = (item: Item): Record<string, unknown> => {
  const _item = item.draft ? item.draft : item;
  const request = _item.request || {} as ItemRequest;

  const itemToSave: Record<string, unknown> = {
    uid: _item.uid,
    type: _item.type,
    name: _item.name,
    seq: (item as Item).seq ?? 1,
    settings: (item as Item).settings,
    tags: Array.isArray(item.tags) && item.tags.filter(Boolean).length > 0 ? item.tags.filter(Boolean) : undefined,
    examples: (item as Item).examples || [],
    request: {
      method: request.method,
      url: request.url,
      params: [] as Param[],
      headers: [] as Header[],
      auth: request.auth,
      body: request.body,
      script: request.script,
      vars: request.vars,
      assertions: request.assertions,
      tests: request.tests,
      docs: request.docs
    }
  };

  const requestData = itemToSave.request as Record<string, unknown>;

  if (_item.type === 'grpc-request') {
    requestData.methodType = request.methodType;
    requestData.protoPath = request.protoPath;
    delete requestData.params;
  }

  if (_item.type !== 'grpc-request') {
    each(request.params, (param) => {
      (requestData.params as Param[]).push({
        uid: param.uid,
        name: param.name,
        value: param.value,
        description: param.description,
        type: param.type,
        enabled: param.enabled
      });
    });
  }

  each(request.headers, (header) => {
    (requestData.headers as Header[]).push({
      uid: header.uid,
      name: header.name,
      value: header.value,
      description: header.description,
      enabled: header.enabled
    });
  });

  const body = requestData.body as Body;
  if (body?.mode === 'json' && body.json) {
    requestData.body = {
      ...body,
      json: replaceTabsWithSpaces(body.json)
    };
  }

  if (body?.mode === 'grpc' && body.grpc) {
    requestData.body = {
      ...body,
      grpc: body.grpc.map(({ name, content }, index) => ({
        name: name ? name : `message ${index + 1}`,
        content: replaceTabsWithSpaces(content)
      }))
    };
  }

  return itemToSave;
};

const getEnvVars = (environment: Environment | null | undefined = {}): Record<string, VariableValue> => {
  if (!environment) {
    return { __name__: '' };
  }

  const variables = environment.variables;
  if (!variables || !variables.length) {
    return {
      __name__: environment.name || ''
    };
  }

  const envVars: Record<string, VariableValue> = {};
  each(variables, (variable) => {
    if (variable.enabled) {
      envVars[variable.name] = resolveTypedValue(variable);
    }
  });

  return {
    ...envVars,
    __name__: environment.name || ''
  };
};

const mergeAuth = (collection: Collection, request: Request, requestTreePath: Item[]): void => {
  const collectionRoot = effectiveCollectionRoot(collection);
  const collectionAuth = get(collectionRoot, 'request.auth', { mode: 'none' });
  let effectiveAuth = collectionAuth;
  let lastFolderWithAuth: Item | null = null;

  for (const i of requestTreePath) {
    if (i.type === 'folder') {
      const folderRoot = effectiveFolderRoot(i);
      const folderAuth = get(folderRoot, 'request.auth');
      if (folderAuth && folderAuth.mode && folderAuth.mode !== 'inherit') {
        effectiveAuth = folderAuth;
        lastFolderWithAuth = i;
      }
    }
  }

  if (request.auth?.mode === 'inherit') {
    request.auth = effectiveAuth;

    if (effectiveAuth.mode === 'oauth2') {
      if (lastFolderWithAuth) {
        request.oauth2Credentials = {
          ...request.oauth2Credentials,
          folderUid: lastFolderWithAuth.uid,
          itemUid: null,
          mode: request.auth.mode
        };
      } else {
        request.oauth2Credentials = {
          ...request.oauth2Credentials,
          folderUid: null,
          itemUid: null,
          mode: request.auth.mode
        };
      }
    }
  }
};

const resolveInheritedSettings = (settings: Record<string, unknown>): Record<string, unknown> => {
  const resolvedSettings: Record<string, unknown> = {};

  Object.keys(settings).forEach((settingKey) => {
    const currentValue = settings[settingKey];

    if (currentValue === 'inherit' || currentValue === undefined || currentValue === null) {
      if (settingKey === 'timeout') {
        resolvedSettings[settingKey] = preferencesUtil.getRequestTimeout();
      }
    } else {
      resolvedSettings[settingKey] = currentValue;
    }
  });

  if (!Object.prototype.hasOwnProperty.call(settings, 'timeout')) {
    resolvedSettings.timeout = preferencesUtil.getRequestTimeout();
  }

  return resolvedSettings;
};

export {
  mergeHeaders,
  mergeVars,
  mergeScripts,
  mergeAuth,
  getTreePathFromCollectionToItem,
  flattenItems,
  findItem,
  findItemInCollection,
  findItemByPathname,
  findItemInCollectionByPathname,
  findParentItemInCollection,
  findParentItemInCollectionByPathname,
  parseBruFileMeta,
  parseFileMeta,
  hydrateRequestWithUuid,
  transformRequestToSaveToFilesystem,
  getEnvVars,
  resolveInheritedSettings,
  Collection,
  Item,
  Request,
  Environment,
  Header,
  Variable
};
