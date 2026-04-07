/**
 * Type declarations for @usebruno packages
 */

declare module '@usebruno/requests' {
  export interface CookieJar {
    setCookie(cookie: string, url: string): void;
    setCookieSync(cookie: string, url: string, options?: { ignoreError?: boolean }): void;
    getCookies(url: string): unknown[];
    removeAllCookies(): void;
    serialize(): unknown;
    serializeSync(): unknown;
    toJSON(): unknown;
  }

  export function createCookieJar(): CookieJar;

  export const cookies: {
    CookieJar: new () => CookieJar;
    createCookieJar(): CookieJar;
    cookieJar: CookieJar;
    createCookieString(cookie: unknown): string;
  };
}

declare module '@usebruno/node-machine-id' {
  export function machineIdSync(): string;
  export function machineId(): Promise<string>;
}

declare module '@usebruno/filestore' {
  export interface ParseOptions {
    format?: string;
    filename?: string;
  }

  export function parseRequest(content: string, options?: ParseOptions): Promise<unknown>;
  export function stringifyRequest(request: unknown, options?: ParseOptions): Promise<string>;
  export function parseRequestViaWorker(content: string, options?: ParseOptions): Promise<unknown>;
  export function stringifyRequestViaWorker(request: unknown, options?: ParseOptions): Promise<string>;
  export function parseCollection(content: string, options?: ParseOptions): Promise<unknown>;
  export function stringifyCollection(collectionRoot: unknown, brunoConfig: unknown, options?: ParseOptions): Promise<string>;
  export function parseFolder(content: string, options?: ParseOptions): Promise<unknown>;
  export function stringifyFolder(folder: unknown, options?: ParseOptions): Promise<string>;
  export function parseEnvironment(content: string, options?: ParseOptions): Promise<unknown>;
  export function stringifyEnvironment(environment: unknown, options?: ParseOptions): Promise<string>;
  export function parseDotEnv(content: string): Record<string, string>;
  export function parseBruFileMeta(content: string): unknown;
  export function parseRequestAndRedactBody(content: string): Promise<unknown>;
}

declare module '@usebruno/common' {
  export function interpolate(template: string, variables: Record<string, unknown>): string;
  export function interpolateString(template: string, variables: Record<string, unknown>): string;
}

declare module '@usebruno/js' {
  export interface ScriptResult {
    envVariables?: Record<string, unknown>;
    runtimeVariables?: Record<string, unknown>;
    persistentEnvVariables?: Record<string, unknown>;
    globalEnvironmentVariables?: Record<string, unknown>;
    nextRequestName?: string;
    skipRequest?: boolean;
    error?: string;
  }

  export interface TestResult {
    passed: boolean;
    failed: boolean;
    results: Array<{
      uid: string;
      description: string;
      passed: boolean;
      error?: string;
    }>;
  }

  export interface VarsResult {
    envVariables?: Record<string, unknown>;
    runtimeVariables?: Record<string, unknown>;
    persistentEnvVariables?: Record<string, unknown>;
    globalEnvironmentVariables?: Record<string, unknown>;
    error?: string;
  }

  export interface ScriptRuntimeOptions {
    runtime?: string;
  }

  export class ScriptRuntime {
    constructor(options?: ScriptRuntimeOptions);
    runRequestScript(
      script: string,
      request: unknown,
      envVars: Record<string, unknown>,
      runtimeVariables: Record<string, unknown>,
      collectionPath: string,
      onConsoleLog: (type: string, args: unknown[]) => void,
      processEnvVars: Record<string, string>,
      scriptingConfig: unknown,
      historyLogger?: unknown,
      secretVariables?: unknown,
      runRequestByItemPathname?: (pathname: string) => Promise<unknown>,
      collectionName?: string
    ): Promise<ScriptResult>;

    runResponseScript(
      script: string,
      request: unknown,
      response: unknown,
      envVars: Record<string, unknown>,
      runtimeVariables: Record<string, unknown>,
      collectionPath: string,
      onConsoleLog: (type: string, args: unknown[]) => void,
      processEnvVars: Record<string, string>,
      scriptingConfig: unknown,
      historyLogger?: unknown,
      secretVariables?: unknown,
      runRequestByItemPathname?: (pathname: string) => Promise<unknown>,
      collectionName?: string
    ): Promise<ScriptResult>;
  }

  export class VarsRuntime {
    constructor(options?: ScriptRuntimeOptions);
    runPostResponseVars(
      vars: Array<{ name: string; value: string; enabled?: boolean }>,
      request: unknown,
      response: unknown,
      envVars: Record<string, unknown>,
      runtimeVariables: Record<string, unknown>,
      collectionPath: string,
      processEnvVars: Record<string, string>
    ): VarsResult;
  }

  export class TestRuntime {
    constructor(options?: ScriptRuntimeOptions);
    runTests(
      testsScript: string,
      request: unknown,
      response: unknown,
      envVars: Record<string, unknown>,
      runtimeVariables: Record<string, unknown>,
      collectionPath: string,
      onConsoleLog: (type: string, args: unknown[]) => void,
      processEnvVars: Record<string, string>,
      scriptingConfig: unknown,
      historyLogger?: unknown,
      secretVariables?: unknown,
      runRequestByItemPathname?: (pathname: string) => Promise<unknown>,
      collectionName?: string
    ): Promise<TestResult>;
  }

  export class AssertRuntime {
    constructor(options?: ScriptRuntimeOptions);
    runAssertions(
      assertions: Array<{ name: string; value: string; enabled?: boolean }>,
      request: unknown,
      response: unknown,
      envVars: Record<string, unknown>,
      runtimeVariables: Record<string, unknown>,
      processEnvVars: Record<string, string>,
      historyLogger?: unknown,
      secretVariables?: unknown
    ): Array<{
      uid: string;
      lhsExpr: string;
      rhsExpr: string;
      rhsOperand?: string;
      operator: string;
      error?: string;
      status: 'pass' | 'fail';
    }>;
  }
}

declare module 'is-valid-path' {
  function isValidPath(path: string): boolean;
  export = isValidPath;
}

declare module 'js-yaml' {
  export function load(content: string): unknown;
  export function dump(obj: unknown, options?: unknown): string;
}
