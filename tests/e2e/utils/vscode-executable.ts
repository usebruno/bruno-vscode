import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import * as fs from 'fs';
import * as path from 'path';

export const VSCODE_VERSION = '1.136.2';

/**
 * @vscode/test-electron hardcodes the macOS binary as `Electron`, but VS Code 1.131
 * renamed it to `Code`, so spawning the path it hands back fails with ENOENT. Only
 * macOS is affected — on Windows it returns `Code.exe` and on Linux `code`, both of
 * which are still current.
 */
function resolveRenamedBinary(exe: string): string {
  if (process.platform !== 'darwin') {
    return exe;
  }
  const dir = path.dirname(exe);
  if (!fs.existsSync(dir)) {
    return exe;
  }
  const entries = fs.readdirSync(dir);
  if (entries.includes('Code')) {
    return path.join(dir, 'Code');
  }
  // Contents/MacOS holds only the main executable, whatever it is called.
  return entries.length === 1 ? path.join(dir, entries[0]) : exe;
}

export async function resolveExecutable(): Promise<string> {
  if (process.env.CURSOR_PATH) {
    console.log(`[e2e] Using Cursor: ${process.env.CURSOR_PATH}`);
    return process.env.CURSOR_PATH;
  }
  if (process.env.VSCODE_PATH) {
    console.log(`[e2e] Using custom VS Code: ${process.env.VSCODE_PATH}`);
    return process.env.VSCODE_PATH;
  }
  console.log(`[e2e] Downloading VS Code ${VSCODE_VERSION}…`);
  const exe = await downloadAndUnzipVSCode(VSCODE_VERSION);
  const resolved = fs.existsSync(exe) ? exe : resolveRenamedBinary(exe);
  if (!fs.existsSync(resolved)) {
    throw new Error(`VS Code executable not found (tried ${exe} and ${resolved})`);
  }
  console.log(`[e2e] Using VS Code: ${resolved}`);
  return resolved;
}
