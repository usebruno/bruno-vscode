import { describe, test, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

type Listener = (uri: { fsPath: string }) => void;

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

import { CollectionWatcher, setMessageSender } from './collection-watcher';

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

afterEach(() => {
  fs.rmSync(collectionPath, { recursive: true, force: true });
  createListeners.clear();
});

describe('CollectionWatcher create events for request files', () => {
  test('send the full request, so a replaced file updates a request already open', async () => {
    collectionPath = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-watcher-'));
    fs.writeFileSync(path.join(collectionPath, 'bruno.json'), JSON.stringify({ version: '1', name: 'c', type: 'collection' }));
    const requestPath = path.join(collectionPath, 'sign-in.bru');
    fs.writeFileSync(requestPath, request('v2'));

    const sent = vi.fn();
    setMessageSender(sent);
    new CollectionWatcher().setupWatchersOnly(collectionPath, 'collection-1');

    // An atomic save replaces the file, and VS Code reports it as a create event.
    createListeners.get('**/*.bru')!({ fsPath: requestPath });

    await vi.waitFor(() => {
      expect(sent).toHaveBeenCalledWith(
        'main:collection-tree-updated',
        'change',
        expect.objectContaining({
          data: expect.objectContaining({
            request: expect.objectContaining({ script: expect.objectContaining({ res: expect.stringContaining('v2') }) })
          })
        })
      );
    });
    // The metadata-only event for the sidebar is still sent first.
    expect(sent.mock.calls[0]).toEqual([
      'main:collection-tree-updated',
      'addFile',
      expect.objectContaining({ partial: true })
    ]);
  });
});
