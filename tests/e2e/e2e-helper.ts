import { Frame, Page, expect } from "@playwright/test";
import { test } from "./utils/fixtures";
import { Context } from "./context";
import { buildCommonLocators } from "./utils/page/locators";
import {
  createCollectionV2, createFolder, expandCollection, createRequestInFolder, createRequestV2, deleteRequestV2, exportCollectionV2,
  openBrunoSidebar, removeCollection, runCommand, saveRequestV2,
  sendRequest, setAuth, setCodeMirrorValue, takeScreenshot,
} from "./utils/page/actions";

type KeyValue<T = string | number | boolean> = {
  [k: string]: T,
}

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
type RequestType = 'HTTP' | 'GraphQL' | 'gRPC' | `WebSocket`;
type FileFormat = 'yml' | 'bru';

export type ResponsePaneTab = { tab: 'Timeline', section: 'Request' | 'Response' | 'Network' } | { tab: 'Response' | 'Headers' | 'Tests' };

export type TextCheck = {
  contains?: (string | RegExp)[],
  notContains?: (string | RegExp)[],
}

type RequestConfig<EnvName extends string = string> = {
  name: string;
  url: string;
  params?: KeyValue[],
  headers?: KeyValue[],
  payload?: string;
  type: RequestType,
  method: RequestMethod
  run?: boolean,
  env?: NoInfer<EnvName>
  delete?: boolean;
  auth?: AuthMode;
}

type FolderConfig<EnvName extends string = string> = {
  name: string,
  auth?: AuthMode,
  folders?: FolderConfig<EnvName>[],
  requests?: RequestConfig<EnvName>[],
}

export type AuthMode = 'inherit' | 'none' | 'basic' | 'bearer' | 'digest' | 'ntlm' | 'wsse' | 'apikey' | 'awsv4' | 'oauth2';
export type AuthFields = {
  username?: string, password?: string, token?: string,
  accessKeyId?: string, secretAccessKey?: string, service?: string, region?: string,
  key?: string, value?: string, addTo?: 'header' | 'queryParams', domain?: string,
  grantType?: 'passwordCredentials' | 'authorizationCode' | 'implicit' | 'clientCredentials',
  accessTokenUrl?: string, refreshTokenUrl?: string, clientId?: string, clientSecret?: string, scope?: string,
  addCredentialsTo?: 'requestBody' | 'basicAuthHeader', addTokenTo?: 'header' | 'url',
};

type EnvConfig<EnvName extends string = string> = {
  name: EnvName,
  vars: { [k: string]: string }[]
}

type CollectionConfig<EnvName extends string = string> = {
  format: FileFormat,
  name: string,
  vars?: KeyValue[],
  folders?: FolderConfig<EnvName>[],
  requests?: RequestConfig<EnvName>[]
  export?: boolean
  auth?: AuthMode
} | string /* fixture path */

type Config<EnvName extends string = string> = {
  collections: CollectionConfig<EnvName>[];
  envs?: EnvConfig<EnvName>[]
}


type FolderEntry = { folder: FolderConfig, parent?: string }
type RequestEntry = { request: RequestConfig, folder?: string }

// Every folder with its parent folder's name, parents before their children.
function flattenFolders(folders: FolderConfig[] = [], parent?: string): FolderEntry[] {
  return folders.flatMap((folder) => [{ folder, parent }, ...flattenFolders(folder.folders, folder.name)])
}


async function addRequest(page: Page, sidebar: Frame, ctx: Context, collection: string, { request, folder }: RequestEntry) {
  if (folder) {
    await createRequestInFolder(page, sidebar, { collection, folder, name: request.name, type: request.type, method: request.method, url: request.url })

    const rows = buildCommonLocators(sidebar).sidebar
    const folderDepth = await rows.collectionItem(folder).locator('.indent-block').count()
    await expect(rows.collectionItem(request.name).locator('.indent-block')).toHaveCount(folderDepth + 1)
  } else {
    const requestWebview = await createRequestV2(page, sidebar, ctx, collection, request.type, request.method)
    await setCodeMirrorValue(page, requestWebview.locator('.CodeMirror').first(), request.url)

    if (request.run) {
      await sendRequest(requestWebview, 200)
    }

    await saveRequestV2(page, requestWebview, ctx, request.name, true)
  }

  if (request.auth) {
    await setAuth(page, request.name, request.auth)
  }
}

// Builds the workspace and returns the names of the collections it created
export async function performE2E<const EnvName extends string = never>(config: Config<EnvName>, page: Page): Promise<string[]> {
  const sidebar = await openBrunoSidebar(page);
  const collections: string[] = [];

  for (const [index, collection] of config.collections.entries()) {
    if (typeof collection === 'string') {
      // import collection
    } else {
      const folders = flattenFolders(collection.folders)
      const requests: RequestEntry[] = [
        ...(collection.requests ?? []).map((request) => ({ request })),
        ...folders.flatMap(({ folder }) => (folder.requests ?? []).map((request) => ({ request, folder: folder.name }))),
      ]

      const ctx = await createCollectionV2(page, sidebar, collection.name, index !== 0, collection.format)
      collections.push(collection.name)
      await expandCollection(sidebar, collection.name)

      for (const { folder, parent } of folders) {
        await createFolder(sidebar, parent ?? collection.name, folder.name, !parent)
      }

      for (const entry of requests) {
        await addRequest(page, sidebar, ctx, collection.name, entry)
      }

      for (const { folder } of folders) {
        if (folder.auth) {
          await setAuth(page, folder.name, folder.auth)
        }
      }

      if (collection.auth) {
        await setAuth(page, collection.name, collection.auth)
      }

      // Delete only after every request is saved, so deletes don't shift the "Untitled N" titles.
      const toDelete = requests.filter(({ request }) => request.delete)
      for (const { request } of toDelete) {
        await deleteRequestV2(page, sidebar, ctx, request.name, collection.format)
      }

      if (collection.export) {
        const exported = await exportCollectionV2(page, sidebar, ctx)

        // verify the export reflects the deletes
        const exportedNames = (exported.items ?? []).map((item: { name: string }) => item.name);
        const remainingNames = requests.filter(({ request }) => !request.delete).map(({ request }) => request.name);
        expect(exportedNames.sort()).toEqual(remainingNames.sort());
      }
    }
  }

  return collections
}

export type Workspace = Parameters<typeof performE2E>[0];

type LifecycleSuite = {
  desc: string;
  workspace: Workspace;
  run: (page: Page) => Promise<void>;
  setup?: (t: typeof test) => void;
};

type OnlySuiteExports<T> = T & { [K in Exclude<keyof T, keyof LifecycleSuite>]: 'A suite can export only desc, workspace, run and setup' };

export function runSuites<const S extends LifecycleSuite[]>(title: string, suites: { [I in keyof S]: OnlySuiteExports<S[I]> }) {
  test.describe(title, () => {
    for (const { desc, workspace, run, setup } of suites as LifecycleSuite[]) {
      test.describe(desc, () => {
        let collections: string[] = [];
        setup?.(test);

        test.beforeEach(async ({ workbench }) => {
          collections = await performE2E(workspace, workbench);
        });

        test.afterEach(async ({ workbench }) => {
          await takeScreenshot(workbench, test);
          await runCommand(workbench, 'View: Close All Editors');
          const sidebar = await openBrunoSidebar(workbench);
          for (const collection of collections) {
            await removeCollection(workbench, sidebar, collection);
          }
        });

        test('run', async ({ workbench }) => {
          await run(workbench);
        });
      });
    }
  });
}
