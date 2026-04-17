import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import { spawn, type ChildProcess } from 'child_process';
import * as net from 'net';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

const EXTENSION_ROOT = path.resolve(__dirname, '../../..');

export interface VSCodeFixture {
  /** The VS Code workbench page — use this to interact with the UI */
  page: Page;
  context: BrowserContext;
  /** Temp directory for storing test collections — cleaned up automatically */
  tmpDir: string;
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

async function resolveExecutable(): Promise<string> {
  if (process.env.CURSOR_PATH) {
    console.log(`[e2e] Using Cursor: ${process.env.CURSOR_PATH}`);
    return process.env.CURSOR_PATH;
  }
  if (process.env.VSCODE_PATH) {
    console.log(`[e2e] Using custom VS Code: ${process.env.VSCODE_PATH}`);
    return process.env.VSCODE_PATH;
  }
  console.log('[e2e] Downloading stable VS Code…');
  const exe = await downloadAndUnzipVSCode('stable');
  console.log(`[e2e] Using VS Code: ${exe}`);
  return exe;
}

/** Write VS Code user settings to suppress welcome/trust dialogs and speed up startup */
function writeVSCodeSettings(userDataDir: string): void {
  const userDir = path.join(userDataDir, 'User');
  fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(
    path.join(userDir, 'settings.json'),
    JSON.stringify({
      'workbench.startupEditor': 'none',
      'update.mode': 'none',
      'extensions.autoCheckUpdates': false,
      'telemetry.telemetryLevel': 'off',
      'workbench.tips.enabled': false,
      'workbench.editor.untitled.hint': 'hidden',
      'security.workspace.trust.enabled': false,
      'extensions.ignoreRecommendations': true,
      'github.copilot.enable': false,
      'workbench.welcomePage.walkthroughs.openOnInstall': false,
      'workbench.accounts.experimental.showEntitlements': false,
      'accessibility.signUpPlaceholder': false,
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
    workspacePath,
  ];

  const proc = spawn(executablePath, args, { detached: false });
  // Only log errors to avoid noise
  proc.stderr?.on('data', d => {
    const line = String(d);
    if (line.includes('ERROR') || line.includes('Error')) {
      process.stderr.write(`[vscode] ${line}`);
    }
  });
  return proc;
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

  // Small extra buffer for extension activation
  await new Promise(r => setTimeout(r, 2_000));
}

export const test = base.extend<VSCodeFixture>({
  page: async ({}, use) => {
    const debugPort = await getFreePort();
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-vscode-test-'));

    // Create a temp workspace folder so the extension host has a workspace to run against
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-workspace-'));

    writeVSCodeSettings(userDataDir);

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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-test-collections-'));
    await use(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  },
});

export { expect } from '@playwright/test';
