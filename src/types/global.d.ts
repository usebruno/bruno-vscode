/// <reference path="./modules.d.ts" />

declare global {
  interface Window {
    ipcRenderer: {
      invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
      send: (channel: string, ...args: unknown[]) => void;
      removeListener: (channel: string, callback: (...args: unknown[]) => void) => void;
      removeAllListeners: (channel?: string) => void;
      getFilePath: (file: File) => string;
      openExternal: (url: string) => void;
    };
    __IS_DEV__?: boolean;
    __store__?: {
      getState: () => unknown;
      dispatch: (action: unknown) => void;
    };
    // Libraries assigned to window for CodeMirror usage
    jsonlint: {
      parse: (text: string) => unknown;
    };
    JSHINT: {
      (source: string, options?: object): boolean;
      errors: Array<{ reason: string; line: number; character: number }>;
    };
    // Prompt for variables function used by Redux actions
    promptForVariables?: (prompts: string[]) => Promise<Record<string, string>>;
  }

  interface ImportMeta {
    env: {
      MODE: string;
      DEV: boolean;
      PROD: boolean;
      [key: string]: unknown;
    };
  }
}

export {};
