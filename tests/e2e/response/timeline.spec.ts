import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import type { Frame } from '@playwright/test';
import { test, expect } from '../utils/fixtures';
import { openBrunoSidebar, createCollection, openRequest, sendRequest, findCollectionDir } from '../utils/page/actions';

const TEST_SERVER = 'http://127.0.0.1:8081';

const NETWORK_PANEL = '[data-testid="timeline-panel-network"]';

async function openNetworkTab(editor: Frame): Promise<void> {
  await editor.locator('button').filter({ hasText: /^Network/ }).first().click();
}

// The Timeline tab sits inline or in the overflow menu depending on pane width, and is briefly in
// neither while the pane re-measures. Each step is bounded so a stale attempt can't eat the retries.
async function openTimelineTab(editor: Frame): Promise<void> {
  const responseTabs = editor.locator('[data-testid="response-pane-tabs"]');
  const tab = responseTabs.locator('[data-testid="responsive-tab-timeline"]');

  await expect(async () => {
    if (await tab.count() > 0) {
      await tab.click({ timeout: 2_000 });
    } else {
      await responseTabs.locator('.more-tabs').click({ timeout: 2_000 });
      await editor.locator('[role="menuitem"]').filter({ hasText: 'Timeline' }).first().click({ timeout: 2_000 });
    }
    await expect(editor.locator('[data-testid="timeline-container"]')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

// Response actions collapse into a "More actions" dropdown when the pane is too narrow.
async function clearResponse(editor: Frame): Promise<void> {
  const inlineButton = editor.locator('[data-testid="response-clear-btn"]');
  const menuTrigger = editor.locator('[data-testid="response-actions-menu"]');

  await expect(async () => {
    if (await inlineButton.isVisible()) {
      await inlineButton.click({ timeout: 2_000 });
    } else {
      await menuTrigger.click({ timeout: 2_000 });
      await editor.locator('[data-testid="response-actions-menu-clear-response"]').click({ timeout: 2_000 });
    }
    await expect(editor.locator('[data-testid="response-status-code"]')).toHaveCount(0, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

async function writeRequest(collectionDir: string, name: string, url: string): Promise<void> {
  fs.writeFileSync(path.join(collectionDir, `${name}.bru`), [
    'meta {', `  name: ${name}`, '  type: http', '  seq: 1', '}', '',
    'get {', `  url: ${url}`, '  body: none', '  auth: none', '}', ''
  ].join('\n'), 'utf8');
}

// VS Code's proxy agent exempts `localhost` and `127.0.0.1`, so only another spelling exercises the
// substituted path. Not every runner has IPv6.
function ipv6LoopbackReachable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '::1', port });
    const settle = (reachable: boolean) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(2_000);
    socket.once('connect', () => settle(true));
    socket.once('timeout', () => settle(false));
    socket.once('error', () => settle(false));
  });
}

async function setupCollection(page: any, name: string, tmpDir: string): Promise<{ sidebar: Frame; collectionDir: string }> {
  const sidebar = await openBrunoSidebar(page);
  await createCollection(page, sidebar, name, tmpDir, 'bru');
  return { sidebar, collectionDir: findCollectionDir(tmpDir) };
}

test.describe('Response timeline', () => {
  test('records each send and can be cleared', async ({ page, tmpDir }) => {
    const collectionName = 'Timeline Collection';
    const { sidebar, collectionDir } = await setupCollection(page, collectionName, tmpDir);

    fs.mkdirSync(path.join(collectionDir, 'environments'), { recursive: true });
    fs.writeFileSync(path.join(collectionDir, 'environments', 'Local.bru'), `vars {\n  host: ${TEST_SERVER}\n}\n`, 'utf8');
    await writeRequest(collectionDir, 'Ping', '{{host}}/ping');

    const editor = await openRequest(page, sidebar, collectionName, 'Ping');

    await editor.locator('[data-testid="environment-selector-trigger"]').click();
    await editor.locator('.dropdown-item').filter({ hasText: 'Local' }).first().click();

    await sendRequest(editor, 200);
    await openTimelineTab(editor);

    const entries = editor.locator('[data-testid="timeline-item"]');
    const url = editor.locator('[data-testid="timeline-url"]').first();
    const header = editor.locator('[data-testid="timeline-item-header"]').first();
    const detail = editor.locator('[data-testid="timeline-detail"]').first();

    await expect(entries).toHaveCount(1, { timeout: 10_000 });
    await expect(url).toHaveText(`${TEST_SERVER}/ping`, { timeout: 10_000 });

    await header.click();
    await expect(detail).toBeVisible({ timeout: 5_000 });

    await sendRequest(editor, 200);
    await openTimelineTab(editor);
    await expect(entries).toHaveCount(2, { timeout: 10_000 });

    await editor.getByTitle('Clear Timeline').click();
    await expect(entries).toHaveCount(0, { timeout: 10_000 });
  });

  test('network logs carry the same detail as the desktop app', async ({ page, tmpDir }) => {
    const collectionName = 'Timeline Network Logs';
    const { sidebar, collectionDir } = await setupCollection(page, collectionName, tmpDir);

    await writeRequest(collectionDir, 'Ping', `${TEST_SERVER}/ping`);

    const editor = await openRequest(page, sidebar, collectionName, 'Ping');
    await sendRequest(editor, 200);
    await openTimelineTab(editor);

    await editor.locator('[data-testid="timeline-item-header"]').first().click();
    await openNetworkTab(editor);

    const logs = editor.locator(NETWORK_PANEL).first();
    await expect(logs).toContainText(`Preparing request to ${TEST_SERVER}/ping`);
    await expect(logs).toContainText('User-Agent: bruno-runtime');
    await expect(logs).toContainText(/Trying 127\.0\.0\.1:8081/);
    await expect(logs).toContainText(/Connected to 127\.0\.0\.1/);
    await expect(logs).toContainText('HTTP/1.1 200 OK');
    await expect(logs).toContainText('content-type: text/html');
    await expect(logs).toContainText(/Request completed in \d+ ms/);
  });

  test('network logs report the connection for a host VS Code proxies', async ({ page, tmpDir }) => {
    test.skip(!(await ipv6LoopbackReachable(8081)), 'IPv6 loopback unavailable');

    const collectionName = 'Timeline Non Localhost';
    const { sidebar, collectionDir } = await setupCollection(page, collectionName, tmpDir);

    await writeRequest(collectionDir, 'Ping', 'http://[::1]:8081/ping');

    const editor = await openRequest(page, sidebar, collectionName, 'Ping');
    await sendRequest(editor, 200);
    await openTimelineTab(editor);

    await editor.locator('[data-testid="timeline-item-header"]').first().click();
    await openNetworkTab(editor);

    const logs = editor.locator(NETWORK_PANEL).first();
    await expect(logs).toContainText(/Trying ::1:8081/);
    await expect(logs).toContainText(/Connected to ::1/);
  });

  test('network logs show the body of an error response as text', async ({ page, tmpDir }) => {
    const collectionName = 'Timeline Error Body';
    const { sidebar, collectionDir } = await setupCollection(page, collectionName, tmpDir);

    await writeRequest(collectionDir, 'Missing', `${TEST_SERVER}/no-such-route`);

    const editor = await openRequest(page, sidebar, collectionName, 'Missing');
    await sendRequest(editor, 404);
    await openTimelineTab(editor);

    await editor.locator('[data-testid="timeline-item-header"]').first().click();
    await openNetworkTab(editor);

    const logs = editor.locator(NETWORK_PANEL).first();
    await expect(logs).toContainText('HTTP/1.1 404 Not Found');
    // A base64 blob here would mean the body was logged encoded.
    await expect(logs).toContainText('Cannot GET /no-such-route');
  });

  test('clearing the response keeps the timeline', async ({ page, tmpDir }) => {
    const collectionName = 'Timeline Survives Clear';
    const { sidebar, collectionDir } = await setupCollection(page, collectionName, tmpDir);

    await writeRequest(collectionDir, 'Ping', `${TEST_SERVER}/ping`);

    const editor = await openRequest(page, sidebar, collectionName, 'Ping');

    await sendRequest(editor, 200);

    // The Timeline tab swaps these actions out for Clear Timeline, so clear from the Response tab.
    await clearResponse(editor);

    await openTimelineTab(editor);
    await expect(editor.locator('[data-testid="timeline-item"]')).toHaveCount(1, { timeout: 10_000 });
  });

  test('a failed request shows the axios error code as its status', async ({ page, tmpDir }) => {
    const collectionName = 'Timeline Errors';
    const { sidebar, collectionDir } = await setupCollection(page, collectionName, tmpDir);

    // Malformed scheme: fails inside axios before any response. Loopback host so a change in
    // axios' URL parsing can never send this to the public internet.
    await writeRequest(collectionDir, 'Bad', 'gethttps://127.0.0.1:8081/sample.mp4');

    const editor = await openRequest(page, sidebar, collectionName, 'Bad');
    await editor.locator('#send-request').click();

    await openTimelineTab(editor);

    // Desktop shows the error code here, not the raw axios message.
    await expect(editor.locator('[data-testid="timeline-item"]').first())
      .toContainText('ERR_BAD_REQUEST', { timeout: 15_000 });
  });

  test('a json body can be collapsed from the fold gutter', async ({ page, tmpDir }) => {
    const collectionName = 'Timeline Fold Gutter';
    const { sidebar, collectionDir } = await setupCollection(page, collectionName, tmpDir);

    fs.writeFileSync(path.join(collectionDir, 'Echo.bru'), [
      'meta {', '  name: Echo', '  type: http', '  seq: 1', '}', '',
      'post {', `  url: ${TEST_SERVER}/api/echo/json`, '  body: json', '  auth: none', '}', '',
      'body:json {', '  {', '    "name": "bruno",', '    "tags": [', '      "api"', '    ]', '  }', '}', ''
    ].join('\n'), 'utf8');

    const editor = await openRequest(page, sidebar, collectionName, 'Echo');
    await sendRequest(editor, 200);
    await openTimelineTab(editor);

    await editor.locator('[data-testid="timeline-item-header"]').first().click();
    await editor.locator('.tl-tab').filter({ hasText: /^Response/ }).first().click();

    const body = editor.locator('[data-testid="timeline-panel-response"]').first().locator('.CodeMirror').first();
    const foldControl = body.locator('.CodeMirror-foldgutter-open').first();

    await expect(foldControl).toBeVisible({ timeout: 10_000 });

    await foldControl.click();
    await expect(body.locator('.CodeMirror-foldmarker')).toHaveCount(1);
  });
});
