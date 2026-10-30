import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { openCollection, setMessageSender } from './collections';
import { setExtensionContext as setPreferencesContext } from '../store/preferences';
import { setExtensionContext as setLastOpenedContext } from '../store/last-opened-collections';
import { setExtensionContext as setDefaultWorkspaceContext } from '../store/default-workspace';

let root: string;
let collectionPath: string;
let workspaceYmlPath: string;
let globalState: Map<string, unknown>;
const sender = vi.fn();

const watcher = {
  hasWatcher: () => false,
  addWatcher: vi.fn(),
  loadSingleRequest: vi.fn(),
  setupWatchersOnly: vi.fn()
};

const lastOpened = () => globalState.get('lastOpenedCollections') ?? [];
const workspaceCollections = () => (yaml.load(fs.readFileSync(workspaceYmlPath, 'utf8')) as any).collections ?? [];
const openedMessage = () => sender.mock.calls.find(([channel]) => channel === 'main:collection-opened');

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-open-collection-'));

  collectionPath = path.join(root, 'One');
  fs.mkdirSync(collectionPath);
  fs.writeFileSync(path.join(collectionPath, 'bruno.json'), JSON.stringify({ version: '1', name: 'One', type: 'collection' }));

  const storagePath = path.join(root, 'storage');
  workspaceYmlPath = path.join(storagePath, 'default-workspace', 'workspace.yml');
  fs.mkdirSync(path.dirname(workspaceYmlPath), { recursive: true });

  const context = {
    globalState: {
      get: (key: string, defaultValue?: unknown) => (globalState.has(key) ? globalState.get(key) : defaultValue),
      update: async (key: string, value: unknown) => {
        globalState.set(key, value);
      }
    },
    globalStorageUri: { fsPath: storagePath }
  } as any;
  setPreferencesContext(context);
  setLastOpenedContext(context);
  setDefaultWorkspaceContext(context);
  setMessageSender(sender);
});

beforeEach(() => {
  globalState = new Map();
  fs.writeFileSync(workspaceYmlPath, 'info:\n  name: My Workspace\n  type: workspace\ncollections: []\n');
  sender.mockClear();
  watcher.addWatcher.mockClear();
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('openCollection', () => {
  test('persists the collection by default', async () => {
    await openCollection(watcher, collectionPath);

    expect(lastOpened()).toEqual([collectionPath]);
    expect(workspaceCollections()).toHaveLength(1);
    expect(openedMessage()?.slice(4)).toEqual([true, false]);
    expect(watcher.addWatcher).toHaveBeenCalled();
  });

  test('opens a collection for the session only when persist is false', async () => {
    await openCollection(watcher, collectionPath, { persist: false });

    expect(lastOpened()).toEqual([]);
    expect(workspaceCollections()).toEqual([]);
    expect(openedMessage()?.slice(4)).toEqual([false, true]);
    expect(watcher.addWatcher).toHaveBeenCalled();
  });
});
