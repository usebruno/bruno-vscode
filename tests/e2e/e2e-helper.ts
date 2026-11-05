import { Page } from "@playwright/test";
import { Context } from "./context";
import {
  createCollectionV2,
  createFolderV2,
  createRequestV2,
  fillRequestDetails,
  openBrunoSidebar,
  openCollectionSettings,
  saveRequestV2,
  sendRequest,
  setCollectionHeaders,
  setCollectionPresets,
  setCollectionVars
} from "./utils/page/actions";

export type KeyValue<T = string | number | boolean> = {
  [k: string]: T,
}

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
type RequestType = 'HTTP' | 'GraphQL' | 'gRPC' | `WebSocket`;
type FileFormat = 'yml' | 'bru';

type RequestConfig<EnvName extends string = string> = {
  name: string;
  url: string;
  params?: KeyValue[],
  headers?: KeyValue[],
  payload?: string;
  type: RequestType,
  method: RequestMethod
  run: boolean,
  env?: NoInfer<EnvName>
}

type EnvConfig<EnvName extends string = string> = {
  name: EnvName,
  vars: { [k: string]: string }[]
}

type CollectionConfig<EnvName extends string = string, FolderName extends string = string> = {
  format: FileFormat,
  name: string,
  vars?: KeyValue,
  headers?: KeyValue,
  presets?: { requestUrl: string },
  folders?: FolderName[],
  requests: RequestConfig<EnvName>[]
} | string /* fixture path */

// Just the settings-panel part of a collection, for the set collection settings actions.
export type CollectionSettingsConfig = Pick<Exclude<CollectionConfig, string>, 'vars' | 'headers' | 'presets'>;

type Config<EnvName extends string = string, FolderName extends string = string> = {
  collections: CollectionConfig<EnvName, FolderName>[];
  envs?: EnvConfig<EnvName>[]
}

export async function createSetup<const EnvName extends string = never, const FolderName extends string = never>(config: Config<EnvName, FolderName>, page: Page) {
  const collections = config.collections;
  const sidebar = await openBrunoSidebar(page);
  const ctx = new Context();

  for (const [index, collection] of collections.entries()) {
    if (typeof collection === 'string') {
      // import collection
    } else {
      await createCollectionV2(page, sidebar, ctx, collection.name, index !== 0, collection.format)

      if (collection.vars || collection.headers || collection.presets) {
        const settings = await openCollectionSettings(page, sidebar, collection.name);

        if (collection.vars) {
          await setCollectionVars(page, settings, collection.vars);
        }

        if (collection.headers) {
          await setCollectionHeaders(page, settings, collection.headers);
        }

        if (collection.presets) {
          await setCollectionPresets(settings, collection.presets);
        }
      }

      for (const folder of collection.folders ?? []) {
        await createFolderV2(page, sidebar, collection.name, folder);
      }

      for (const request of collection.requests) {
        const requestWebview = await createRequestV2(page, sidebar, ctx, collection.name, request.type, request.method)
        await fillRequestDetails(requestWebview, ctx, request.type, request.url, request.payload, request.params, request.headers)

        if (request.run) {
          await sendRequest(requestWebview, 200)
        }

        await saveRequestV2(page, requestWebview, ctx, request.name, true)
      }
    }
  }

  return { sidebar, ctx };
}
