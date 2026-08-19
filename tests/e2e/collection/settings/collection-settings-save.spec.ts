import * as fs from 'fs';
import * as path from 'path';
import type { Frame, Page } from '@playwright/test';
import { test, expect } from '../../utils/fixtures';
import {
  openBrunoSidebar,
  createCollection,
  openCollectionSettings,
  openRequestPaneTab,
  addCollectionHeader,
  findCollectionDir
} from '../../utils/page/actions';

const HEADER_NAME = 'x-e2e';
const HEADER_VALUE = 'e2e-value';
const PRESET_URL = 'http://127.0.0.1:8081/preset';

async function recordIpcCalls(frame: Frame): Promise<void> {
  await frame.evaluate(() => {
    const w = window as any;
    w.__ipcCalls = [];
    if (w.__ipcCallsPatched) return;
    w.__ipcCallsPatched = true;
    const ipc = w.ipcRenderer;
    const originalInvoke = ipc.invoke.bind(ipc);
    ipc.invoke = (channel: string, ...args: any[]) => {
      w.__ipcCalls.push(channel);
      return originalInvoke(channel, ...args);
    };
  });
}

async function countIpcCalls(frame: Frame, channel: string): Promise<number> {
  return frame.evaluate(
    (ch) => ((window as any).__ipcCalls || []).filter((c: string) => c === ch).length,
    channel
  );
}

async function setPresetBaseUrl(settings: Frame, url: string): Promise<void> {
  await openRequestPaneTab(settings, 'Presets');
  const input = settings.locator('#request-url');
  await expect(input).toBeVisible();
  await input.fill(url);
}

async function clickSave(settings: Frame): Promise<void> {
  await settings.getByRole('button', { name: 'Save', exact: true }).click();
}

async function stageSettingsEdits(
  page: Page,
  tmpDir: string,
  collectionName: string,
  format: 'yml' | 'bru'
): Promise<Frame> {
  const sidebar = await openBrunoSidebar(page);
  await createCollection(page, sidebar, collectionName, tmpDir, format);

  const settings = await openCollectionSettings(page, sidebar, collectionName);
  await addCollectionHeader(page, settings, HEADER_NAME, HEADER_VALUE);
  await setPresetBaseUrl(settings, PRESET_URL);

  return settings;
}

/**
 * Saving collection settings edits two things at once: the collection *root*
 * (headers/auth/vars/scripts) and the *bruno config* (presets/proxy/protobuf).
 *
 * For `.bru` collections those live in separate files, so they're saved with two
 * IPC calls. For `.yml` collections both live in a single `opencollection.yml`,
 * so they must be saved with a single IPC call.
 */
test.describe('Collection settings save', () => {
  test('yml: root and config changes both persist to opencollection.yml via a single write', async ({ page, tmpDir }) => {
    const settings = await stageSettingsEdits(page, tmpDir, 'Yml Settings', 'yml');

    await recordIpcCalls(settings);
    await clickSave(settings);

    const configFile = path.join(findCollectionDir(tmpDir, 'opencollection.yml'), 'opencollection.yml');
    const read = () => fs.readFileSync(configFile, 'utf8');

    await test.step('both halves of the draft land in opencollection.yml', async () => {
      await expect.poll(read).toContain(`url: ${PRESET_URL}`);
      expect(read()).toContain(`name: ${HEADER_NAME}`);
      expect(read()).toContain(`value: ${HEADER_VALUE}`);
    });

    await test.step('the save is a single write, so nothing can land late and clobber it', async () => {
      expect(await countIpcCalls(settings, 'renderer:save-collection-root')).toBe(1);
      expect(await countIpcCalls(settings, 'renderer:update-bruno-config')).toBe(0);
    });

    await test.step('both edits read back into the settings UI', async () => {
      await openRequestPaneTab(settings, 'Presets');
      await expect(settings.locator('#request-url')).toHaveValue(PRESET_URL);

      await openRequestPaneTab(settings, 'Headers');
      const headersTable = settings.getByTestId('editable-table');
      await expect(headersTable).toContainText(HEADER_NAME);
      await expect(headersTable).toContainText(HEADER_VALUE);
    });
  });

  test('bru: root goes to collection.bru and config goes to bruno.json', async ({ page, tmpDir }) => {
    const settings = await stageSettingsEdits(page, tmpDir, 'Bru Settings', 'bru');

    await recordIpcCalls(settings);
    await clickSave(settings);

    const collectionDir = findCollectionDir(tmpDir, 'bruno.json');
    const brunoJson = path.join(collectionDir, 'bruno.json');
    const collectionBru = path.join(collectionDir, 'collection.bru');

    await expect.poll(() => fs.readFileSync(brunoJson, 'utf8')).toContain(PRESET_URL);
    await expect.poll(() => fs.readFileSync(collectionBru, 'utf8'))
      .toContain(`${HEADER_NAME}: ${HEADER_VALUE}`);

    expect(await countIpcCalls(settings, 'renderer:save-collection-root')).toBe(1);
    expect(await countIpcCalls(settings, 'renderer:update-bruno-config')).toBe(1);
  });
});
