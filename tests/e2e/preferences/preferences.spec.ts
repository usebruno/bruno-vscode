import * as fs from 'fs';
import * as path from 'path';
import type { Frame, Page } from '@playwright/test';
import { test, expect } from '../utils/fixtures';
import {
  openBrunoSidebar,
  createCollection,
  findCollectionDir,
  getWebviewFrame,
  openRequest,
  sendRequest,
  setRequestUrl,
  runCommand,
  closeEditorTab,
  recordIpcCalls,
  countIpcCalls,
  createRequestByType,
  openWsRequest,
  openGrpcRequest,
  loadGrpcProtoFile,
  selectGrpcMethod,
  setGrpcMessage
} from '../utils/page/actions';
import { fillOAuth2Field, selectDropdownItem } from '../utils/page/oauth2-actions';
import { buildCommonLocators } from '../utils/page/locators';
import { TEST_SERVER_LOCAL_URL } from '../utils/urls';
import {
  UNTRUSTED_GRPC_URL,
  UNTRUSTED_HTTPS_URL,
  UNTRUSTED_TOKEN_URL,
  UNTRUSTED_WS_URL
} from '../ssl/client-certificate/server/mtls-certs';

const PANEL_TITLE = 'Bruno Preferences';
// Node's error for a certificate whose issuing CA isn't trusted.
const UNTRUSTED_CERT_ERROR = 'unable to verify the first certificate';
const EXTENSION_VERSION = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8')
).version as string;

async function openPreferences(page: Page, sidebar: Frame): Promise<Frame> {
  await buildCommonLocators(sidebar).sidebar.preferencesButton().click();
  const prefs = await getWebviewFrame(page, (frame) => buildCommonLocators(frame).preferences.root(), sidebar);
  await expect(buildCommonLocators(prefs).preferences.root()).toBeVisible();
  return prefs;
}

// Preferences save on a debounce; run `change` and wait until the save IPC has gone out.
async function changeAndWaitForSave(prefs: Frame, change: () => Promise<void>): Promise<void> {
  await recordIpcCalls(prefs);
  await change();
  await expect.poll(() => countIpcCalls(prefs, 'renderer:save-preferences'), { timeout: 5_000 }).toBeGreaterThan(0);
  // The save is in flight once invoked; give the extension a moment to persist and broadcast it.
  await prefs.page().waitForTimeout(300);
}

async function focusEditorTab(page: Page, title: string): Promise<void> {
  await buildCommonLocators(page).workbench.editorTab(title).first().click();
}

// Create a .bru collection and write one GET request file per entry in `requests` (name -> url).
async function setupCollection(
  page: Page,
  sidebar: Frame,
  tmpDir: string,
  collectionName: string,
  requests: Record<string, string>
): Promise<string> {
  await createCollection(page, sidebar, collectionName, tmpDir, 'bru');
  const collectionDir = findCollectionDir(tmpDir);
  Object.entries(requests).forEach(([name, url], i) => {
    const bru = [
      'meta {',
      `  name: ${name}`,
      '  type: http',
      `  seq: ${i + 1}`,
      '}',
      '',
      'get {',
      `  url: ${url}`,
      '  body: none',
      '  auth: none',
      '}',
      ''
    ].join('\n');
    fs.writeFileSync(path.join(collectionDir, `${name}.bru`), bru, 'utf8');
  });
  return collectionDir;
}

async function lastCookieHeader(): Promise<string | null> {
  const res = await fetch(`${TEST_SERVER_LOCAL_URL}/cookies/last`);
  return ((await res.json()) as { cookie: string | null }).cookie;
}

test.describe('Preferences', () => {
  test('opens from the sidebar and command palette as a single panel and switches tabs', async ({ page }) => {
    const sidebar = await openBrunoSidebar(page);
    const prefs = await openPreferences(page, sidebar);
    const ui = buildCommonLocators(prefs).preferences;
    const panelTab = buildCommonLocators(page).workbench.editorTab(PANEL_TITLE);

    await test.step('General is the default tab', async () => {
      await expect(ui.tab('General')).toHaveAttribute('aria-selected', 'true');
      await expect(ui.timeoutInput()).toBeVisible();
    });

    await test.step('the command palette reveals the same panel instead of opening another', async () => {
      await runCommand(page, 'Bruno: Open Preferences');
      await expect(panelTab).toHaveCount(1);
      await buildCommonLocators(sidebar).sidebar.preferencesButton().click();
      await expect(panelTab).toHaveCount(1);
    });

    await test.step('switching between General and About', async () => {
      await ui.tab('About').click();
      await expect(ui.tab('About')).toHaveAttribute('aria-selected', 'true');
      await expect(ui.about()).toBeVisible();
      await expect(ui.timeoutInput()).toHaveCount(0);

      await ui.tab('General').click();
      await expect(ui.timeoutInput()).toBeVisible();
      await expect(ui.about()).toHaveCount(0);
    });
  });

  test('General settings persist across reopening and invalid values are rejected', async ({ page }) => {
    const sidebar = await openBrunoSidebar(page);
    let prefs = await openPreferences(page, sidebar);
    let ui = buildCommonLocators(prefs).preferences;

    await test.step('defaults', async () => {
      await expect(ui.timeoutInput()).toHaveValue('0');
      await expect(ui.storeCookies()).toBeChecked();
      await expect(ui.sendCookies()).toBeChecked();
      await expect(ui.autoSave()).not.toBeChecked();
      await expect(ui.autoSaveInterval()).toBeDisabled();
    });

    await test.step('change every setting', async () => {
      await changeAndWaitForSave(prefs, async () => {
        await ui.timeoutInput().fill('1234');
        await ui.storeCookies().uncheck();
        await ui.sendCookies().uncheck();
        await ui.autoSave().check();
        await expect(ui.autoSaveInterval()).toBeEnabled();
        await ui.autoSaveInterval().fill('2500');
      });
    });

    await test.step('values are restored after closing and reopening the panel', async () => {
      await closeEditorTab(page, PANEL_TITLE);
      prefs = await openPreferences(page, sidebar);
      ui = buildCommonLocators(prefs).preferences;
      await expect(ui.timeoutInput()).toHaveValue('1234');
      await expect(ui.storeCookies()).not.toBeChecked();
      await expect(ui.sendCookies()).not.toBeChecked();
      await expect(ui.autoSave()).toBeChecked();
      await expect(ui.autoSaveInterval()).toHaveValue('2500');
    });

    await test.step('invalid timeout and save delay show errors and are not saved', async () => {
      await ui.timeoutInput().fill('abc');
      await ui.timeoutInput().blur();
      await expect(ui.error().filter({ hasText: 'Request Timeout must be a number' })).toBeVisible();

      await ui.timeoutInput().fill('-5');
      await ui.timeoutInput().blur();
      await expect(ui.error().filter({ hasText: 'Request Timeout must be equal or greater than 0' })).toBeVisible();

      await ui.autoSaveInterval().fill('50');
      await ui.autoSaveInterval().blur();
      await expect(ui.error().filter({ hasText: 'Save Delay must be at least 100ms' })).toBeVisible();

      // Wait out the save debounce, then confirm the last valid values survived.
      await page.waitForTimeout(1_000);
      await closeEditorTab(page, PANEL_TITLE);
      prefs = await openPreferences(page, sidebar);
      ui = buildCommonLocators(prefs).preferences;
      await expect(ui.timeoutInput()).toHaveValue('1234');
      await expect(ui.autoSaveInterval()).toHaveValue('2500');
    });
  });

  test('changing a setting back to its original value is saved', async ({ page }) => {
    const sidebar = await openBrunoSidebar(page);
    let prefs = await openPreferences(page, sidebar);
    let ui = buildCommonLocators(prefs).preferences;

    await test.step('uncheck a setting, then check it again in the same panel session', async () => {
      await changeAndWaitForSave(prefs, () => ui.storeCookies().uncheck());
      await changeAndWaitForSave(prefs, () => ui.storeCookies().check());
    });

    await test.step('save a timeout, then change it and change it back', async () => {
      await changeAndWaitForSave(prefs, () => ui.timeoutInput().fill('1234'));
      await closeEditorTab(page, PANEL_TITLE);
      prefs = await openPreferences(page, sidebar);
      ui = buildCommonLocators(prefs).preferences;

      await changeAndWaitForSave(prefs, () => ui.timeoutInput().fill('500'));
      await changeAndWaitForSave(prefs, () => ui.timeoutInput().fill('1234'));
    });

    await test.step('the reverted values are what was persisted', async () => {
      await closeEditorTab(page, PANEL_TITLE);
      prefs = await openPreferences(page, sidebar);
      ui = buildCommonLocators(prefs).preferences;
      await expect(ui.storeCookies()).toBeChecked();
      await expect(ui.timeoutInput()).toHaveValue('1234');
    });
  });

  test('Request Timeout is applied to outgoing requests', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    await setupCollection(page, sidebar, tmpDir, 'Timeout Prefs', {
      Slow: `${TEST_SERVER_LOCAL_URL}/delay/2000`
    });

    const prefs = await openPreferences(page, sidebar);
    const ui = buildCommonLocators(prefs).preferences;
    await changeAndWaitForSave(prefs, () => ui.timeoutInput().fill('500'));

    const editor = await openRequest(page, sidebar, 'Timeout Prefs', 'Slow');
    const response = buildCommonLocators(editor).response;

    await test.step('a request slower than the timeout is aborted', async () => {
      await buildCommonLocators(editor).sendRequest().click();
      await expect(response.error()).toContainText('timeout of 500ms exceeded', { timeout: 10_000 });
    });

    await test.step('setting the timeout back to 0 lets the request complete', async () => {
      await focusEditorTab(page, PANEL_TITLE);
      await changeAndWaitForSave(prefs, () => ui.timeoutInput().fill('0'));
      await focusEditorTab(page, 'Slow');
      await sendRequest(editor, 200);
    });
  });

  test('SSL/TLS Certificate Verification controls whether untrusted certificates are accepted', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    await setupCollection(page, sidebar, tmpDir, 'SSL Prefs', {
      Untrusted: UNTRUSTED_HTTPS_URL
    });

    const prefs = await openPreferences(page, sidebar);
    const ui = buildCommonLocators(prefs).preferences;
    await expect(ui.sslVerification()).toBeChecked();

    const editor = await openRequest(page, sidebar, 'SSL Prefs', 'Untrusted');
    const response = buildCommonLocators(editor).response;

    await test.step('with verification on, the untrusted certificate is rejected', async () => {
      await buildCommonLocators(editor).sendRequest().click();
      await expect(response.error()).toContainText(UNTRUSTED_CERT_ERROR, { timeout: 10_000 });
    });

    await test.step('turning verification off lets the request through', async () => {
      await focusEditorTab(page, PANEL_TITLE);
      await changeAndWaitForSave(prefs, () => ui.sslVerification().uncheck());
      await focusEditorTab(page, 'Untrusted');
      await sendRequest(editor, 200);
    });
  });

  test('SSL/TLS Certificate Verification applies to WebSocket connections', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    await createCollection(page, sidebar, 'SSL Prefs Ws', tmpDir);
    await createRequestByType(page, sidebar, 'SSL Prefs Ws', { name: 'Untrusted Ws', url: UNTRUSTED_WS_URL, type: 'WebSocket' });

    const prefs = await openPreferences(page, sidebar);
    const ui = buildCommonLocators(prefs).preferences;
    await expect(ui.sslVerification()).toBeChecked();

    const editor = await openWsRequest(page, sidebar, 'SSL Prefs Ws', 'Untrusted Ws');
    const ws = buildCommonLocators(editor).ws;

    await test.step('with verification on, the untrusted certificate is rejected', async () => {
      await ws.connectButton().click();
      await expect(ws.errorMessage().first()).toContainText(UNTRUSTED_CERT_ERROR, { timeout: 15_000 });
    });

    await test.step('turning verification off lets the connection through', async () => {
      await focusEditorTab(page, PANEL_TITLE);
      await changeAndWaitForSave(prefs, () => ui.sslVerification().uncheck());
      await focusEditorTab(page, 'Untrusted Ws');
      await ws.connectButton().click();
      await expect(ws.incomingMessage().first()).toContainText('welcome', { timeout: 15_000 });
    });
  });

  test('SSL/TLS Certificate Verification applies to gRPC requests', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    await createCollection(page, sidebar, 'SSL Prefs Grpc', tmpDir);
    const protoPath = path.join(findCollectionDir(tmpDir, 'opencollection.yml'), 'echo.proto');
    fs.copyFileSync(path.resolve(__dirname, '../utils/fixtures/echo.proto'), protoPath);
    await createRequestByType(page, sidebar, 'SSL Prefs Grpc', { name: 'Untrusted Grpc', url: UNTRUSTED_GRPC_URL, type: 'gRPC' });

    const prefs = await openPreferences(page, sidebar);
    const ui = buildCommonLocators(prefs).preferences;
    await expect(ui.sslVerification()).toBeChecked();

    const editor = await openGrpcRequest(page, sidebar, 'SSL Prefs Grpc', 'Untrusted Grpc');
    const grpc = buildCommonLocators(editor).grpc;
    await loadGrpcProtoFile(editor, protoPath);
    await selectGrpcMethod(editor, 'Echo');
    await setGrpcMessage(page, editor, '{"message":"hi"}');

    await test.step('with verification on, the untrusted certificate is rejected', async () => {
      await grpc.sendRequestButton().click();
      await expect(grpc.errorMessage()).toContainText(UNTRUSTED_CERT_ERROR, { timeout: 15_000 });
    });

    await test.step('turning verification off lets the request through', async () => {
      await focusEditorTab(page, PANEL_TITLE);
      await changeAndWaitForSave(prefs, () => ui.sslVerification().uncheck());
      await focusEditorTab(page, 'Untrusted Grpc');
      await grpc.sendRequestButton().click();
      await expect(grpc.responseContent()).toContainText('untrusted ok', { timeout: 15_000 });
    });
  });

  test('SSL/TLS Certificate Verification applies to OAuth2 token requests', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    await setupCollection(page, sidebar, tmpDir, 'SSL Prefs OAuth2', {
      Protected: UNTRUSTED_HTTPS_URL
    });

    const prefs = await openPreferences(page, sidebar);
    const ui = buildCommonLocators(prefs).preferences;
    await expect(ui.sslVerification()).toBeChecked();

    const editor = await openRequest(page, sidebar, 'SSL Prefs OAuth2', 'Protected');
    await editor.locator('[role="tab"]').filter({ hasText: 'Auth' }).click();
    await selectDropdownItem(editor, '[data-testid="oauth2-auth-mode-selector"]', 'OAuth 2.0');
    await selectDropdownItem(editor, '[data-testid="oauth2-grant-type-selector"]', 'Client Credentials');
    await fillOAuth2Field(page, editor, 'accessTokenUrl', UNTRUSTED_TOKEN_URL);
    await fillOAuth2Field(page, editor, 'clientId', 'test-client');
    const getToken = editor.locator('[data-testid="oauth2-get-token-btn"]');

    await test.step('with verification on, the untrusted certificate is rejected', async () => {
      await getToken.click();
      await expect(editor.getByText('No access token received from authorization server')).toBeVisible({ timeout: 15_000 });
      await expect(editor.locator('[data-testid="oauth2-token-title"]')).toHaveCount(0);
    });

    await test.step('turning verification off lets the token request through', async () => {
      await focusEditorTab(page, PANEL_TITLE);
      await changeAndWaitForSave(prefs, () => ui.sslVerification().uncheck());
      await focusEditorTab(page, 'Protected');
      await getToken.click();
      await expect(editor.getByText('Token fetched successfully!')).toBeVisible({ timeout: 15_000 });
      await expect(editor.locator('[data-testid="oauth2-token-title"]').first()).toBeVisible();
    });
  });

  test('Store and Send Cookies toggles control the cookie jar', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    await setupCollection(page, sidebar, tmpDir, 'Cookie Prefs', {
      Cookies: `${TEST_SERVER_LOCAL_URL}/cookies/echo`
    });

    const prefs = await openPreferences(page, sidebar);
    const ui = buildCommonLocators(prefs).preferences;
    const editor = await openRequest(page, sidebar, 'Cookie Prefs', 'Cookies');

    const send = async (url: string) => {
      await focusEditorTab(page, 'Cookies');
      await setRequestUrl(page, editor, `${TEST_SERVER_LOCAL_URL}${url}`);
      await sendRequest(editor, 200);
    };
    const setPreference = async (change: () => Promise<void>) => {
      await focusEditorTab(page, PANEL_TITLE);
      await changeAndWaitForSave(prefs, change);
    };

    await test.step('with both enabled, a received cookie is sent on the next request', async () => {
      await send('/cookies/set?name=prefa&value=1');
      await send('/cookies/echo');
      expect(await lastCookieHeader()).toContain('prefa=1');
    });

    await test.step('with Send disabled, stored cookies are not attached', async () => {
      await setPreference(() => ui.sendCookies().uncheck());
      await send('/cookies/echo');
      expect(await lastCookieHeader()).toBeNull();
    });

    await test.step('with Store disabled, new cookies are not saved', async () => {
      await setPreference(async () => {
        await ui.sendCookies().check();
        await ui.storeCookies().uncheck();
      });
      await send('/cookies/set?name=prefb&value=2');
      await send('/cookies/echo');
      const cookie = await lastCookieHeader();
      expect(cookie).toContain('prefa=1');
      expect(cookie).not.toContain('prefb=2');
    });
  });

  test('Auto Save writes request changes to disk only while enabled', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionDir = await setupCollection(page, sidebar, tmpDir, 'Autosave Prefs', {
      Ping: `${TEST_SERVER_LOCAL_URL}/ping`
    });
    const readRequestFile = () => fs.readFileSync(path.join(collectionDir, 'Ping.bru'), 'utf8');

    const prefs = await openPreferences(page, sidebar);
    const ui = buildCommonLocators(prefs).preferences;
    await changeAndWaitForSave(prefs, async () => {
      await ui.autoSave().check();
      await ui.autoSaveInterval().fill('300');
    });

    const editor = await openRequest(page, sidebar, 'Autosave Prefs', 'Ping');

    await test.step('an edit is saved without pressing save', async () => {
      await setRequestUrl(page, editor, `${TEST_SERVER_LOCAL_URL}/ping?autosaved=1`);
      await expect.poll(readRequestFile, { timeout: 5_000 }).toContain('autosaved=1');
    });

    await test.step('after disabling, edits stay unsaved', async () => {
      await focusEditorTab(page, PANEL_TITLE);
      await changeAndWaitForSave(prefs, () => ui.autoSave().uncheck());
      await focusEditorTab(page, 'Ping');
      await setRequestUrl(page, editor, `${TEST_SERVER_LOCAL_URL}/ping?manual=1`);
      await page.waitForTimeout(2_000);
      expect(readRequestFile()).not.toContain('manual=1');
    });
  });

  test('About shows version details, copies them and opens resource links', async ({ page }) => {
    const sidebar = await openBrunoSidebar(page);
    const prefs = await openPreferences(page, sidebar);
    const ui = buildCommonLocators(prefs).preferences;
    await ui.tab('About').click();

    await test.step('version details', async () => {
      await expect(ui.aboutValue('version')).toHaveText(EXTENSION_VERSION);
      await expect(ui.aboutValue('os')).toHaveText(`${process.platform} (${process.arch})`);
    });

    // Capture clipboard writes and external link opens instead of touching the OS.
    await prefs.evaluate(() => {
      const w = window as any;
      w.__copied = null;
      w.__opened = [];
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        value: async (text: string) => { w.__copied = text; }
      });
      const ipc = w.ipcRenderer;
      const originalSend = ipc.send.bind(ipc);
      ipc.send = (channel: string, ...args: unknown[]) => {
        if (channel === 'open-external') {
          w.__opened.push(args[0]);
          return;
        }
        originalSend(channel, ...args);
      };
    });

    await test.step('Copy Details copies the version info', async () => {
      await ui.copyDetails().click();
      await expect(prefs.getByText('Copied to clipboard')).toBeVisible();
      const copied = await prefs.evaluate(() => (window as any).__copied as string);
      expect(copied).toContain('Bruno for VS Code');
      expect(copied).toContain(`Version: ${EXTENSION_VERSION}`);
    });

    await test.step('resource links open their URLs externally', async () => {
      const links: Record<string, string> = {
        'Documentation': 'https://docs.usebruno.com',
        'Website': 'https://www.usebruno.com',
        'GitHub': 'https://github.com/usebruno/bruno-vscode',
        'Changelog': 'https://github.com/usebruno/bruno-vscode/blob/main/CHANGELOG.md',
        'Report an Issue': 'https://github.com/usebruno/bruno-vscode/issues',
        'Discord': 'https://discord.com/invite/KgcZUncpjq'
      };
      for (const name of Object.keys(links)) {
        await ui.link(name).click();
      }
      const opened = await prefs.evaluate(() => (window as any).__opened as string[]);
      expect(opened).toEqual(Object.values(links));
    });
  });
});
