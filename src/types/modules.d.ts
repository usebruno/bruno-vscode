declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}

declare module '*.scss' {
  const content: { [className: string]: string };
  export default content;
}

declare module '*.svg' {
  const content: string;
  export default content;
}

declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}

declare module 'platform' {
  interface OS {
    family: string;
    version?: string;
  }
  const platform: {
    os: OS;
    name?: string;
    version?: string;
  };
  export default platform;
}

declare module 'mousetrap' {
  interface MousetrapStatic {
    bind(keys: string | string[], callback: (e: Event, combo: string) => void, action?: string): void;
    unbind(keys: string | string[], action?: string): void;
    trigger(keys: string, action?: string): void;
    reset(): void;
  }
  const Mousetrap: MousetrapStatic;
  export default Mousetrap;
}

declare module 'file-dialog' {
  interface FileDialogOptions {
    accept?: string | string[];
    multiple?: boolean;
  }
  function fileDialog(options?: FileDialogOptions): Promise<FileList>;
  export default fileDialog;
}

declare module 'file-saver' {
  export function saveAs(data: Blob | File | string, filename?: string, options?: object): void;
}

declare module 'codemirror' {
  const CodeMirror: unknown;
  export default CodeMirror;
}

declare module 'codemirror-graphql/*' {
  const content: unknown;
  export default content;
}

declare module 'react-copy-to-clipboard' {
  import { Component, ReactNode } from 'react';

  interface CopyToClipboardProps {
    text: string;
    onCopy?: (text: string, result: boolean) => void;
    options?: {
      debug?: boolean;
      message?: string;
      format?: string;
    };
    children: ReactNode;
  }

  export class CopyToClipboard extends Component<CopyToClipboardProps> {}
}

declare module 'react-inspector' {
  import { FC } from 'react';

  interface ObjectInspectorProps {
    data: unknown;
    name?: string;
    expandLevel?: number;
    expandPaths?: string | string[];
    showNonenumerable?: boolean;
    sortObjectKeys?: boolean | ((a: string, b: string) => number);
    theme?: object | string;
    table?: boolean;
  }

  export const ObjectInspector: FC<ObjectInspectorProps>;
  export const TableInspector: FC<{ data: unknown; columns?: string[] }>;
  export const Inspector: FC<ObjectInspectorProps>;
}

declare module 'xml-formatter' {
  interface XMLFormatterOptions {
    indentation?: string;
    collapseContent?: boolean;
    lineSeparator?: string;
    whiteSpaceAtEndOfSelfclosingTag?: boolean;
  }
  function format(xml: string, options?: XMLFormatterOptions): string;
  export default format;
}

declare module 'markdown-it' {
  interface MarkdownIt {
    render(src: string, env?: object): string;
    renderInline(src: string, env?: object): string;
    parse(src: string, env?: object): unknown[];
    use(plugin: unknown, ...options: unknown[]): MarkdownIt;
  }
  interface MarkdownItConstructor {
    new (preset?: string, options?: object): MarkdownIt;
    (preset?: string, options?: object): MarkdownIt;
  }
  const MarkdownIt: MarkdownItConstructor;
  export default MarkdownIt;
}

declare module '@usebruno/common' {
  export function parseQueryParams(url: string): Array<{ name: string; value?: string }>;
  export function extractPromptVariables(str: string): string[];
  export function parsePathParams(url: string): Record<string, string>;
  export function getSubdirectoriesFromRoot(collection: unknown, item: unknown): string[];
  export function getContentType(headers: unknown[]): string;
  export function createContentType(value: string): string;
  export function getHeaderValue(headers: unknown[], name: string): string | undefined;
  export function getTLDfromUrl(url: string): string | undefined;
  export const utils: unknown;
  export const mockDataFunctions: unknown[];
}

declare module '@usebruno/common/utils' {
  export function parseQueryParams(url: string): Array<{ name: string; value?: string }>;
  export function extractPromptVariables(str: string): string[];
  export function parsePathParams(url: string): Record<string, string>;
  export function getSubdirectoriesFromRoot(collection: unknown, item: unknown): string[];
  export function getContentType(headers: unknown[]): string;
  export function createContentType(value: string): string;
  export function getHeaderValue(headers: unknown[], name: string): string | undefined;
  export function getTLDfromUrl(url: string): string | undefined;
  export function humanizeDate(date: unknown): string;
  export function humanizeBytes(bytes: number): string;
  export function humanizeNumberWithCommas(num: number): string;
  export function safeParseJSON(str: string): unknown;
  export function safeStringifyJSON(obj: unknown): string;
}

declare module '@usebruno/schema' {
  export const collectionSchema: { validate: (data: unknown) => Promise<unknown>; validateSync: (data: unknown) => unknown };
  export const environmentSchema: { validate: (data: unknown) => Promise<unknown>; validateSync: (data: unknown) => unknown };
  export const itemSchema: { validate: (data: unknown) => Promise<unknown>; validateSync: (data: unknown) => unknown };
}

declare module '@usebruno/graphql-docs' {
  import { FC } from 'react';
  interface GraphQLDocsProps {
    schema: unknown;
    [key: string]: unknown;
  }
  const GraphQLDocs: FC<GraphQLDocsProps>;
  export default GraphQLDocs;
}

declare module '@usebruno/converters' {
  export function brunoToPostman(collection: unknown): unknown;
  export function postmanToBruno(collection: unknown): unknown;
  export function openapiToBruno(spec: unknown): unknown;
  export function brunoToOpenapi(collection: unknown): unknown;
  export function insomniaCollectionToBruno(collection: unknown): unknown;
  export function opencollectionToBruno(collection: unknown): unknown;
  export function brunoToOpencollection(collection: unknown): unknown;
  export function postmanEnvironmentToBruno(env: unknown): unknown;
}

declare module 'httpsnippet' {
  interface HTTPSnippet {
    convert(target: string, client?: string, options?: object): string | false;
  }
  interface HTTPSnippetConstructor {
    new (definition: object): HTTPSnippet;
  }
  const HTTPSnippet: HTTPSnippetConstructor;
  export { HTTPSnippet };
  export default HTTPSnippet;
}

declare module 'hexy' {
  interface HexyOptions {
    width?: number;
    numbering?: string;
    format?: string;
    caps?: string;
    annotate?: string;
    prefix?: string;
    indent?: number;
  }
  function hexy(buffer: Buffer | string, options?: HexyOptions): string;
  export { hexy };
  export default hexy;
}

declare module 'swagger-ui-react' {
  import { FC } from 'react';
  interface SwaggerUIProps {
    url?: string;
    spec?: object;
    [key: string]: unknown;
  }
  const SwaggerUI: FC<SwaggerUIProps>;
  export default SwaggerUI;
}

declare module '@prantlf/jsonlint' {
  const jsonlint: {
    parse: (text: string) => unknown;
  };
  export default jsonlint;
}

declare module 'jshint' {
  const JSHINT: {
    (source: string, options?: object): boolean;
    errors: Array<{ reason: string; line: number; character: number }>;
  };
  export { JSHINT };
}

declare module 'know-your-http-well' {
  export const headers: Array<{ header: string; description: string }>;
  export const statusCodes: Array<{ code: string; phrase: string }>;
}

declare module 'react-json-view' {
  import { FC } from 'react';
  interface ReactJsonProps {
    src: unknown;
    theme?: string | object;
    collapsed?: boolean | number;
    [key: string]: unknown;
  }
  const ReactJson: FC<ReactJsonProps>;
  export default ReactJson;
}

declare module '@xterm/xterm' {
  export class Terminal {
    constructor(options?: object);
    open(element: HTMLElement): void;
    write(data: string): void;
    dispose(): void;
    onData(callback: (data: string) => void): void;
  }
}

declare module '@xterm/addon-fit' {
  export class FitAddon {
    fit(): void;
    proposeDimensions(): { cols: number; rows: number } | undefined;
  }
}

declare module 'markdown-it-replace-link' {
  const plugin: unknown;
  export default plugin;
}

declare module 'fast-fuzzy' {
  export function search<T>(query: string, items: T[], options?: object): T[];
}

declare module 'escape-html' {
  function escapeHtml(str: string): string;
  export default escapeHtml;
}

declare module 'mime-types' {
  export function lookup(path: string): string | false;
  export function contentType(type: string): string | false;
  export function extension(type: string): string | false;
  export function charset(type: string): string | false;
  export const types: Record<string, string>;
  export const extensions: Record<string, string[]>;
}

declare module 'semver' {
  export function valid(version: string | null): string | null;
  export function satisfies(version: string, range: string): boolean;
  export function gt(v1: string, v2: string): boolean;
  export function lt(v1: string, v2: string): boolean;
  export function gte(v1: string, v2: string): boolean;
  export function lte(v1: string, v2: string): boolean;
  export function eq(v1: string, v2: string): boolean;
  export function neq(v1: string, v2: string): boolean;
  export function compare(v1: string, v2: string): -1 | 0 | 1;
  export function coerce(version: string | null): { version: string } | null;
  export function parse(version: string): { major: number; minor: number; patch: number } | null;
}

declare module 'linkify-it' {
  interface Match {
    schema: string;
    index: number;
    lastIndex: number;
    raw: string;
    text: string;
    url: string;
  }
  interface LinkifyIt {
    test(text: string): boolean;
    match(text: string): Match[] | null;
    tlds(list: string | string[], keepOld?: boolean): LinkifyIt;
    add(schema: string, definition: string | object | null): LinkifyIt;
  }
  interface LinkifyItConstructor {
    new (schemas?: object, options?: object): LinkifyIt;
    (schemas?: object, options?: object): LinkifyIt;
  }
  const LinkifyIt: LinkifyItConstructor;
  export default LinkifyIt;
}

declare module 'jsesc' {
  function jsesc(str: string, options?: object): string;
  export default jsesc;
}

declare module 'prettier/standalone' {
  export function format(source: string, options?: object): string;
}

declare module 'prettier/parser-graphql' {
  const parser: unknown;
  export default parser;
}

declare module 'graphiql' {
  import { FC } from 'react';
  interface GraphiQLProps {
    fetcher: (params: object) => Promise<unknown>;
    [key: string]: unknown;
  }
  const GraphiQL: FC<GraphiQLProps>;
  export default GraphiQL;
}

declare module 'uuid' {
  export function v4(): string;
}

declare module 'posthog-node' {
  export default class PostHog {
    constructor(apiKey: string, options?: object);
    capture(event: object): void;
    identify(event: object): void;
    shutdown(): void;
  }
}

declare module 'jsonschema' {
  export class Validator {
    validate(instance: unknown, schema: object): { valid: boolean; errors: unknown[] };
  }
}

declare module 'httpsnippet' {
  export class HTTPSnippet {
    constructor(data: object);
    convert(target: string, client?: string, options?: object): string | false;
  }
}

declare module 'jsonpath-plus' {
  export function JSONPath(options: { path: string; json: unknown }): unknown[];
}

declare module 'fast-json-format' {
  export default function format(json: unknown): string;
}

declare module 'query-string' {
  export function parse(query: string): Record<string, string | string[] | null>;
  export function stringify(obj: object): string;
}

declare module 'cookie' {
  export function parse(str: string): Record<string, string>;
  export function serialize(name: string, value: string, options?: object): string;
}

declare module 'shell-quote' {
  export function parse(cmd: string): string[];
  export function quote(args: string[]): string;
}

declare module 'prettier/parser-babel' {
  const parser: unknown;
  export default parser;
}

declare module 'pdfjs-dist/build/pdf' {
  export const GlobalWorkerOptions: { workerSrc: string };
  export function getDocument(src: unknown): { promise: Promise<unknown> };
}

declare module 'fast-json-format' {
  function fastJsonFormat(json: string): string;
  export default fastJsonFormat;
}

declare module 'tough-cookie' {
  export class CookieJar {
    setCookieSync(cookie: string | Cookie, url: string, options?: object): Cookie;
    getCookiesSync(url: string, options?: object): Cookie[];
    getCookieStringSync(url: string, options?: object): string;
    removeAllCookiesSync(): void;
    serializeSync(): object;
    static deserializeSync(serialized: object): CookieJar;
  }
  export class Cookie {
    key: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: Date | string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
    static parse(cookieString: string): Cookie | undefined;
    toString(): string;
  }
}
