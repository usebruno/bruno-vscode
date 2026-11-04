import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'child_process';
import * as net from 'net';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { runCommand, openBrunoSidebar, openCollectionFromDisk } from '../page/actions';
import { CA_CERT } from '../../ssl/client-certificate/server/mtls-certs';
import { resolveExecutable } from '../vscode-executable';

// This file lives at tests/e2e/utils/fixtures/, so climb four levels to the repo root.
const EXTENSION_ROOT = path.resolve(__dirname, '../../../..');

export interface VSCodeFixture {
  /** The VS Code workbench page — use this to interact with the UI */
  page: Page;
  context: BrowserContext;
  /** Temp directory for storing test collections — cleaned up automatically */
  tmpDir: string;
  /** The workbench page with the spec's `fixtures/collection(s)` already open in the Bruno sidebar */
  pageWithCollections: Page;
}

export interface VSCodeOptions {
  vscodeSettings: Record<string, unknown>;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function waitForPort(port: number, timeoutMs = 25_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await new Promise<void>((resolve, reject) => {
        const sock = net.createConnection(port, '127.0.0.1');
        sock.once('connect', () => { sock.destroy(); resolve(); });
        sock.once('error', reject);
      });
      return;
    } catch {
      await new Promise<void>(r => setTimeout(r, 400));
    }
  }
  throw new Error(`Port ${port} never opened within ${timeoutMs}ms`);
}

/** Write VS Code user settings to suppress welcome/trust dialogs and speed up startup */
function writeVSCodeSettings(userDataDir: string, extraSettings: Record<string, unknown> = {}): void {
  const userDir = path.join(userDataDir, 'User');
  fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(
    path.join(userDir, 'settings.json'),
    JSON.stringify({
      'window.newWindowDimensions': 'maximized',
      'workbench.startupEditor': 'none',
      'update.mode': 'none',
      'extensions.autoCheckUpdates': false,
      'telemetry.telemetryLevel': 'off',
      'workbench.tips.enabled': false,
      'workbench.editor.untitled.hint': 'hidden',
      'security.workspace.trust.enabled': false,
      'extensions.ignoreRecommendations': true,
      'github.copilot.enable': false,
      'chat.disableAIFeatures': true,
      'workbench.secondarySideBar.defaultVisibility': 'hidden',
      'workbench.welcomePage.walkthroughs.openOnInstall': false,
      'workbench.accounts.experimental.showEntitlements': false,
      'accessibility.signUpPlaceholder': false,
      ...extraSettings,
    }, null, 2)
  );
}

function launchVSCode(
  executablePath: string,
  debugPort: number,
  userDataDir: string,
  workspacePath: string
): ChildProcess {
  const args = [
    `--extensionDevelopmentPath=${EXTENSION_ROOT}`,
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-sandbox',
    '--disable-updates',
    '--disable-workspace-trust',
    '--skip-welcome',
    '--skip-release-notes',
    workspacePath,
  ];

  const proc = spawn(executablePath, args, {
    detached: false,
    env: { ...process.env, NODE_EXTRA_CA_CERTS: CA_CERT }
  });
  // Only log errors to avoid noise
  proc.stderr?.on('data', d => {
    const line = String(d);
    if (line.includes('ERROR') || line.includes('Error')) {
      process.stderr.write(`[vscode] ${line}`);
    }
  });
  return proc;
}

function makeTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    if (process.platform !== 'win32') {
      return dir;
    }
    const longPath = fs.realpathSync.native(dir);
    return longPath.replace(/^([A-Za-z]):/, (_match, drive: string) => `${drive.toLowerCase()}:`);
  }

async function ensureSecondarySidebarClosed(page: Page): Promise<void> {
  const auxiliaryBar = page.locator('.part.auxiliarybar');
  const isVisible = await auxiliaryBar.isVisible().catch(() => false);
  if (!isVisible) return;
  await runCommand(page, 'View: Close Secondary Side Bar');
  await auxiliaryBar.waitFor({ state: 'hidden'}).catch(() => {});
}

/** Wait for the VS Code workbench UI to be ready */
async function waitForWorkbench(page: Page): Promise<void> {
  // Wait for the monaco workbench shell to exist
  await page.waitForSelector('.monaco-workbench', { timeout: 30_000 });
  // Wait for the activity bar to be rendered
  await page.waitForSelector('.activitybar', { timeout: 20_000 });

  // Dismiss the GitHub sign-in dialog if it appears (VS Code 1.116+)
  try {
    const skipButton = page.locator('text=Skip');
    const continueButton = page.locator('text=Continue without Signing In');
    const dismissTarget = skipButton.or(continueButton);
    await dismissTarget.first().click({ timeout: 3_000 });
    // Wait for the dialog to close
    await page.waitForTimeout(1_000);
  } catch {
    // Dialog didn't appear — that's fine
  }
  await ensureSecondarySidebarClosed(page);

  // Small extra buffer for extension activation
  await new Promise(r => setTimeout(r, 2_000));
}

export const test = base.extend<VSCodeFixture & VSCodeOptions>({
  vscodeSettings: [{}, { option: true }],

  page: async ({ vscodeSettings }, use) => {
    const debugPort = await getFreePort();
    const userDataDir = makeTempDir('bruno-vscode-test-');

    // Create a temp workspace folder so the extension host has a workspace to run against
    const workspacePath = makeTempDir('bruno-workspace-');

    writeVSCodeSettings(userDataDir, vscodeSettings);

    const executablePath = await resolveExecutable();
    const proc = launchVSCode(executablePath, debugPort, userDataDir, workspacePath);

    let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;

    try {
      await waitForPort(debugPort, 25_000);

      browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);

      // VS Code may have multiple contexts — find the one with the workbench page
      let workbenchPage: Page | undefined;

      // Try existing pages first
      for (const ctx of browser.contexts()) {
        const found = ctx.pages().find(p =>
          p.url().startsWith('vscode-file://') || p.url().includes('workbench.html')
        );
        if (found) { workbenchPage = found; break; }
      }

      // If not found yet, wait for a new page to appear
      if (!workbenchPage) {
        workbenchPage = await new Promise<Page>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Workbench page not found within 20s')), 20_000);
          for (const ctx of browser!.contexts()) {
            ctx.on('page', p => {
              if (p.url().startsWith('vscode-file://') || p.url().includes('workbench.html')) {
                clearTimeout(timer);
                resolve(p);
              }
            });
          }
        });
      }

      await waitForWorkbench(workbenchPage);

      await use(workbenchPage);
    } finally {
      await browser?.close().catch(() => {});
      proc.kill('SIGTERM');
      await new Promise<void>(r => setTimeout(r, 1500));
      proc.kill('SIGKILL');
      fs.rmSync(userDataDir, { recursive: true, force: true });
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }
  },

  context: async ({ page }, use) => {
    await use(page.context());
  },

  tmpDir: async ({}, use) => {
    const dir = makeTempDir('bruno-test-collections-');
    await use(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  },

  pageWithCollections: async ({ page }, use, testInfo) => {
    const fixturesDir = path.join(path.dirname(testInfo.file), 'fixtures');
    const srcPath = [path.join(fixturesDir, 'collection'), path.join(fixturesDir, 'collections')]
      .find((p) => fs.existsSync(p));
    if (!srcPath) {
      await use(page);
      return;
    }

    const dir = makeTempDir('bruno-fixture-collections-');
    fs.cpSync(srcPath, dir, { recursive: true });

    const isCollection = (d: string) =>
      fs.existsSync(path.join(d, 'opencollection.yml')) || fs.existsSync(path.join(d, 'bruno.json'));
    const collectionDirs = isCollection(dir)
      ? [dir]
      : fs.readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(dir, entry.name));

    const sidebar = await openBrunoSidebar(page);
    for (const collectionDir of collectionDirs) {
      await openCollectionFromDisk(page, sidebar, collectionDir);
    }

    await use(page);
    fs.rmSync(dir, { recursive: true, force: true });
  },
});

export { expect } from '@playwright/test';
