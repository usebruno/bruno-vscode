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

export class Position {
  constructor(public readonly line: number, public readonly character: number) {}
}

export class Range {
  constructor(public readonly start: Position, public readonly end: Position) {}
}

export const TextEdit = {
  delete: (range: Range) => ({ range, newText: '' }),
  replace: (range: Range, newText: string) => ({ range, newText })
};

export class WorkspaceEdit {
  public readonly edits: { uri: unknown; range: Range; newText: string }[] = [];

  delete(uri: unknown, range: Range): void {
    this.edits.push({ uri, range, newText: '' });
  }

  insert(uri: unknown, position: Position, newText: string): void {
    this.edits.push({ uri, range: new Range(position, position), newText });
  }

  replace(uri: unknown, range: Range, newText: string): void {
    this.edits.push({ uri, range, newText });
  }
}

export const workspace = {
  getConfiguration: vi.fn().mockReturnValue({
    get: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    has: vi.fn().mockReturnValue(false),
    inspect: vi.fn()
  }),
  workspaceFolders: [] as any[],
  applyEdit: vi.fn().mockResolvedValue(true),
  openTextDocument: vi.fn(),
  onDidChangeTextDocument: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  onDidCloseTextDocument: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  onWillSaveTextDocument: vi.fn().mockReturnValue({ dispose: vi.fn() })
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
  ConfigurationTarget,
  Position,
  Range,
  TextEdit,
  WorkspaceEdit
};
