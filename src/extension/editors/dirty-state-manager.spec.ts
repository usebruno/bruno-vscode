import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { handleInvoke } from '../ipc/handlers';
import { DIRTY_MARKER } from '../utils/dirty-marker';
import {
  registerDirtyStateHandlers,
  registerDocument,
  registerSaveHandler,
  unregisterDocument
} from './dirty-state-manager';

const request = `meta {
  name: login
  type: http
  seq: 1
}
`;

const registeredPaths: string[] = [];

const fakeDocument = (filePath: string, text: string) => ({
  uri: vscode.Uri.file(filePath),
  getText: () => text,
  positionAt: (offset: number) => new vscode.Position(0, offset),
  lineCount: 1,
  lineAt: () => ({ range: { end: new vscode.Position(0, text.length) } }),
  save: vi.fn().mockResolvedValue(true)
}) as unknown as vscode.TextDocument;

const register = (filePath: string, text: string) => {
  const document = fakeDocument(filePath, text);
  registerDocument(document);
  registeredPaths.push(filePath);
  return document;
};

const willSaveListener = () => {
  const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
  registerSaveHandler(context);
  const [listener] = vi.mocked(vscode.workspace.onWillSaveTextDocument).mock.calls.at(-1)!;
  return listener as (event: vscode.TextDocumentWillSaveEvent) => void;
};

const willSave = (document: vscode.TextDocument) => {
  const waitUntil = vi.fn();
  willSaveListener()({ document, waitUntil } as unknown as vscode.TextDocumentWillSaveEvent);
  return waitUntil;
};

const setDirtyState = (filePath: string, isDirty: boolean) => {
  registerDirtyStateHandlers();
  return handleInvoke('renderer:set-dirty-state', [
    { filePath, itemUid: 'item', collectionUid: 'collection', itemType: 'request', isDirty }
  ]);
};

const markerRange = () =>
  new vscode.Range(new vscode.Position(0, request.length), new vscode.Position(0, request.length + 1));

const lastAppliedEdits = () => {
  const [edit] = vi.mocked(vscode.workspace.applyEdit).mock.calls.at(-1)!;
  return (edit as any).edits;
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  registeredPaths.forEach(unregisterDocument);
  registeredPaths.length = 0;
});

describe('the dirty marker never reaches disk', () => {
  test('a save deletes the marker from the document', async () => {
    const waitUntil = willSave(fakeDocument('/c/login.bru', `${request}${DIRTY_MARKER}`));

    expect(waitUntil).toHaveBeenCalledOnce();
    expect(await waitUntil.mock.calls[0][0]).toEqual([{ range: markerRange(), newText: '' }]);
  });

  test('a save of a marker-free document is left alone', () => {
    expect(willSave(fakeDocument('/c/login.bru', request))).not.toHaveBeenCalled();
  });

  test('a zero width space inside the request is not touched', () => {
    expect(willSave(fakeDocument('/c/login.bru', `docs {\n  a${DIRTY_MARKER}b\n}\n`))).not.toHaveBeenCalled();
  });

  test('files that are not collection files are ignored', () => {
    expect(willSave(fakeDocument('/c/notes.txt', `${request}${DIRTY_MARKER}`))).not.toHaveBeenCalled();
  });

  test('the extension match ignores case', () => {
    expect(willSave(fakeDocument('/c/LOGIN.BRU', `${request}${DIRTY_MARKER}`))).toHaveBeenCalledOnce();
  });
});

describe('marking a document dirty', () => {
  test('adds the marker', async () => {
    const document = register('/c/edited.bru', request);

    await setDirtyState('/c/edited.bru', true);

    expect(lastAppliedEdits()).toEqual([
      { uri: document.uri, range: new vscode.Range(new vscode.Position(0, request.length), new vscode.Position(0, request.length)), newText: DIRTY_MARKER }
    ]);
  });

  test('adds the marker back after a save stripped it', async () => {
    register('/c/edited.bru', request);
    await setDirtyState('/c/edited.bru', true);

    // The save participant removed the marker while the draft is still unsaved.
    const stripped = register('/c/edited.bru', request);
    await setDirtyState('/c/edited.bru', true);

    expect(lastAppliedEdits()).toEqual([
      { uri: stripped.uri, range: new vscode.Range(new vscode.Position(0, request.length), new vscode.Position(0, request.length)), newText: DIRTY_MARKER }
    ]);
  });

  test('does not add a second marker when one is already there', async () => {
    register('/c/edited.bru', `${request}${DIRTY_MARKER}`);

    await setDirtyState('/c/edited.bru', true);

    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  });
});

describe('clearing the dirty state', () => {
  test('removes the marker left behind when a draft is discarded', async () => {
    const document = register('/c/discarded.bru', `${request}${DIRTY_MARKER}`);

    await setDirtyState('/c/discarded.bru', false);

    expect(lastAppliedEdits()).toEqual([{ uri: document.uri, range: markerRange(), newText: '' }]);
    expect(document.save).toHaveBeenCalledOnce();
  });

  test('leaves a document without a marker untouched', async () => {
    const document = register('/c/clean.bru', request);

    await setDirtyState('/c/clean.bru', false);

    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    expect(document.save).not.toHaveBeenCalled();
  });
});
