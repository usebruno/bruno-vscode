import { describe, test, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CollectionWatcher, setMessageSender } from './collection-watcher';
import { registerDocument, unregisterDocument } from '../editors/dirty-state-manager';

type Listener = (uri: { fsPath: string }) => Promise<void>;

const { createListeners } = vi.hoisted(() => ({ createListeners: new Map<string, Listener>() }));

vi.mock('vscode', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    RelativePattern: class {
      constructor(public base: string, public pattern: string) {}
    },
    workspace: {
      ...(original.workspace as object),
      createFileSystemWatcher: (glob: { pattern: string }) => ({
        onDidCreate: (listener: Listener) => createListeners.set(glob.pattern, listener),
        onDidChange: vi.fn(),
        onDidDelete: vi.fn(),
        dispose: vi.fn()
      })
    }
  };
});

const request = (marker: string) => `meta {
  name: sign in
  type: http
  seq: 1
}

post {
  url: https://example.com/login
  body: none
  auth: none
}

script:post-response {
  console.log('${marker}');
}
`;

let collectionPath: string;
let requestPath: string;

// Writes a collection with one request and fires the create event VS Code reports when an atomic
// save replaces that request's file.
const replaceRequestFile = async ({ openInEditor }: { openInEditor: boolean }): Promise<ReturnType<typeof vi.fn>> => {
  collectionPath = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-watcher-'));
  fs.writeFileSync(path.join(collectionPath, 'bruno.json'), JSON.stringify({ version: '1', name: 'c', type: 'collection' }));
  requestPath = path.join(collectionPath, 'sign-in.bru');
  fs.writeFileSync(requestPath, request('v2'));
  if (openInEditor) {
    registerDocument({ uri: { fsPath: requestPath } } as never);
  }

  const sent = vi.fn();
  setMessageSender(sent);
  new CollectionWatcher().setupWatchersOnly(collectionPath, 'collection-1');
  await createListeners.get('**/*.bru')!({ fsPath: requestPath });
  return sent;
};

const metadataOnlyAdd = ['main:collection-tree-updated', 'addFile', expect.objectContaining({ partial: true })];

afterEach(() => {
  unregisterDocument(requestPath);
  fs.rmSync(collectionPath, { recursive: true, force: true });
  createListeners.clear();
});

describe('CollectionWatcher create events for request files', () => {
  test('send the full request when the file is open in an editor', async () => {
    const sent = await replaceRequestFile({ openInEditor: true });

    expect(sent).toHaveBeenCalledWith(
      'main:collection-tree-updated',
      'change',
      expect.objectContaining({
        data: expect.objectContaining({
          request: expect.objectContaining({ script: expect.objectContaining({ res: expect.stringContaining('v2') }) })
        })
      })
    );
    // The metadata-only event for the sidebar is still sent first.
    expect(sent.mock.calls[0]).toEqual(metadataOnlyAdd);
  });

  test('send only the metadata when the file is not open', async () => {
    const sent = await replaceRequestFile({ openInEditor: false });

    expect(sent.mock.calls).toEqual([metadataOnlyAdd]);
  });
});
