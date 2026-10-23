import { Page, expect } from "@playwright/test";
import { createCollectionV2, createRequestV2, deleteRequestV2, exportCollectionV2, fillRequestDetails, openBrunoSidebar, saveRequest, saveRequestV2, sendRequest } from "./utils/page/actions";

type KeyValue<T = string | number | boolean> = {
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
  delete?: boolean;
}

type EnvConfig<EnvName extends string = string> = {
  name: EnvName,
  vars: { [k: string]: string }[]
}

type CollectionConfig<EnvName extends string = string> = {
  format: FileFormat,
  name: string,
  vars?: KeyValue[],
  requests: RequestConfig<EnvName>[]
  export?: boolean
} | string /* fixture path */

type Config<EnvName extends string = string> = {
  collections: CollectionConfig<EnvName>[];
  envs?: EnvConfig<EnvName>[]
}


export async function performE2E<const EnvName extends string = never>(config: Config<EnvName>, page: Page) {
  const collections = config.collections;
  const sidebar = await openBrunoSidebar(page);

  for (const [index, collection] of collections.entries()) {
    if (typeof collection === 'string') {
      // import collection
    } else {
      const ctx = await createCollectionV2(page, sidebar, collection.name, index !== 0, collection.format)

      for (const request of collection.requests) {
        const requestWebview = await createRequestV2(page, sidebar, ctx, collection.name, request.type, request.method)
        await fillRequestDetails(requestWebview, ctx, request.url, request.payload, request.params, request.headers)

        if (request.run) {
          await sendRequest(requestWebview, 200)
        }

        await saveRequestV2(page, requestWebview, ctx, request.name, true)
      }

      // Delete only after every request is saved, so deletes don't shift the "Untitled N" titles.
      const requestsToDelete = collection.requests.filter((request) => request.delete);
      for (const request of requestsToDelete) {
        await deleteRequestV2(page, sidebar, ctx, request.name, collection.format)
      }

      if (collection.export) {
        const exported = await exportCollectionV2(page, sidebar, ctx)

        // verify the export reflects the deletes
        const exportedNames = (exported.items ?? []).map((item: { name: string }) => item.name);
        const remainingNames = collection.requests.filter((request) => !request.delete).map((request) => request.name);
        expect(exportedNames.sort()).toEqual(remainingNames.sort());
      }
    }
  }
}