/**
 * Mock for the 'vscode' module used in unit tests.
 * Stubs out VS Code APIs that extension code imports.
 */
import { vi } from 'vitest';

export const Uri = {
  parse: (value: string) => ({
    scheme: 'https',
    authority: '',
    path: value,
    query: '',
    fragment: '',
    fsPath: value,
    with: () => Uri.parse(value),
    toString: () => value
  }),
  file: (path: string) => ({
    scheme: 'file',
    authority: '',
    path,
    query: '',
    fragment: '',
    fsPath: path,
    with: () => Uri.file(path),
    toString: () => `file://${path}`
  })
};

export const env = {
  openExternal: vi.fn().mockResolvedValue(true),
  uriScheme: 'vscode'
};

export const window = {
  registerUriHandler: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  showInformationMessage: vi.fn().mockResolvedValue(undefined),
  showErrorMessage: vi.fn().mockResolvedValue(undefined),
  showWarningMessage: vi.fn().mockResolvedValue(undefined),
  createOutputChannel: vi.fn().mockReturnValue({
    appendLine: vi.fn(),
    append: vi.fn(),
    clear: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn()
  })
};

export const workspace = {
  getConfiguration: vi.fn().mockReturnValue({
    get: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    has: vi.fn().mockReturnValue(false),
    inspect: vi.fn()
  }),
  workspaceFolders: [] as any[]
};

export const commands = {
  registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  executeCommand: vi.fn().mockResolvedValue(undefined)
};

export const ExtensionContext = {};

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3
}

export default {
  Uri,
  env,
  window,
  workspace,
  commands,
  ConfigurationTarget
};
