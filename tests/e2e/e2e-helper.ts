import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { expect, type Page } from "@playwright/test";
import { test } from "./utils/fixtures";
import { Context } from "./context";
import {
  activeEditor, createCollectionV2, createFolder, expandCollection, createRequestInFolder, createRequestV2,
  deleteRequest, exportCollection, fillRequestDetails, closeAllEditors, openBrunoSidebar, removeCollection, saveRequestV2,
  sendRequest, setAuth, setHeaders, setPresets, setVars, takeScreenshot, toRows, type Sidebar,
} from "./utils/page/actions";

export type KeyValue<T = string | number | boolean> = {
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
  vars?: KeyValue,
  headers?: KeyValue,
  presets?: { requestUrl?: string },
  folders?: FolderConfig<EnvName>[],
  requests?: RequestConfig<EnvName>[]
  export?: boolean
  auth?: AuthMode
} | string /* fixture path */

// Just the settings-panel part of a collection, for the set collection settings actions.
export type CollectionSettingsConfig = Pick<Exclude<CollectionConfig, string>, 'vars' | 'headers' | 'presets'>;

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


async function addRequest(page: Page, sidebar: Sidebar, collection: string, { request, folder }: RequestEntry) {
  if (folder) {
    await createRequestInFolder(sidebar, { collection, folder, name: request.name, type: request.type, method: request.method, url: request.url })

    // The tree nests the request one level below its folder.
    const rows = sidebar.locators
    const folderLevel = Number(await rows.collectionItem(folder).getAttribute('aria-level'))
    await expect(rows.collectionItem(request.name)).toHaveAttribute('aria-level', String(folderLevel + 1))
  } else {
    const editor = await createRequestV2(page, sidebar, collection, request.name, request.type, request.method)
    await fillRequestDetails(editor, request.type, request.url, request.payload)
    await saveRequestV2(page, editor)
  }

  if (request.run) {
    await sendRequest(activeEditor(page), 200)
  }

  if (request.auth) {
    await setAuth(page, request.name, request.auth)
  }
}

export type Setup = {
  sidebar: Sidebar,
  // Every collection created, by name
  ctx: Context,
  // Names of the collections it created
  collections: string[],
}

// Builds the workspace. Collections go in `location`, by default a fresh temp folder outside the
// workspace, so the sidebar lists them as opened collections and they can be removed from it afterwards.
export async function createSetup<const EnvName extends string = never>(
  config: Config<EnvName>,
  page: Page,
  location: string = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-e2e-collections-'))
): Promise<Setup> {
  const sidebar = await openBrunoSidebar(page);
  const ctx = new Context();
  const collections: string[] = [];

  for (const collection of config.collections) {
    if (typeof collection === 'string') {
      // import collection
    } else {
      const folders = flattenFolders(collection.folders)
      const requests: RequestEntry[] = [
        ...(collection.requests ?? []).map((request) => ({ request })),
        ...folders.flatMap(({ folder }) => (folder.requests ?? []).map((request) => ({ request, folder: folder.name }))),
      ]

      await createCollectionV2(sidebar, ctx, collection.name, location, collection.format)
      collections.push(collection.name)

      if (collection.vars) {
        await setVars(page, collection.name, toRows(collection.vars, ['name', 'value']));
      }

      if (collection.headers) {
        await setHeaders(page, collection.name, toRows(collection.headers, ['name', 'value']));
      }

      if (collection.presets) {
        await setPresets(page, collection.name, collection.presets);
      }

      await expandCollection(sidebar, collection.name)

      for (const { folder, parent } of folders) {
        await createFolder(sidebar, parent ?? collection.name, folder.name, !parent)
      }

      for (const entry of requests) {
        await addRequest(page, sidebar, collection.name, entry)
      }

      for (const { folder } of folders) {
        if (folder.auth) {
          await setAuth(page, folder.name, folder.auth)
        }
      }

      if (collection.auth) {
        await setAuth(page, collection.name, collection.auth)
      }

      // Requests marked for deletion go once everything is created, so the export below shows what remains.
      const toDelete = requests.filter(({ request }) => request.delete)
      for (const { request } of toDelete) {
        await deleteRequest(sidebar, collection.name, request.name)
      }

      if (collection.export) {
        const exported = await exportCollection(page, sidebar, ctx, collection.name)

        // verify the export reflects the deletes
        for (const request of collection.requests ?? []) {
          expect(`${request.name}.${collection.format}` in exported).toBe(!request.delete);
        }
      }
    }
  }

  return { sidebar, ctx, collections }
}

export type Workspace = Parameters<typeof createSetup>[0];

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
          ({ collections } = await createSetup(workspace, workbench));
        });

        test.afterEach(async ({ workbench }) => {
          await takeScreenshot(workbench, test);
          await closeAllEditors(workbench);
          const sidebar = await openBrunoSidebar(workbench);
          for (const collection of collections) {
            await removeCollection(sidebar, collection);
          }
        });

        test('run', async ({ workbench }) => {
          await run(workbench);
        });
      });
    }
  });
}
