/**
 * Collection utility functions for VS Code Extension
 * Converted from bruno-electron/src/utils/collection.js
 */

import { get, each, find, compact, isString, filter } from 'lodash';
import os from 'os';
import { getRequestUid, getExampleUid } from '../cache/requestUids';
import { uuid } from './common';
import { preferencesUtil } from '../store/preferences';

interface Header {
  uid?: string;
  name: string;
  value: string;
  enabled?: boolean;
  description?: string;
}

interface Variable {
  uid?: string;
  name: string;
  value: string;
  enabled?: boolean;
  type?: string;
}

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
  };
  tests?: string;
  auth?: { mode: string };
  collectionVariables?: Record<string, string>;
  folderVariables?: Record<string, string>;
  requestVariables?: Record<string, string>;
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

const mergeHeaders = (collection: Collection, request: Request, requestTreePath: Item[]): void => {
  const headers = new Map<string, string>();

  const collectionHeaders: Header[] = collection?.draft?.root
    ? get(collection, 'draft.root.request.headers', [])
    : get(collection, 'root.request.headers', []);

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
      const folderRoot = i?.draft || i?.root;
      const _headers: Header[] = get(folderRoot, 'request.headers', []);
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

const mergeVars = (collection: Collection, request: Request, requestTreePath: Item[] = []): void => {
  const reqVars = new Map<string, string>();
  const collectionRoot = collection?.draft?.root || collection?.root || {};
  const collectionRequestVars: Variable[] = get(collectionRoot, 'request.vars.req', []);
  const collectionVariables: Record<string, string> = {};

  collectionRequestVars.forEach((_var) => {
    if (_var.enabled) {
      reqVars.set(_var.name, _var.value);
      collectionVariables[_var.name] = _var.value;
    }
  });

  const folderVariables: Record<string, string> = {};
  const requestVariables: Record<string, string> = {};

  for (const i of requestTreePath) {
    if (i.type === 'folder') {
      const folderRoot = i?.draft || i?.root;
      const vars: Variable[] = get(folderRoot, 'request.vars.req', []);
      vars.forEach((_var) => {
        if (_var.enabled) {
          reqVars.set(_var.name, _var.value);
          folderVariables[_var.name] = _var.value;
        }
      });
    } else {
      const vars: Variable[] = i?.draft
        ? get(i, 'draft.request.vars.req', [])
        : get(i, 'request.vars.req', []);
      vars.forEach((_var) => {
        if (_var.enabled) {
          reqVars.set(_var.name, _var.value);
          requestVariables[_var.name] = _var.value;
        }
      });
    }
  }

  request.collectionVariables = collectionVariables;
  request.folderVariables = folderVariables;
  request.requestVariables = requestVariables;

  if (request?.vars) {
    request.vars.req = Array.from(reqVars, ([name, value]) => ({
      name,
      value,
      enabled: true,
      type: 'request'
    }));
  }

  const resVars = new Map<string, string>();
  const collectionResponseVars: Variable[] = get(collectionRoot, 'request.vars.res', []);

  collectionResponseVars.forEach((_var) => {
    if (_var.enabled) {
      resVars.set(_var.name, _var.value);
    }
  });

  for (const i of requestTreePath) {
    if (i.type === 'folder') {
      const folderRoot = i?.draft || i?.root;
      const vars: Variable[] = get(folderRoot, 'request.vars.res', []);
      vars.forEach((_var) => {
        if (_var.enabled) {
          resVars.set(_var.name, _var.value);
        }
      });
    } else {
      const vars: Variable[] = i?.draft
        ? get(i, 'draft.request.vars.res', [])
        : get(i, 'request.vars.res', []);
      vars.forEach((_var) => {
        if (_var.enabled) {
          resVars.set(_var.name, _var.value);
        }
      });
    }
  }

  if (request?.vars) {
    request.vars.res = Array.from(resVars, ([name, value]) => ({
      name,
      value,
      enabled: true,
      type: 'response'
    }));
  }
};

const wrapScriptInClosure = (script: string): string => {
  if (!script || script.trim() === '') {
    return '';
  }
  return `await (async () => {
${script}
})();`;
};

const mergeScripts = (
  collection: Collection,
  request: Request,
  requestTreePath: Item[],
  scriptFlow: string
): void => {
  const collectionRoot = collection?.draft?.root || collection?.root || {};
  const collectionPreReqScript = get(collectionRoot, 'request.script.req', '');
  const collectionPostResScript = get(collectionRoot, 'request.script.res', '');
  const collectionTests = get(collectionRoot, 'request.tests', '');

  const combinedPreReqScript: string[] = [];
  const combinedPostResScript: string[] = [];
  const combinedTests: string[] = [];

  for (const i of requestTreePath) {
    if (i.type === 'folder') {
      const folderRoot = i?.draft || i?.root;
      const preReqScript = get(folderRoot, 'request.script.req', '');
      if (preReqScript && preReqScript.trim() !== '') {
        combinedPreReqScript.push(preReqScript);
      }

      const postResScript = get(folderRoot, 'request.script.res', '');
      if (postResScript && postResScript.trim() !== '') {
        combinedPostResScript.push(postResScript);
      }

      const tests = get(folderRoot, 'request.tests', '');
      if (tests && tests?.trim?.() !== '') {
        combinedTests.push(tests);
      }
    }
  }

  const preReqScripts = [
    collectionPreReqScript,
    ...combinedPreReqScript,
    request?.script?.req || ''
  ];

  if (request.script) {
    request.script.req = compact(preReqScripts.map(wrapScriptInClosure)).join(os.EOL + os.EOL);

    if (scriptFlow === 'sequential') {
      const postResScripts = [
        collectionPostResScript,
        ...combinedPostResScript,
        request?.script?.res || ''
      ];
      request.script.res = compact(postResScripts.map(wrapScriptInClosure)).join(os.EOL + os.EOL);
    } else {
      const postResScripts = [
        request?.script?.res || '',
        ...[...combinedPostResScript].reverse(),
        collectionPostResScript
      ];
      request.script.res = compact(postResScripts.map(wrapScriptInClosure)).join(os.EOL + os.EOL);
    }
  }

  if (scriptFlow === 'sequential') {
    const testScripts = [
      collectionTests,
      ...combinedTests,
      request?.tests || ''
    ];
    request.tests = compact(testScripts.map(wrapScriptInClosure)).join(os.EOL + os.EOL);
  } else {
    const testScripts = [
      request?.tests || '',
      ...[...combinedTests].reverse(),
      collectionTests
    ];
    request.tests = compact(testScripts.map(wrapScriptInClosure)).join(os.EOL + os.EOL);
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

const parseBruFileMeta = (data: string): Record<string, unknown> | null => {
  try {
    const metaRegex = /meta\s*{\s*([\s\S]*?)\s*}/;
    const match = data?.match?.(metaRegex);
    if (match) {
      const metaContent = match[1].trim();
      const lines = metaContent.replace(/\r\n/g, '\n').split('\n');
      const metaJson: Record<string, unknown> = {};

      lines.forEach((line) => {
        const [key, value] = line.split(':').map((str) => str.trim());
        if (key && value) {
          metaJson[key] = isNaN(Number(value)) ? value : Number(value);
        }
      });

      let requestType = metaJson.type as string;
      if (requestType === 'http') {
        requestType = 'http-request';
      } else if (requestType === 'graphql') {
        requestType = 'graphql-request';
      } else {
        requestType = 'http-request';
      }

      const sequence = metaJson.seq as number;
      return {
        type: requestType,
        name: metaJson.name,
        seq: !isNaN(sequence) ? Number(sequence) : 1,
        settings: {},
        tags: metaJson.tags || [],
        request: {
          method: '',
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

const parseFileMeta = (data: string, format = 'bru'): Record<string, unknown> | null => {
  if (format === 'yml') {
    // TODO: Implement YAML parsing when needed
    console.warn('YAML meta parsing not yet implemented');
    return null;
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
    seq: (item as Item).seq,
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

const getEnvVars = (environment: Environment | null | undefined = {}): Record<string, string> => {
  if (!environment) {
    return { __name__: '' };
  }

  const variables = environment.variables;
  if (!variables || !variables.length) {
    return {
      __name__: environment.name || ''
    };
  }

  const envVars: Record<string, string> = {};
  each(variables, (variable) => {
    if (variable.enabled) {
      envVars[variable.name] = variable.value;
    }
  });

  return {
    ...envVars,
    __name__: environment.name || ''
  };
};

const mergeAuth = (collection: Collection, request: Request, requestTreePath: Item[]): void => {
  const collectionRoot = collection?.draft?.root || collection?.root || {};
  const collectionAuth = get(collectionRoot, 'request.auth', { mode: 'none' });
  let effectiveAuth = collectionAuth;
  let lastFolderWithAuth: Item | null = null;

  for (const i of requestTreePath) {
    if (i.type === 'folder') {
      const folderRoot = i?.draft || i?.root;
      const folderAuth = get(folderRoot, 'request.auth');
      if (folderAuth && folderAuth.mode && folderAuth.mode !== 'none' && folderAuth.mode !== 'inherit') {
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
