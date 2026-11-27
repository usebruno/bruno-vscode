import { describe, test, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CollectionWatcher, setMessageSender } from './collection-watcher';
import { registerDocument, unregisterDocument } from '../editors/dirty-state-manager';
import collectionsReducer, {
  collectionAddFileEvent,
  collectionChangeFileEvent
} from 'providers/ReduxStore/slices/collections';

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

const COLLECTION_UID = 'collection-1';

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
const pathsOpenInEditor: string[] = [];

const openInBrunoEditor = (filePath: string): void => {
  registerDocument({ uri: { fsPath: filePath } } as never);
  pathsOpenInEditor.push(filePath);
};

const writeBrunoJson = (dir: string, name: string): void => {
  fs.writeFileSync(path.join(dir, 'bruno.json'), JSON.stringify({ version: '1', name, type: 'collection' }));
};

// A collection with one request whose post-response script logs 'v1'.
const createCollection = ({ openInEditor }: { openInEditor: boolean }): void => {
  collectionPath = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-watcher-'));
  writeBrunoJson(collectionPath, 'c');
  requestPath = path.join(collectionPath, 'sign-in.bru');
  fs.writeFileSync(requestPath, request('v1'));
  if (openInEditor) {
    openInBrunoEditor(requestPath);
  }
};

// Replaces the request file the way an atomic save does (new content renamed over the old file),
// then fires the create event VS Code reports for it.
const replaceRequestFile = async (marker: string): Promise<void> => {
  const tempPath = `${requestPath}.tmp`;
  fs.writeFileSync(tempPath, request(marker));
  fs.renameSync(tempPath, requestPath);
  await createListeners.get('**/*.bru')!({ fsPath: requestPath });
};

type CollectionsState = ReturnType<typeof collectionsReducer>;

// Applies the tree updates sent by the extension to the collections reducer, as useIpcEvents does.
const applyTreeUpdates = (calls: unknown[][]): CollectionsState => {
  const initialState = {
    collections: [{ uid: COLLECTION_UID, name: 'c', pathname: collectionPath, items: [], environments: [], brunoConfig: {} }],
    collectionSortOrder: 'default',
    activeConnections: {}
  } as unknown as CollectionsState;

  return calls
    .filter(([channel]) => channel === 'main:collection-tree-updated')
    .reduce<CollectionsState>((state, [, type, payload]) => {
      if (type === 'addFile') {
        return collectionsReducer(state, collectionAddFileEvent(payload as never));
      }
      if (type === 'change') {
        return collectionsReducer(state, collectionChangeFileEvent(payload as never));
      }
      return state;
    }, initialState);
};

const postResponseScript = (calls: unknown[][]): string | undefined => {
  const item = applyTreeUpdates(calls).collections[0].items.find((i) => i.type === 'http-request');
  return item?.request?.script?.res;
};

const metadataOnlyAdd = ['main:collection-tree-updated', 'addFile', expect.objectContaining({ partial: true })];

afterEach(() => {
  pathsOpenInEditor.splice(0).forEach(unregisterDocument);
  fs.rmSync(collectionPath, { recursive: true, force: true });
  createListeners.clear();
});

describe('CollectionWatcher create events for request files', () => {
  test('update a request open in an editor when its file is replaced', async () => {
    createCollection({ openInEditor: true });
    const sent = vi.fn();
    setMessageSender(sent);
    const watcher = new CollectionWatcher();
    // An editor loads its request in full before any change on disk.
    await watcher.loadSingleRequest(requestPath, COLLECTION_UID, collectionPath, sent);
    watcher.setupWatchersOnly(collectionPath, COLLECTION_UID);
    expect(postResponseScript(sent.mock.calls)).toContain("console.log('v1')");

    await replaceRequestFile('v2');

    expect(postResponseScript(sent.mock.calls)).toContain("console.log('v2')");
  });

  test('send only the metadata when the replaced file is not open', async () => {
    createCollection({ openInEditor: false });
    const sent = vi.fn();
    setMessageSender(sent);
    new CollectionWatcher().setupWatchersOnly(collectionPath, COLLECTION_UID);

    await replaceRequestFile('v2');

    expect(sent.mock.calls).toEqual([metadataOnlyAdd]);
  });

  test('keep the nested collection marker on a create event for a nested collection root file open in an editor', async () => {
    createCollection({ openInEditor: false });
    const nestedPath = path.join(collectionPath, 'nested');
    fs.mkdirSync(nestedPath);
    writeBrunoJson(nestedPath, 'nested');
    const nestedRootPath = path.join(nestedPath, 'collection.bru');
    fs.writeFileSync(nestedRootPath, 'meta {\n  name: nested\n}\n');
    openInBrunoEditor(nestedRootPath);
    const sent = vi.fn();
    setMessageSender(sent);
    new CollectionWatcher().setupWatchersOnly(collectionPath, COLLECTION_UID);

    await createListeners.get('**/*.bru')!({ fsPath: nestedRootPath });

    expect(sent.mock.calls).toEqual([
      ['main:collection-tree-updated', 'addFile', expect.objectContaining({
        error: { message: 'This is a nested collection, not a request.' }
      })]
    ]);
  });
});
