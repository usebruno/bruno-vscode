/**
 * Fake "system browser" for the browser-based grants (authorization code, implicit).
 *
 * The extension opens the authorize URL with `vscode.env.openExternal`, which e2e can't see.
 * Pointing the `workbench.externalBrowser` setting at this shim makes VS Code hand it the URL
 * instead of launching a real browser; the shim appends each URL to a log file the test reads.
 *
 * VS Code launches the configured browser through the `open` package:
 *  - Linux spawns `<browser> <url>`, so a plain shell script works.
 *  - macOS runs `open -a <browser> <url>`, which only accepts app bundles, so the shim is an
 *    AppleScript applet whose `on open location` handler receives the URL.
 *  - Windows runs PowerShell `Start-Process <browser> -ArgumentList "<url>"`. A `.cmd` shim would
 *    re-parse the URL through cmd.exe, where `&` and `%` are special, so the shim is a tiny
 *    .exe compiled with PowerShell's built-in `Add-Type` that gets the URL as `args[0]`.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test as base } from '../../../utils/fixtures';
import { VSCODE_URI_HANDLER_SETTINGS } from './index';

export interface BrowserShim {
  executable: string;
  logFile: string;
}

export function createBrowserShim(dir: string): BrowserShim {
  const logFile = path.join(dir, 'opened-urls.log');
  fs.writeFileSync(logFile, '');

  if (process.platform === 'darwin') {
    const scriptFile = path.join(dir, 'shim.applescript');
    const executable = path.join(dir, 'BrunoBrowserShim.app');
    fs.writeFileSync(
      scriptFile,
      [
        'on open location theURL',
        `  do shell script "printf '%s\\\\n' " & quoted form of theURL & " >> " & quoted form of "${logFile}"`,
        'end open location'
      ].join('\n')
    );
    execFileSync('osacompile', ['-o', executable, scriptFile]);
    return { executable, logFile };
  }

  if (process.platform === 'linux') {
    const executable = path.join(dir, 'browser-shim.sh');
    fs.writeFileSync(executable, `#!/bin/sh\nprintf '%s\\n' "$1" >> '${logFile}'\n`, { mode: 0o755 });
    return { executable, logFile };
  }

  if (process.platform === 'win32') {
    const sourceFile = path.join(dir, 'BrunoBrowserShim.cs');
    const executable = path.join(dir, 'BrunoBrowserShim.exe');
    const csString = (value: string) => `@"${value.replace(/"/g, '""')}"`;
    const psString = (value: string) => `'${value.replace(/'/g, "''")}'`;
    fs.writeFileSync(
      sourceFile,
      [
        'public static class BrunoBrowserShim {',
        '  public static void Main(string[] args) {',
        `    if (args.Length > 0) System.IO.File.AppendAllText(${csString(logFile)}, args[0] + "\\n");`,
        '  }',
        '}'
      ].join('\n')
    );
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Add-Type -Path ${psString(sourceFile)} -OutputAssembly ${psString(executable)} -OutputType WindowsApplication`
    ]);
    return { executable, logFile };
  }

  throw new Error(`Browser shim is not supported on ${process.platform}`);
}

export function clearOpenedUrls(shim: BrowserShim): void {
  fs.writeFileSync(shim.logFile, '');
}

export async function waitForOpenedUrl(shim: BrowserShim, timeoutMs = 15_000): Promise<URL> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const lines = fs.readFileSync(shim.logFile, 'utf8').split(/\r?\n/).filter(Boolean);
    if (lines.length) {
      return new URL(lines[lines.length - 1]);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No URL was opened in the system browser within ${timeoutMs}ms`);
}

/**
 * `test` for the browser-based grants: each test gets a fresh shim, wired into VS Code's
 * settings together with the URI-handler auto-confirm.
 */
export const test = base.extend<{ browserShim: BrowserShim }>({
  browserShim: async ({}, use) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-browser-shim-'));
    await use(createBrowserShim(dir));
    fs.rmSync(dir, { recursive: true, force: true });
  },
  vscodeSettings: async ({ browserShim }, use) => {
    await use({ 'workbench.externalBrowser': browserShim.executable, ...VSCODE_URI_HANDLER_SETTINGS });
  }
});
