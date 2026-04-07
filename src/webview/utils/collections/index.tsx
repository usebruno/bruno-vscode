import { cloneDeep, isEqual, sortBy, filter, map, isString, findIndex, find, each, get } from 'lodash';
import { uuid } from 'utils/common';
import { buildPersistedEnvVariables } from 'utils/environments';
import { sortByNameThenSequence } from 'utils/common/index';
import path from 'utils/common/path';
// @ts-expect-error - isRequestTagsIncluded may not be exported in type definitions
import { isRequestTagsIncluded } from '@usebruno/common';
import type { AppCollection, AppItem, Environment, UID } from '@bruno-types';

const replaceTabsWithSpaces = (str: string | null | undefined, numSpaces = 2): string => {
  if (!str || !str.length || !isString(str)) {
    return '';
  }

  return str.replaceAll('\t', ' '.repeat(numSpaces));
};

export const addDepth = (items: AppItem[] = []): void => {
  const depth = (itms: AppItem[], initialDepth: number): void => {
    each(itms, (i) => {
      if (!i) return; // Skip undefined/null items
      i.depth = initialDepth;

      if (i.items && i.items.length) {
        depth(i.items, initialDepth + 1);
      }
    });
  };

  depth(items, 1);
};

export const collapseAllItemsInCollection = (collection: AppCollection): void => {
  collection.collapsed = true;

  const collapseItem = (items: AppItem[]): void => {
    each(items, (i) => {
      if (!i) return; // Skip undefined/null items
      i.collapsed = true;

      if (i.items && i.items.length) {
        collapseItem(i.items);
      }
    });
  };

  collapseItem(collection.items);
};

export const sortItems = (collection: AppCollection): void => {
  const sort = (obj: AppCollection | AppItem): void => {
    if (obj.items && obj.items.length) {
      obj.items = sortBy(obj.items, 'type').filter(Boolean); // Filter out undefined items
    }

    each(obj.items, (i) => {
      if (i) sort(i);
    });
  };

  sort(collection);
};

export const flattenItems = (items: AppItem[] = []): AppItem[] => {
  const flattenedItems: AppItem[] = [];

  const flatten = (itms: AppItem[], flattened: AppItem[]): void => {
    each(itms, (i) => {
      if (!i) return; // Skip undefined/null items
      flattened.push(i);

      if (i.items && i.items.length) {
        flatten(i.items, flattened);
      }
    });
  };

  flatten(items, flattenedItems);

  return flattenedItems;
};

export const findItem = (items: AppItem[] = [], itemUid: UID): AppItem | undefined => {
  return items.find((i) => i.uid === itemUid);
};

export const findCollectionByUid = (collections: AppCollection[], collectionUid: UID): AppCollection | undefined => {
  return collections.find((c) => c.uid === collectionUid);
};

export const findCollectionByPathname = (collections: AppCollection[], pathname: string): AppCollection | undefined => {
  return collections.find((c) => c.pathname === pathname);
};

export const findCollectionByItemUid = (collections: AppCollection[], itemUid: UID): AppCollection | undefined => {
  return collections.find((c) => {
    return findItemInCollection(c, itemUid);
  });
};

export const findItemByPathname = (items: AppItem[] = [], pathname: string): AppItem | undefined => {
  return items.find((i) => i.pathname === pathname);
};

export const findItemInCollectionByPathname = (collection: AppCollection, pathname: string): AppItem | undefined => {
  const flattenedItems = flattenItems(collection.items);

  return findItemByPathname(flattenedItems, pathname);
};

export const findItemInCollectionByItemUid = (collection: AppCollection, itemUid: UID): AppItem | undefined => {
  const flattenedItems = flattenItems(collection.items);
  return findItem(flattenedItems, itemUid);
};

export const findParentItemInCollectionByPathname = (collection: AppCollection, pathname: string): AppItem | undefined => {
  const flattenedItems = flattenItems(collection.items);

  return flattenedItems.find((item) => {
    return item.items && item.items.find((i) => i.pathname === pathname);
  });
};

export const findItemInCollection = (collection: AppCollection, itemUid: UID): AppItem | undefined => {
  const flattenedItems = flattenItems(collection.items);

  return findItem(flattenedItems, itemUid);
};

export const findParentItemInCollection = (collection: AppCollection, itemUid: UID): AppItem | undefined => {
  const flattenedItems = flattenItems(collection.items);

  return flattenedItems.find((item) => {
    return item.items && item.items.find((i) => i.uid === itemUid);
  });
};

export const recursivelyGetAllItemUids = (items: AppItem[] = []): UID[] => {
  const flattenedItems = flattenItems(items);

  return map(flattenedItems, (i) => i.uid);
};

export const findEnvironmentInCollection = (collection: AppCollection, envUid: UID): Environment | undefined => {
  return collection.environments?.find((e) => e.uid === envUid);
};

export const findEnvironmentInCollectionByName = (collection: AppCollection, name: string): Environment | undefined => {
  return collection.environments?.find((e) => e.name === name);
};

export const areItemsLoading = (folder: AppItem | AppCollection | null | undefined): boolean => {
  if (!folder || (folder as AppCollection).isLoading) {
    return true;
  }

  const flattenedItems = flattenItems(folder.items || []);
  return flattenedItems?.reduce((isLoading: boolean, i: AppItem) => {
    if (i?.loading) {
      isLoading = true;
    }
    return isLoading;
  }, false);
};

export const getItemsLoadStats = (folder: AppItem | AppCollection): { loading: number; total: number } => {
  let loadingCount = 0;
  const flattenedItems = flattenItems(folder.items || []);
  flattenedItems?.forEach((i: AppItem) => {
    if (i?.loading) {
      loadingCount += 1;
    }
  });
  return {
    loading: loadingCount,
    total: flattenedItems?.length
  };
};

export const transformCollectionToSaveToExportAsFile = (collection: any, options = {}) => {
  const copyHeaders = (headers: any) => {
    return map(headers, (header) => {
      return {
        uid: header.uid,
        name: header.name,
        value: header.value,
        description: header.description,
        enabled: header.enabled
      };
    });
  };

  const copyParams = (params: any) => {
    return map(params, (param) => {
      return {
        uid: param.uid,
        name: param.name,
        value: param.value,
        description: param.description,
        type: param.type,
        enabled: param.enabled
      };
    });
  };

  const copyFormUrlEncodedParams = (params: any[] = []) => {
    return map(params, (param) => {
      return {
        uid: param.uid,
        name: param.name,
        value: param.value,
        description: param.description,
        enabled: param.enabled
      };
    });
  };

  const copyMultipartFormParams = (params: any[] = []) => {
    return map(params, (param) => {
      return {
        uid: param.uid,
        type: param.type,
        name: param.name,
        value: param.value,
        description: param.description,
        enabled: param.enabled
      };
    });
  };

  const copyFileParams = (params: any[] = []) => {
    return map(params, (param) => {
      return {
        uid: param.uid,
        filePath: param.filePath,
        contentType: param.contentType,
        selected: param.selected
      };
    });
  };

  const copyExamples = (examples: any[] = []) => {
    return map(examples, (example) => {
      const copiedExample: any = {
        uid: example.uid,
        itemUid: example.itemUid,
        name: example.name,
        description: example.description,
        type: example.type,
        request: {
          url: example.request.url,
          method: example.request.method,
          headers: copyHeaders(example.request.headers),
          params: copyParams(example.request.params),
          body: {
            mode: example.request.body.mode,
            json: example.request.body.json,
            text: example.request.body.text,
            xml: example.request.body.xml,
            graphql: example.request.body.graphql,
            sparql: example.request.body.sparql,
            formUrlEncoded: copyFormUrlEncodedParams(example.request.body.formUrlEncoded),
            multipartForm: copyMultipartFormParams(example.request.body.multipartForm),
            file: copyFileParams(example.request.body.file),
            grpc: example.request.body.grpc,
            ws: example.request.body.ws
          },
          auth: example.request.auth
        },
        response: {
          status: example.response.status,
          statusText: example.response.statusText,
          headers: copyHeaders(example.response.headers),
          body: example.response.body
        }
      };

      if (example.request.methodType) {
        copiedExample.request.methodType = example.request.methodType;
      }
      if (example.request.protoPath) {
        copiedExample.request.protoPath = example.request.protoPath;
      }

      return copiedExample;
    });
  };

  const normalizeFilenameToBru = (filename: any) => {
    if (!filename) return filename;
    return filename.replace(/\.(yml|yaml)$/i, '.bru');
  };

  const copyItems = (sourceItems: any, destItems: any) => {
    each(sourceItems, (si) => {
      if (!isItemAFolder(si) && !isItemARequest(si) && si.type !== 'js') {
        return;
      }

      const isGrpcRequest = si.type === 'grpc-request';

      const di: any = {
        uid: si.uid,
        type: si.type,
        name: si.name,
        filename: isItemARequest(si) ? normalizeFilenameToBru(si.filename) : si.filename,
        seq: si.seq,
        settings: si.settings,
        tags: si.tags,
        examples: copyExamples(si.examples || [])
      };

      if (si.request) {
        di.request = {
          url: si.request.url,
          method: si.request.method,
          headers: copyHeaders(si.request.headers),
          params: copyParams(si.request.params),
          body: {
            mode: si.request.body.mode,
            json: si.request.body.json,
            text: si.request.body.text,
            xml: si.request.body.xml,
            graphql: si.request.body.graphql,
            sparql: si.request.body.sparql,
            formUrlEncoded: copyFormUrlEncodedParams(si.request.body.formUrlEncoded),
            multipartForm: copyMultipartFormParams(si.request.body.multipartForm),
            file: copyFileParams(si.request.body.file),
            grpc: si.request.body.grpc,
            ws: si.request.body.ws
          },
          script: si.request.script,
          vars: si.request.vars,
          assertions: si.request.assertions,
          tests: si.request.tests,
          docs: si.request.docs
        };

        if (isGrpcRequest) {
          di.request.methodType = si.request.methodType;
          di.request.protoPath = si.request.protoPath;
          delete di.request.params;
        }

        di.request.auth = {
          mode: get(si.request, 'auth.mode', 'none')
        };

        switch (di.request.auth.mode) {
          case 'awsv4':
            di.request.auth.awsv4 = {
              accessKeyId: get(si.request, 'auth.awsv4.accessKeyId', ''),
              secretAccessKey: get(si.request, 'auth.awsv4.secretAccessKey', ''),
              sessionToken: get(si.request, 'auth.awsv4.sessionToken', ''),
              service: get(si.request, 'auth.awsv4.service', ''),
              region: get(si.request, 'auth.awsv4.region', ''),
              profileName: get(si.request, 'auth.awsv4.profileName', '')
            };
            break;
          case 'basic':
            di.request.auth.basic = {
              username: get(si.request, 'auth.basic.username', ''),
              password: get(si.request, 'auth.basic.password', '')
            };
            break;
          case 'bearer':
            di.request.auth.bearer = {
              token: get(si.request, 'auth.bearer.token', '')
            };
            break;
          case 'digest':
            di.request.auth.digest = {
              username: get(si.request, 'auth.digest.username', ''),
              password: get(si.request, 'auth.digest.password', '')
            };
            break;
          case 'ntlm':
            di.request.auth.ntlm = {
              username: get(si.request, 'auth.ntlm.username', ''),
              password: get(si.request, 'auth.ntlm.password', ''),
              domain: get(si.request, 'auth.ntlm.domain', '')
            };
            break;
          case 'oauth2':
            let grantType = get(si.request, 'auth.oauth2.grantType', '');
            switch (grantType) {
              case 'password':
                di.request.auth.oauth2 = {
                  grantType: grantType,
                  accessTokenUrl: get(si.request, 'auth.oauth2.accessTokenUrl', ''),
                  refreshTokenUrl: get(si.request, 'auth.oauth2.refreshTokenUrl', ''),
                  username: get(si.request, 'auth.oauth2.username', ''),
                  password: get(si.request, 'auth.oauth2.password', ''),
                  clientId: get(si.request, 'auth.oauth2.clientId', ''),
                  clientSecret: get(si.request, 'auth.oauth2.clientSecret', ''),
                  scope: get(si.request, 'auth.oauth2.scope', ''),
                  credentialsPlacement: get(si.request, 'auth.oauth2.credentialsPlacement', 'body'),
                  credentialsId: get(si.request, 'auth.oauth2.credentialsId', 'credentials'),
                  tokenPlacement: get(si.request, 'auth.oauth2.tokenPlacement', 'header'),
                  tokenHeaderPrefix: get(si.request, 'auth.oauth2.tokenHeaderPrefix', ''),
                  tokenQueryKey: get(si.request, 'auth.oauth2.tokenQueryKey', ''),
                  autoFetchToken: get(si.request, 'auth.oauth2.autoFetchToken', true),
                  autoRefreshToken: get(si.request, 'auth.oauth2.autoRefreshToken', true),
                  additionalParameters: get(si.request, 'auth.oauth2.additionalParameters', {})
                };
                break;
              case 'authorization_code':
                di.request.auth.oauth2 = {
                  grantType: grantType,
                  callbackUrl: get(si.request, 'auth.oauth2.callbackUrl', ''),
                  authorizationUrl: get(si.request, 'auth.oauth2.authorizationUrl', ''),
                  accessTokenUrl: get(si.request, 'auth.oauth2.accessTokenUrl', ''),
                  refreshTokenUrl: get(si.request, 'auth.oauth2.refreshTokenUrl', ''),
                  clientId: get(si.request, 'auth.oauth2.clientId', ''),
                  clientSecret: get(si.request, 'auth.oauth2.clientSecret', ''),
                  scope: get(si.request, 'auth.oauth2.scope', ''),
                  credentialsPlacement: get(si.request, 'auth.oauth2.credentialsPlacement', 'body'),
                  pkce: get(si.request, 'auth.oauth2.pkce', false),
                  credentialsId: get(si.request, 'auth.oauth2.credentialsId', 'credentials'),
                  tokenPlacement: get(si.request, 'auth.oauth2.tokenPlacement', 'header'),
                  tokenHeaderPrefix: get(si.request, 'auth.oauth2.tokenHeaderPrefix', ''),
                  tokenQueryKey: get(si.request, 'auth.oauth2.tokenQueryKey', ''),
                  autoFetchToken: get(si.request, 'auth.oauth2.autoFetchToken', true),
                  autoRefreshToken: get(si.request, 'auth.oauth2.autoRefreshToken', true),
                  additionalParameters: get(si.request, 'auth.oauth2.additionalParameters', {})
                };
                break;
              case 'implicit':
                di.request.auth.oauth2 = {
                  grantType: grantType,
                  callbackUrl: get(si.request, 'auth.oauth2.callbackUrl', ''),
                  authorizationUrl: get(si.request, 'auth.oauth2.authorizationUrl', ''),
                  clientId: get(si.request, 'auth.oauth2.clientId', ''),
                  scope: get(si.request, 'auth.oauth2.scope', ''),
                  state: get(si.request, 'auth.oauth2.state', ''),
                  credentialsId: get(si.request, 'auth.oauth2.credentialsId', 'credentials'),
                  tokenPlacement: get(si.request, 'auth.oauth2.tokenPlacement', 'header'),
                  tokenHeaderPrefix: get(si.request, 'auth.oauth2.tokenHeaderPrefix', 'Bearer'),
                  tokenQueryKey: get(si.request, 'auth.oauth2.tokenQueryKey', ''),
                  autoFetchToken: get(si.request, 'auth.oauth2.autoFetchToken', true),
                  additionalParameters: get(si.request, 'auth.oauth2.additionalParameters', {})
                };
                break;
              case 'client_credentials':
                di.request.auth.oauth2 = {
                  grantType: grantType,
                  accessTokenUrl: get(si.request, 'auth.oauth2.accessTokenUrl', ''),
                  refreshTokenUrl: get(si.request, 'auth.oauth2.refreshTokenUrl', ''),
                  clientId: get(si.request, 'auth.oauth2.clientId', ''),
                  clientSecret: get(si.request, 'auth.oauth2.clientSecret', ''),
                  scope: get(si.request, 'auth.oauth2.scope', ''),
                  credentialsPlacement: get(si.request, 'auth.oauth2.credentialsPlacement', 'body'),
                  credentialsId: get(si.request, 'auth.oauth2.credentialsId', 'credentials'),
                  tokenPlacement: get(si.request, 'auth.oauth2.tokenPlacement', 'header'),
                  tokenHeaderPrefix: get(si.request, 'auth.oauth2.tokenHeaderPrefix', ''),
                  tokenQueryKey: get(si.request, 'auth.oauth2.tokenQueryKey', ''),
                  autoFetchToken: get(si.request, 'auth.oauth2.autoFetchToken', true),
                  autoRefreshToken: get(si.request, 'auth.oauth2.autoRefreshToken', true),
                  additionalParameters: get(si.request, 'auth.oauth2.additionalParameters', {})
                };
                break;
            }
            break;
          case 'apikey':
            di.request.auth.apikey = {
              key: get(si.request, 'auth.apikey.key', ''),
              value: get(si.request, 'auth.apikey.value', ''),
              placement: get(si.request, 'auth.apikey.placement', 'header')
            };
            break;
          case 'wsse':
            di.request.auth.wsse = {
              username: get(si.request, 'auth.wsse.username', ''),
              password: get(si.request, 'auth.wsse.password', '')
            };
            break;
          default:
            break;
        }

        if (di.request.body.mode === 'json') {
          di.request.body.json = replaceTabsWithSpaces(di.request.body.json);
        }

        if (di.request.body.mode === 'grpc') {
          di.request.body.grpc = di.request.body.grpc.map((
            {
              name,
              content
            }: any,
            index: number
          ) => ({
            name: name ? name : `message ${index + 1}`,
            content: replaceTabsWithSpaces(content)
          }));
        }

        if (di.request.body.mode === 'ws') {
          di.request.body.ws = di.request.body.ws.map((
            {
              name,
              content,
              type
            }: any,
            index: number
          ) => ({
            name: name ? name : `message ${index + 1}`,
            type: type ?? 'json',
            content: replaceTabsWithSpaces(content)
          }));
        }
      }

      if (si.type == 'folder' && si?.root) {
        di.root = {
          request: {}
        };

        let { request, meta, docs } = si?.root || {};
        let { auth, headers, script = {}, vars = {}, tests } = request || {};

        if (auth?.mode) {
          di.root.request.auth = auth;
        }

        if (headers?.length) {
          di.root.request.headers = headers;
        }
        if (Object.keys(script)?.length) {
          di.root.request.script = {};
          if (script?.req?.length) {
            di.root.request.script.req = script?.req;
          }
          if (script?.res?.length) {
            di.root.request.script.res = script?.res;
          }
        }
        if (Object.keys(vars)?.length) {
          di.root.request.vars = {};
          if (vars?.req?.length) {
            di.root.request.vars.req = vars?.req;
          }
          if (vars?.res?.length) {
            di.root.request.vars.res = vars?.res;
          }
        }
        if (tests?.length) {
          di.root.request.tests = tests;
        }

        if (docs?.length) {
          di.root.docs = docs;
        }

        if (meta?.name) {
          di.root.meta = {};
          di.root.meta.name = meta?.name;
          di.root.meta.seq = meta?.seq;
        }
        if (!Object.keys(di.root.request)?.length) {
          delete di.root.request;
        }
        if (!Object.keys(di.root)?.length) {
          delete di.root;
        }
      }

      if (si.type === 'js') {
        di.fileContent = si.raw;
      }

      destItems.push(di);

      if (si.items && si.items.length) {
        di.items = [];
        copyItems(si.items, di.items);
      }
    });
  };

  const collectionToSave: any = {};
  collectionToSave.name = collection.name;
  collectionToSave.uid = collection.uid;

  // todo: move this to the place where collection gets created
  collectionToSave.version = '1';
  collectionToSave.items = [];
  collectionToSave.activeEnvironmentUid = collection.activeEnvironmentUid;
  collectionToSave.environments = (collection.environments || []).map((env: any) => ({
    ...env,
    variables: buildPersistedEnvVariables(env?.variables, { mode: 'save' })
  }));

  collectionToSave.root = {
    request: {}
  };

  let { request, docs, meta } = collection?.root || {};
  let { auth, headers, script = {}, vars = {}, tests } = request || {};

  if (auth?.mode) {
    collectionToSave.root.request.auth = auth;
  }
  if (headers?.length) {
    collectionToSave.root.request.headers = headers;
  }
  if (Object.keys(script)?.length) {
    collectionToSave.root.request.script = {};
    if (script?.req?.length) {
      collectionToSave.root.request.script.req = script?.req;
    }
    if (script?.res?.length) {
      collectionToSave.root.request.script.res = script?.res;
    }
  }
  if (Object.keys(vars)?.length) {
    collectionToSave.root.request.vars = {};
    if (vars?.req?.length) {
      collectionToSave.root.request.vars.req = vars?.req;
    }
    if (vars?.res?.length) {
      collectionToSave.root.request.vars.res = vars?.res;
    }
  }
  if (tests?.length) {
    collectionToSave.root.request.tests = tests;
  }
  if (docs?.length) {
    collectionToSave.root.docs = docs;
  }
  if (meta?.name) {
    collectionToSave.root.meta = {};
    collectionToSave.root.meta.name = meta?.name;
  }
  if (!Object.keys(collectionToSave.root.request)?.length) {
    delete collectionToSave.root.request;
  }
  if (!Object.keys(collectionToSave.root)?.length) {
    delete collectionToSave.root;
  }

  collectionToSave.brunoConfig = cloneDeep(collection?.brunoConfig);

  // delete proxy password if present
  if (collectionToSave?.brunoConfig?.proxy?.auth?.password) {
    delete collectionToSave.brunoConfig.proxy.auth.password;
  }

  if (collectionToSave?.brunoConfig?.protobuf?.importPaths) {
    collectionToSave.brunoConfig.protobuf.importPaths = collectionToSave.brunoConfig.protobuf.importPaths.map((importPath: any) => {
      delete importPath.exists;
      return importPath;
    });
  }

  if (collectionToSave?.brunoConfig?.protobuf?.protoFiles) {
    collectionToSave.brunoConfig.protobuf.protoFiles = collectionToSave.brunoConfig.protobuf.protoFiles.map((protoFile: any) => {
      delete protoFile.exists;
      return protoFile;
    });
  }

  copyItems(collection.items, collectionToSave.items);
  return collectionToSave;
};

export const transformRequestToSaveToFilesystem = (item: any) => {
  const _item = item.draft ? item.draft : item;

  const itemToSave: any = {
    uid: _item.uid,
    type: _item.type,
    name: _item.name,
    seq: _item.seq,
    settings: _item.settings,
    tags: _item.tags,
    examples: _item.examples || [],
    request: {
      method: _item.request.method,
      url: _item.request.url,
      params: [] as unknown[],
      headers: [] as unknown[],
      auth: _item.request.auth,
      body: _item.request.body,
      script: _item.request.script,
      vars: _item.request.vars,
      assertions: _item.request.assertions,
      tests: _item.request.tests,
      docs: _item.request.docs
    }
  };

  if (_item.type === 'grpc-request') {
    itemToSave.request.methodType = _item.request.methodType;
    itemToSave.request.protoPath = _item.request.protoPath;
    delete itemToSave.request.params;
  }

  if (_item.type === 'ws-request') {
    delete itemToSave.request.method;
    delete itemToSave.request.methodType;
    delete itemToSave.request.params;
  }

  // Only process params for non-gRPC requests
  if (!['grpc-request', 'ws-request'].includes(_item.type)) {
    each(_item.request.params, (param) => {
      itemToSave.request.params.push({
        uid: param.uid,
        name: param.name,
        value: param.value,
        description: param.description,
        type: param.type,
        enabled: param.enabled
      });
    });
  }

  each(_item.request.headers, (header) => {
    itemToSave.request.headers.push({
      uid: header.uid,
      name: header.name,
      value: header.value,
      description: header.description,
      enabled: header.enabled
    });
  });

  if (itemToSave.request.body.mode === 'json') {
    itemToSave.request.body = {
      ...itemToSave.request.body,
      json: replaceTabsWithSpaces(itemToSave.request.body.json)
    };
  }

  if (itemToSave.request.body.mode === 'grpc') {
    itemToSave.request.body = {
      ...itemToSave.request.body,
      grpc: itemToSave.request.body.grpc.map((
        {
          name,
          content
        }: any,
        index: number
      ) => ({
        name: name ? name : `message ${index + 1}`,
        content: replaceTabsWithSpaces(content)
      }))
    };
  }

  if (itemToSave.request.body.mode === 'ws') {
    itemToSave.request.body = {
      ...itemToSave.request.body,
      ws: itemToSave.request.body.ws.map((
        {
          name,
          content,
          type
        }: any,
        index: number
      ) => ({
        name: name ? name : `message ${index + 1}`,
        type,
        content: replaceTabsWithSpaces(content)
      }))
    };
  }

  return itemToSave;
};

export const transformCollectionRootToSave = (collection: any) => {
  const _collection = collection.draft?.root ? collection.draft.root : collection.root;

  const collectionRootToSave = {
    docs: _collection?.docs,
    meta: _collection?.meta,
    request: {
      auth: _collection?.request?.auth,
      headers: [] as unknown[],
      script: _collection?.request?.script,
      vars: _collection?.request?.vars,
      tests: _collection?.request?.tests
    }
  };

  each(_collection?.request?.headers, (header) => {
    collectionRootToSave.request.headers.push({
      uid: header.uid,
      name: header.name,
      value: header.value,
      description: header.description,
      enabled: header.enabled
    });
  });

  return collectionRootToSave;
};

export const transformFolderRootToSave = (folder: any) => {
  const _folder = folder.draft?.root ? folder.draft.root : folder.root;
  const folderRootToSave = {
    docs: _folder?.docs,
    request: {
      auth: _folder?.request?.auth,
      headers: [] as unknown[],
      script: _folder?.request?.script,
      vars: _folder?.request?.vars,
      tests: _folder?.request?.tests
    }
  };

  each(_folder?.request?.headers, (header) => {
    folderRootToSave.request.headers.push({
      uid: header.uid,
      name: header.name,
      value: header.value,
      description: header.description,
      enabled: header.enabled
    });
  });

  return folderRootToSave;
};

// todo: optimize this
export const deleteItemInCollection = (itemUid: any, collection: any) => {
  collection.items = filter(collection.items, (i) => i.uid !== itemUid);

  let flattenedItems = flattenItems(collection.items);
  each(flattenedItems, (i) => {
    if (i.items && i.items.length) {
      i.items = filter(i.items, (i) => i.uid !== itemUid);
    }
  });
};

export const deleteItemInCollectionByPathname = (pathname: any, collection: any) => {
  collection.items = filter(collection.items, (i) => i.pathname !== pathname);

  let flattenedItems = flattenItems(collection.items);
  each(flattenedItems, (i) => {
    if (i.items && i.items.length) {
      i.items = filter(i.items, (i) => i.pathname !== pathname);
    }
  });
};

export const isItemARequest = (item: AppItem): boolean => {
  if (!item) return false;
  return 'request' in item && ['http-request', 'graphql-request', 'grpc-request', 'ws-request'].includes(item.type) && !item.items;
};

export const isItemAFolder = (item: AppItem): boolean => {
  if (!item) return false;
  return !('request' in item) && item.type === 'folder';
};

export const humanizeRequestBodyMode = (mode: string | null | undefined): string => {
  let label = 'No Body';
  switch (mode) {
    case 'json': {
      label = 'JSON';
      break;
    }
    case 'text': {
      label = 'TEXT';
      break;
    }
    case 'xml': {
      label = 'XML';
      break;
    }
    case 'sparql': {
      label = 'SPARQL';
      break;
    }
    case 'javascript': {
      label = 'JavaScript';
      break;
    }
    case 'file': {
      label = 'File / Binary';
      break;
    }
    case 'formUrlEncoded': {
      label = 'Form URL Encoded';
      break;
    }
    case 'multipartForm': {
      label = 'Multipart Form';
      break;
    }
  }

  return label;
};

export const humanizeRequestAuthMode = (mode: string | null | undefined): string => {
  let label = 'No Auth';
  switch (mode) {
    case 'inherit': {
      label = 'Inherit';
      break;
    }
    case 'awsv4': {
      label = 'AWS Sig V4';
      break;
    }
    case 'basic': {
      label = 'Basic Auth';
      break;
    }
    case 'bearer': {
      label = 'Bearer Token';
      break;
    }
    case 'digest': {
      label = 'Digest Auth';
      break;
    }
    case 'ntlm': {
      label = 'NTLM';
      break;
    }
    case 'oauth2': {
      label = 'OAuth 2.0';
      break;
    }
    case 'wsse': {
      label = 'WSSE Auth';
      break;
    }
    case 'apikey': {
      label = 'API Key';
      break;
    }
  }

  return label;
};

export const humanizeRequestAPIKeyPlacement = (placement: string | null | undefined): string => {
  let label = 'Header';
  switch (placement) {
    case 'header': {
      label = 'Header';
      break;
    }
    case 'queryparams': {
      label = 'Query Params';
      break;
    }
  }

  return label;
};

export const humanizeGrantType = (mode: string | null | undefined): string => {
  if (!mode || typeof mode !== 'string') {
    return '';
  }

  switch (mode) {
    case 'password':
      return 'Password Credentials';
    case 'authorization_code':
      return 'Authorization Code';
    case 'client_credentials':
      return 'Client Credentials';
    case 'implicit':
      return 'Implicit';
    default:
      return mode;
  }
};

export const refreshUidsInItem = (item: AppItem): AppItem => {
  item.uid = uuid() as UID;

  each(get(item, 'request.headers'), (header: { uid?: string }) => (header.uid = uuid()));
  each(get(item, 'request.params'), (param: { uid?: string }) => (param.uid = uuid()));
  each(get(item, 'request.body.multipartForm'), (param: { uid?: string }) => (param.uid = uuid()));
  each(get(item, 'request.body.formUrlEncoded'), (param: { uid?: string }) => (param.uid = uuid()));
  each(get(item, 'request.body.file'), (param: { uid?: string }) => (param.uid = uuid()));
  each(get(item, 'request.assertions'), (assertion: { uid?: string }) => (assertion.uid = uuid()));

  return item;
};

export const deleteUidsInItem = (item: AppItem): AppItem => {
  (item as { uid?: UID }).uid = undefined;
  const params = get(item, 'request.params', []);
  const headers = get(item, 'request.headers', []);
  const bodyFormUrlEncoded = get(item, 'request.body.formUrlEncoded', []);
  const bodyMultipartForm = get(item, 'request.body.multipartForm', []);
  const file = get(item, 'request.body.file', []);
  const assertions = get(item, 'request.assertions', []);

  params.forEach((param: { uid?: string }) => delete param.uid);
  headers.forEach((header: { uid?: string }) => delete header.uid);
  bodyFormUrlEncoded.forEach((param: { uid?: string }) => delete param.uid);
  bodyMultipartForm.forEach((param: { uid?: string }) => delete param.uid);
  file.forEach((param: { uid?: string }) => delete param.uid);
  assertions.forEach((assertion: { uid?: string }) => delete assertion.uid);

  return item;
};

export const areItemsTheSameExceptSeqUpdate = (_item1: any, _item2: any) => {
  if (!_item1 || !_item2) return _item1 === _item2;

  try {
    // Use JSON for safe cloning to avoid stack overflow with Immer proxies
    const safeClone = (obj: any) => {
      if (!obj) return obj;
      const cloned = JSON.parse(JSON.stringify({
        uid: obj.uid,
        name: obj.name,
        type: obj.type,
        request: obj.request,
        settings: obj.settings
      }));
      return cloned;
    };

    let item1 = safeClone(_item1);
    let item2 = safeClone(_item2);

    item1 = transformRequestToSaveToFilesystem(item1);
    item2 = transformRequestToSaveToFilesystem(item2);

    // delete uids from both items
    deleteUidsInItem(item1);
    deleteUidsInItem(item2);

    return isEqual(item1, item2);
  } catch (err) {
    // If comparison fails, assume items are different to be safe
    return false;
  }
};

export const hasRequestChanges = (item: AppItem | null | undefined): boolean => {
  if (!item || !item.draft) {
    return false;
  }

  try {
    // Clone item and draft for comparison, excluding examples and runtime properties
    const excludeProperties = new Set([
      'examples',
      'draft',
      'response',
      'requestState',
      'cancelTokenUid',
      'requestStartTime',
      'requestSent',
      'requestUid',
      'testResults',
      'assertionResults',
      'preRequestTestResults',
      'postResponseTestResults',
      'preRequestScriptErrorMessage',
      'postResponseScriptErrorMessage',
      'testScriptErrorMessage'
    ]);

    // Deep clone helper that excludes certain properties
    const cloneForComparison = (obj: any): any => {
      if (!obj || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(cloneForComparison);

      const result: any = {};
      for (const key of Object.keys(obj)) {
        if (!excludeProperties.has(key)) {
          result[key] = cloneForComparison(obj[key]);
        }
      }
      return result;
    };

    // Clone original item (without draft and examples)
    const originalItem = cloneForComparison(item);
    // Clone draft item (without examples)
    const draftItem = cloneForComparison(item.draft);

    // Use JSON stringification for deep comparison
    return JSON.stringify(originalItem) !== JSON.stringify(draftItem);
  } catch (err) {
    // If comparison fails, assume there are changes to be safe
    return true;
  }
};

export const hasExampleChanges = (_item: any, exampleUid: any) => {
  if (!_item || !_item.draft || !exampleUid) {
    return false;
  }

  try {
    // Use JSON for safe cloning to avoid stack overflow with Immer proxies
    const originalExamples = _item.examples ? JSON.parse(JSON.stringify(_item.examples)) : [];
    const draftExamples = _item.draft.examples ? JSON.parse(JSON.stringify(_item.draft.examples)) : [];

    const originalExample = originalExamples.find((ex: any) => ex.uid === exampleUid);
    if (!originalExample) {
      return false;
    }

    const draftExample = draftExamples.find((ex: any) => ex.uid === exampleUid);
    if (!draftExample) {
      return false;
    }

    // Delete UIDs for comparison
    delete originalExample.uid;
    delete draftExample.uid;

    // Compare the examples (excluding any internal metadata)
    return !isEqual(originalExample, draftExample);
  } catch (err) {
    return true;
  }
};

export const getDefaultRequestPaneTab = (item: AppItem): string | undefined => {
  if (item.type === 'http-request') {
    // If no params are enabled and body mode is set, default to 'body' tab
    // This provides better UX for POST/PUT requests with a body
    const request = item.draft?.request || item.request;
    const params = (request as { params?: Array<{ enabled?: boolean }> })?.params || [];
    const bodyMode = (request as { body?: { mode?: string } })?.body?.mode;
    const hasEnabledParams = params.some((p: { enabled?: boolean }) => p.enabled);

    if (!hasEnabledParams && bodyMode && bodyMode !== 'none') {
      return 'body';
    }
    return 'params';
  }

  if (item.type === 'graphql-request') {
    return 'query';
  }

  if (['ws-request', 'grpc-request'].includes(item.type)) {
    return 'body';
  }
};

interface GlobalEnvironmentsParams {
  globalEnvironments: Environment[] | null | undefined;
  activeGlobalEnvironmentUid: UID | null | undefined;
}

export const getGlobalEnvironmentVariables = ({
  globalEnvironments,
  activeGlobalEnvironmentUid
}: GlobalEnvironmentsParams): Record<string, unknown> => {
  const variables: Record<string, unknown> = {};
  const environment = globalEnvironments?.find((env) => env?.uid === activeGlobalEnvironmentUid);
  if (environment) {
    each(environment.variables, (variable) => {
      if (variable.name && variable.enabled) {
        variables[variable.name] = variable.value;
      }
    });
  }
  return variables;
};

export const getGlobalEnvironmentVariablesMasked = ({
  globalEnvironments,
  activeGlobalEnvironmentUid
}: GlobalEnvironmentsParams): string[] => {
  const environment = globalEnvironments?.find((env) => env?.uid === activeGlobalEnvironmentUid);

  if (environment && Array.isArray(environment.variables)) {
    return environment.variables
      .filter((variable) => variable.name && variable.value && variable.enabled && variable.secret)
      .map((variable) => variable.name || '');
  }

  return [];
};

export const getEnvironmentVariables = (collection: AppCollection | null | undefined): Record<string, unknown> => {
  const variables: Record<string, unknown> = {};
  if (collection) {
    const environment = findEnvironmentInCollection(collection, collection.activeEnvironmentUid as UID);
    if (environment) {
      each(environment.variables, (variable) => {
        if (variable.name && variable.value && variable.enabled) {
          variables[variable.name] = variable.value;
        }
      });
    }
  }

  return variables;
};

export const getEnvironmentVariablesMasked = (collection: AppCollection | null | undefined): string[] => {
  if (!collection || !collection.activeEnvironmentUid) {
    return [];
  }

  const environment = findEnvironmentInCollection(collection, collection.activeEnvironmentUid);
  if (!environment || !environment.variables) {
    return [];
  }

  return environment.variables
    .filter((variable: any) => variable.name && variable.value && variable.enabled && variable.secret)
    .map((variable: any) => variable.name);
};

const getPathParams = (item: any) => {
  let pathParams: Record<string, any> = {};
  if (!item) return pathParams;

  // Check draft params first, then fall back to request params
  const params = item.draft?.request?.params || item.request?.params || [];
  params.forEach((param: any) => {
    if (param.type === 'path' && param.name) {
      pathParams[param.name] = param.value || '';
    }
  });
  return pathParams;
};

export const getTotalRequestCountInCollection = (collection: any) => {
  let count = 0;
  each(collection.items, (item) => {
    if (isItemARequest(item)) {
      count++;
    } else if (isItemAFolder(item)) {
      count += getTotalRequestCountInCollection(item);
    }
  });

  return count;
};

export const getAllVariables = (collection: any, item: any) => {
  if (!collection) return {};
  const envVariables = getEnvironmentVariables(collection);
  const requestTreePath = getTreePathFromCollectionToItem(collection, item);
  let { collectionVariables, folderVariables, requestVariables } = mergeVars(collection, requestTreePath);
  const pathParams = getPathParams(item);
  const { globalEnvironmentVariables = {} } = collection;

  const { processEnvVariables = {}, runtimeVariables = {}, promptVariables = {} } = collection;
  const mergedVariables = {
    ...folderVariables,
    ...requestVariables,
    ...runtimeVariables,
    ...promptVariables
  };

  const mergedVariablesGlobal = {
    ...collectionVariables,
    ...envVariables,
    ...folderVariables,
    ...requestVariables,
    ...runtimeVariables,
    ...promptVariables
  };

  const maskedEnvVariables = getEnvironmentVariablesMasked(collection) || [];
  const maskedGlobalEnvVariables = collection?.globalEnvSecrets || [];

  const filteredMaskedEnvVariables = maskedEnvVariables.filter((key: any) => !(key in mergedVariables));
  const filteredMaskedGlobalEnvVariables = maskedGlobalEnvVariables.filter((key: any) => !(key in mergedVariablesGlobal));

  const uniqueMaskedVariables = [...new Set([...filteredMaskedEnvVariables, ...filteredMaskedGlobalEnvVariables])];

  const oauth2CredentialVariables = getFormattedCollectionOauth2Credentials({ oauth2Credentials: collection?.oauth2Credentials });

  return {
    ...globalEnvironmentVariables,
    ...collectionVariables,
    ...envVariables,
    ...folderVariables,
    ...requestVariables,
    ...oauth2CredentialVariables,
    ...runtimeVariables,
    ...promptVariables,
    pathParams: {
      ...pathParams
    },
    maskedEnvVariables: uniqueMaskedVariables,
    process: {
      env: {
        ...processEnvVariables
      }
    }
  };
};

export const mergeHeaders = (collection: any, request: any, requestTreePath: any) => {
  let headers = new Map();

  const collectionHeaders = collection?.draft?.root ? get(collection, 'draft.root.request.headers', []) : get(collection, 'root.request.headers', []);
  collectionHeaders.forEach((header: any) => {
    if (header.enabled) {
      headers.set(header.name, header);
    }
  });

  if (requestTreePath && requestTreePath.length > 0) {
    for (let i of requestTreePath) {
      if (i.type === 'folder') {
        const folderHeaders = i?.draft?.root ? get(i, 'draft.root.request.headers', []) : get(i, 'root.request.headers', []);
        folderHeaders.forEach((header: any) => {
          if (header.enabled) {
            headers.set(header.name, header);
          }
        });
      }
    }
  }

  const requestHeaders = request.headers || [];
  requestHeaders.forEach((header: any) => {
    if (header.enabled) {
      headers.set(header.name, header);
    }
  });

  return Array.from(headers.values());
};

export const maskInputValue = (value: any) => {
  if (!value || typeof value !== 'string') {
    return '';
  }

  return value
    .split('')
    .map(() => '*')
    .join('');
};

export const getTreePathFromCollectionToItem = (collection: any, _item: any) => {
  let path: any = [];
  let item = findItemInCollection(collection, _item?.uid);
  while (item) {
    path.unshift(item);
    item = findParentItemInCollection(collection, item?.uid);
  }
  return path;
};

const mergeVars = (collection: any, requestTreePath: any[] = []) => {
  let collectionVariables: Record<string, any> = {};
  let folderVariables: Record<string, any> = {};
  let requestVariables: Record<string, any> = {};
  const collectionRoot = collection?.draft?.root || collection?.root || {};
  let collectionRequestVars = get(collectionRoot, 'request.vars.req', []);
  collectionRequestVars.forEach((_var: any) => {
    if (_var.enabled) {
      collectionVariables[_var.name] = _var.value;
    }
  });
  for (let i of requestTreePath) {
    if (!i) {
      continue;
    }

    if (i.type === 'folder') {
      const folderRoot = i.draft?.root || i.root;
      let vars = get(folderRoot, 'request.vars.req', []);
      vars.forEach((_var: any) => {
        if (_var.enabled) {
          folderVariables[_var.name] = _var.value;
        }
      });
    } else {
      let vars = i.draft ? get(i, 'draft.request.vars.req', []) : get(i, 'request.vars.req', []);
      vars.forEach((_var: any) => {
        if (_var.enabled) {
          requestVariables[_var.name] = _var.value;
        }
      });
    }
  }
  return {
    collectionVariables,
    folderVariables,
    requestVariables
  };
};

export const getEnvVars = (environment: any = {}) => {
  const variables = environment.variables;
  if (!variables || !variables.length) {
    return {
      __name__: environment.name
    };
  }

  const envVars: Record<string, any> = {};
  each(variables, (variable) => {
    if (variable.enabled) {
      envVars[variable.name] = variable.value;
    }
  });

  return {
    ...envVars,
    __name__: environment.name
  };
};

export const getFormattedCollectionOauth2Credentials = ({ oauth2Credentials = [] }: { oauth2Credentials?: any[] }) => {
  let credentialsVariables: Record<string, any> = {};
  oauth2Credentials.forEach(({ credentialsId, credentials }) => {
    if (credentials) {
      Object.entries(credentials).forEach(([key, value]) => {
        credentialsVariables[`$oauth2.${credentialsId}.${key}`] = value;
      });
    }
  });
  return credentialsVariables;
};

// item sequence utils - START

export const resetSequencesInFolder = (folderItems: any) => {
  const items = folderItems;
  const sortedItems = sortByNameThenSequence(items);
  return sortedItems.map((item: any, index: any) => {
    item.seq = index + 1;
    return item;
  });
};

export const isItemBetweenSequences = (itemSequence: any, sourceItemSequence: any, targetItemSequence: any) => {
  if (targetItemSequence > sourceItemSequence) {
    return itemSequence > sourceItemSequence && itemSequence < targetItemSequence;
  }
  return itemSequence < sourceItemSequence && itemSequence >= targetItemSequence;
};

export const calculateNewSequence = (isDraggedItem: any, targetSequence: any, draggedSequence: any) => {
  if (!isDraggedItem) {
    return null;
  }
  return targetSequence > draggedSequence ? targetSequence - 1 : targetSequence;
};

export const getReorderedItemsInTargetDirectory = ({
  items,
  targetItemUid,
  draggedItemUid
}: any) => {
  const itemsWithFixedSequences = resetSequencesInFolder(cloneDeep(items));
  const targetItem = findItem(itemsWithFixedSequences, targetItemUid);
  const draggedItem = findItem(itemsWithFixedSequences, draggedItemUid);
  const targetSequence = targetItem?.seq;
  const draggedSequence = draggedItem?.seq;
  itemsWithFixedSequences?.forEach((item: any) => {
    const isDraggedItem = item?.uid === draggedItemUid;
    const isBetween = isItemBetweenSequences(item?.seq, draggedSequence, targetSequence);
    if (isBetween) {
      item.seq += targetSequence > draggedSequence ? -1 : 1;
    }
    const newSequence = calculateNewSequence(isDraggedItem, targetSequence, draggedSequence);
    if (newSequence !== null) {
      item.seq = newSequence;
    }
  });
  // only return items that have been reordered
  return itemsWithFixedSequences.filter((item: any) => items?.find((originalItem: any) => originalItem?.uid === item?.uid)?.seq !== item?.seq
  );
};

export const getReorderedItemsInSourceDirectory = ({
  items
}: any) => {
  const itemsWithFixedSequences = resetSequencesInFolder(cloneDeep(items));
  return itemsWithFixedSequences.filter((item: any) => items?.find((originalItem: any) => originalItem?.uid === item?.uid)?.seq !== item?.seq
  );
};

export const calculateDraggedItemNewPathname = ({
  draggedItem,
  targetItem,
  dropType,
  collectionPathname
}: any) => {
  const { pathname: targetItemPathname } = targetItem;
  const { filename: draggedItemFilename } = draggedItem;
  const targetItemDirname = path.dirname(targetItemPathname);
  const isTargetTheCollection = targetItemPathname === collectionPathname;
  const isTargetItemAFolder = isItemAFolder(targetItem);

  if (dropType === 'inside' && (isTargetItemAFolder || isTargetTheCollection)) {
    return path.join(targetItemPathname, draggedItemFilename);
  } else if (dropType === 'adjacent') {
    return path.join(targetItemDirname, draggedItemFilename);
  }
  return null;
};

// item sequence utils - END

export const getUniqueTagsFromItems = (items: AppItem[] = []): string[] => {
  const allTags = new Set<string>();
  const getTags = (items: AppItem[]) => {
    items.forEach((item) => {
      if (isItemARequest(item)) {
        const tags: string[] = item.draft ? get(item, 'draft.tags', []) : get(item, 'tags', []);
        tags.forEach((tag) => allTags.add(tag));
      }
      if (item.items) {
        getTags(item.items);
      }
    });
  };
  getTags(items);
  return Array.from(allTags).sort();
};

export const getRequestItemsForCollectionRun = ({
  recursive,
  items = [],
  tags
}: { recursive?: boolean; items?: AppItem[]; tags?: { include?: string[]; exclude?: string[] } }) => {
  let requestItems: AppItem[] = [];

  if (recursive) {
    requestItems = flattenItems(items);
  } else {
    each(items, (item) => {
      if (item.request) {
        requestItems.push(item);
      }
    });
  }

  const requestTypes = ['http-request', 'graphql-request'];
  requestItems = requestItems.filter((request: any) => requestTypes.includes(request.type));

  if (tags && tags.include && tags.exclude) {
    const includeTags = tags.include ? tags.include : [];
    const excludeTags = tags.exclude ? tags.exclude : [];
    requestItems = requestItems.filter(({
      tags: requestTags = [],
      draft
    }: any) => {
      requestTags = draft?.tags || requestTags || [];
      return isRequestTagsIncluded(requestTags, includeTags, excludeTags);
    });
  }

  return requestItems;
};

export const getPropertyFromDraftOrRequest = (item: any, propertyKey: any, defaultValue: any = null) => {
  return item.draft ? get(item, `draft.${propertyKey}`, defaultValue) : get(item, propertyKey, defaultValue);
};

export const transformExampleToDraft = (example: any, newExample: any) => {
  const exampleToDraft = cloneDeep(example);

  if (newExample.name) {
    exampleToDraft.name = newExample.name;
  }
  if (newExample.description) {
    exampleToDraft.description = newExample.description;
  }
  if (newExample.status) {
    exampleToDraft.response.status = String(newExample.status);
  }
  if (newExample.statusText) {
    exampleToDraft.response.statusText = newExample.statusText;
  }
  if (newExample.headers && newExample.headers.length) {
    exampleToDraft.response.headers = newExample.headers.map((header: any) => ({
      uid: uuid(),
      name: String(header.name),
      value: String(header.value),
      description: String(header.description),
      enabled: header.enabled
    }));
  }
  if (newExample.body) {
    exampleToDraft.response.body = newExample.body;
  }

  return exampleToDraft;
};

/**
 * Generate an initial name for a new response example
 * @param {Object} item - The request item that will contain the example
 * @returns {string} - The suggested name for the new example
 */
export const getInitialExampleName = (item: any) => {
  const baseName = 'example';
  const existingExamples = item.draft?.examples || item.examples || [];
  const existingNames = new Set(existingExamples.map((example: any) => example.name || '').filter(Boolean));

  if (!existingNames.has(baseName)) {
    return baseName;
  }

  let counter = 1;
  while (true) {
    const candidateName = `${baseName} (${counter})`;
    if (!existingNames.has(candidateName)) {
      return candidateName;
    }
    counter++;
  }
};

export const getVariableScope = (variableName: any, collection: any, item: any) => {
  if (!variableName || !collection) {
    return null;
  }

  if (item) {
    const requestVars = item.draft ? get(item, 'draft.request.vars.req', []) : get(item, 'request.vars.req', []);
    const requestVar = requestVars.find((v: any) => v.name === variableName && v.enabled);
    if (requestVar) {
      return {
        type: 'request',
        value: requestVar.value,
        data: { item, variable: requestVar }
      };
    }
  }

  const requestTreePath = getTreePathFromCollectionToItem(collection, item);
  for (let i = requestTreePath.length - 1; i >= 0; i--) {
    const pathItem = requestTreePath[i];
    if (!pathItem) {
      continue;
    }

    if (pathItem.type === 'folder') {
      const folderRoot = pathItem.draft?.root || pathItem.root;
      const folderVars = get(folderRoot, 'request.vars.req', []);
      const folderVar = folderVars.find((v: any) => v.name === variableName && v.enabled);
      if (folderVar) {
        return {
          type: 'folder',
          value: folderVar.value,
          data: { folder: pathItem, variable: folderVar }
        };
      }
    }
  }

  if (collection.activeEnvironmentUid) {
    const environment = findEnvironmentInCollection(collection, collection.activeEnvironmentUid);
    if (environment && environment.variables) {
      const envVar = environment.variables.find((v: any) => v.name === variableName && v.enabled);
      if (envVar) {
        return {
          type: 'environment',
          value: envVar.value,
          data: { environment, variable: envVar }
        };
      }
    }
  }

  const collectionRoot = (collection.draft && collection.draft.root) || collection.root || {};
  const collectionVars = get(collectionRoot, 'request.vars.req', []);
  const collectionVar = collectionVars.find((v: any) => v.name === variableName && v.enabled);
  if (collectionVar) {
    return {
      type: 'collection',
      value: collectionVar.value,
      data: { collection, variable: collectionVar }
    };
  }

  const { globalEnvironmentVariables = {} } = collection;
  if (globalEnvironmentVariables && globalEnvironmentVariables[variableName]) {
    return {
      type: 'global',
      value: globalEnvironmentVariables[variableName],
      data: { variableName, value: globalEnvironmentVariables[variableName] }
    };
  }

  const { runtimeVariables = {} } = collection;
  if (runtimeVariables && runtimeVariables[variableName]) {
    return {
      type: 'runtime',
      value: runtimeVariables[variableName],
      data: { variableName, value: runtimeVariables[variableName], readonly: true }
    };
  }

  // Process.env variables are not checked here

  return null;
};

export const isVariableSecret = (scopeInfo: any) => {
  if (!scopeInfo) {
    return false;
  }

  // Only environment variables can be marked as secret
  if (scopeInfo.type === 'environment') {
    return !!scopeInfo.data.variable?.secret;
  }

  // Global variables are not checked here
  if (scopeInfo.type === 'global') {
    return false;
  }

  return false;
};

/**
 * Generate a unique request name by checking existing filenames in the collection and filesystem
 * @param {Object} collection - The collection object
 * @param {string} baseName - The base name (default: 'Untitled')
 * @param {string} itemUid - The parent item UID (null for root level, folder UID for folder level)
 * @returns {Promise<string>} - A unique request name (Untitled, Untitled1, Untitled2, etc.)
 */
export const generateUniqueRequestName = async (collection: any, baseName = 'Untitled', itemUid: string | null = null) => {
  if (!collection) {
    return baseName;
  }

  const trim = require('lodash/trim');
  const parentItem = itemUid ? findItemInCollection(collection, itemUid) : null;
  const parentItems = parentItem ? (parentItem.items || []) : (collection.items || []);
  const baseNamePattern = new RegExp(`^${baseName}(\\d+)?$`);
  // Support .bru, .yml, and .yaml file extensions
  const requestExtensions = /\.(bru|yml|yaml)$/i;
  const matchingItems = parentItems
    .filter((item: any) => {
      if (item.type === 'folder') return false;

      const filename = trim(item.filename);
      if (!requestExtensions.test(filename)) return false;

      const filenameWithoutExt = filename.replace(requestExtensions, '');
      return baseNamePattern.test(filenameWithoutExt);
    })
    .map((item: any) => {
      const filenameWithoutExt = trim(item.filename).replace(requestExtensions, '');
      const match = filenameWithoutExt.match(baseNamePattern);

      if (!match) return null;

      const number = match[1] ? parseInt(match[1], 10) : 0;
      return { name: filenameWithoutExt, number: isNaN(number) ? null : number };
    })
    .filter((item: any) => item !== null && item.number !== null);

  if (matchingItems.length === 0) {
    return baseName;
  }

  const sortedMatches = matchingItems.sort((a: any, b: any) => a.number - b.number);
  const lastElement = sortedMatches[sortedMatches.length - 1];
  const nextNumber = lastElement.number + 1;

  return `${baseName}${nextNumber}`;
};
