import { Frame, Page, expect } from "@playwright/test";
import * as path from "path";
import { test } from "./utils/fixtures";
import { Context } from "./context";
import { buildCommonLocators } from "./utils/page/locators";
import { closeEditorTabIfOpen, createCollectionV2, createFolder, createRequestV2, deleteRequestV2, dragItemIntoFolder, exportCollectionV2, expandFolder, fillRequestDetails, openBrunoSidebar, removeCollection, runCommand, sidebar, collectionName, saveRequestV2, sendRequest, setAuth, takeScreenshot, useCollection } from "./utils/page/actions";

type KeyValue<T = string | number | boolean> = {
  [k: string]: T,
}

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
type RequestType = 'HTTP' | 'GraphQL' | 'gRPC' | `WebSocket`;
type FileFormat = 'yml' | 'bru';

export type TextCheck = {
  contains?: (string | RegExp)[],
  notContains?: (string | RegExp)[],
}

export type RequestPaneCheck = TextCheck & {
  rows?: { name: string, value: string, description?: string }[],
}

type RequestConfig<EnvName extends string = string> = {
  name: string;
  url: string;
  params?: KeyValue[],
  headers?: KeyValue[],
  payload?: string;
  type?: RequestType,
  method?: RequestMethod
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
  format?: FileFormat,
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


export type LifecycleCtx = { page: Page, sidebar: Frame, collection: string, collectionPath: string, folders: string[], requests: string[] }

type FolderEntry = { folder: FolderConfig, parent?: string }
type RequestEntry = { request: RequestConfig, folder?: string }

// Every folder with its parent folder's name, parents before their children.
function flattenFolders(folders: FolderConfig[] = [], parent?: string): FolderEntry[] {
  return folders.flatMap((folder) => [{ folder, parent }, ...flattenFolders(folder.folders, folder.name)])
}

// Requests are created at the collection root, then dragged into their folder.
async function addRequest(page: Page, sidebar: Frame, ctx: Context, collection: string, { request, folder }: RequestEntry) {
  const requestWebview = await createRequestV2(page, sidebar, ctx, collection, request.type ?? 'HTTP', request.method ?? 'GET')
  await fillRequestDetails(requestWebview, ctx, request.url, request.payload, request.params, request.headers)

  if (request.run) {
    await sendRequest(requestWebview, 200)
  }

  await saveRequestV2(page, requestWebview, ctx, request.name, true)

  if (folder) {
    await closeEditorTabIfOpen(page, request.name)
    await dragItemIntoFolder(sidebar, request.name, folder)
    await expandFolder(sidebar, folder)

    const rows = buildCommonLocators(sidebar).sidebar
    const folderDepth = await rows.collectionItem(folder).locator('.indent-block').count()
    await expect(rows.collectionItem(request.name).locator('.indent-block')).toHaveCount(folderDepth + 1)
  }

  if (request.auth) {
    await setAuth(request.name, request.auth)
  }
}

export async function performE2E<const EnvName extends string = never>(config: Config<EnvName>, page: Page) {
  const sidebar = await openBrunoSidebar(page);

  for (const [index, collection] of config.collections.entries()) {
    if (typeof collection === 'string') {
      // import collection
      continue
    }

    const folders = flattenFolders(collection.folders)
    const requests: RequestEntry[] = [
      ...(collection.requests ?? []).map((request) => ({ request })),
      ...folders.flatMap(({ folder }) => (folder.requests ?? []).map((request) => ({ request, folder: folder.name }))),
    ]

    const ctx = await createCollectionV2(page, sidebar, collection.name, index !== 0, collection.format)
    if (index === 0) {
      useCollection({
        page, sidebar,
        collection: collection.name,
        collectionPath: path.join(ctx.collectionLocation, collection.name),
        folders: folders.map(({ folder }) => folder.name),
        requests: requests.map(({ request }) => request.name),
      })
    }

    for (const { folder, parent } of folders) {
      await createFolder(sidebar, parent ?? collection.name, folder.name, !parent)
    }

    for (const entry of requests) {
      await addRequest(page, sidebar, ctx, collection.name, entry)
    }

    for (const { folder } of folders) {
      if (folder.auth) {
        await setAuth(folder.name, folder.auth)
      }
    }

    if (collection.auth) {
      await setAuth(collection.name, collection.auth)
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

export type Workspace = Parameters<typeof performE2E>[0];

type LifecycleSuite = {
  desc: string;
  workspace: Workspace;
  run: () => Promise<void>;
  setup?: (t: typeof test) => void;
};

type OnlySuiteExports<T> = T & { [K in Exclude<keyof T, keyof LifecycleSuite>]: 'A suite can export only desc, workspace, run and setup' };

export function runSuites<const S extends LifecycleSuite[]>(title: string, suites: { [I in keyof S]: OnlySuiteExports<S[I]> }) {
  test.describe(title, () => {
    for (const { desc, workspace, run, setup } of suites as LifecycleSuite[]) {
      test.describe(desc, () => {
        setup?.(test);

        test.beforeEach(async ({ sharedPage }) => {
          await performE2E(workspace, sharedPage);
        });

        test.afterEach(async ({ sharedPage }) => {
          await takeScreenshot(sharedPage, test);
          await runCommand(sharedPage, 'View: Close All Editors');
          await removeCollection(sharedPage, sidebar, collectionName);
        });

        test('run', async () => {
          await run();
        });
      });
    }
  });
}
