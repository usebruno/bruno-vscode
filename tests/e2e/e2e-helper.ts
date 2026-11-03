import { Page } from "@playwright/test";
import { Context } from "./context";
import {
  addCollectionSettings,
  createCollectionV2,
  createFolderV2,
  createRequestV2,
  fillRequestDetails,
  openBrunoSidebar,
  saveRequestV2,
  sendRequest
} from "./utils/page/actions";

/** A var/header/param value; `{ current, new }` is added as `current`, then edited to `new`. */
export type SettingValue = string | number | boolean | { current: string, new: string };

export type KeyValue = {
  [k: string]: SettingValue,
}

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
type RequestType = 'HTTP' | 'GraphQL' | 'gRPC' | `WebSocket`;
type FileFormat = 'yml' | 'bru';

type RequestConfig<EnvName extends string = string> = {
  name: string;
  url: string;
  params?: KeyValue[],
  headers?: KeyValue[],
  // GraphQL query.
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

// Just the settings-panel part of a collection, for the add/edit collection settings actions.
export type CollectionSettingsConfig = Pick<Exclude<CollectionConfig, string>, 'vars' | 'headers' | 'presets'>;

type Config<EnvName extends string = string, FolderName extends string = string> = {
  collections: CollectionConfig<EnvName, FolderName>[];
  envs?: EnvConfig<EnvName>[]
}

export async function performE2E<const EnvName extends string = never, const FolderName extends string = never>(config: Config<EnvName, FolderName>, page: Page) {
  const collections = config.collections;
  const sidebar = await openBrunoSidebar(page);
  // One entry per collection, in config order; undefined for fixture paths until import is supported.
  const contexts: (Context | undefined)[] = [];

  for (const [index, collection] of collections.entries()) {
    if (typeof collection === 'string') {
      // import collection
      contexts.push(undefined);
    } else {
      const ctx = await createCollectionV2(page, sidebar, collection.name, index !== 0, collection.format)

      const hasSettings = Boolean(collection.vars || collection.headers || collection.presets);
      if (hasSettings) {
        await addCollectionSettings(page, sidebar, ctx, collection, collection.format);
      }

      for (const folder of collection.folders ?? []) {
        await createFolderV2(page, sidebar, ctx, folder);
      }

      for (const request of collection.requests) {
        const requestWebview = await createRequestV2(page, sidebar, ctx, collection.name, request.type, request.method)
        await fillRequestDetails(requestWebview, ctx, request.url, request.payload, request.params, request.headers, request.type)

        if (request.run) {
          await sendRequest(requestWebview, 200)
        }

        await saveRequestV2(page, requestWebview, ctx, request.name, true)
      }

      contexts.push(ctx);
    }
  }

  return { sidebar, contexts };
}