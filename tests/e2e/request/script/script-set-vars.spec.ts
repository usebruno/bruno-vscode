import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '../../utils/fixtures';
import { openBrunoSidebar, createCollection, openRequest, sendRequest } from '../../utils/page/actions';

const TEST_SERVER = 'http://127.0.0.1:8081';

// Find the collection directory created under tmpDir (the folder containing bruno.json).
function findCollectionDir(root: string): string {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop() as string;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    if (entries.some((e) => e.isFile() && e.name === 'bruno.json')) return dir;
    for (const e of entries) {
      if (e.isDirectory()) stack.push(path.join(dir, e.name));
    }
  }
  throw new Error(`No collection (bruno.json) found under ${root}`);
}

test.describe('Scripting: variable APIs', () => {
  test('a pre-request script (bru.setVar) runs and its variable interpolates into the outgoing request', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Script Vars';

    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

    // Write a request whose pre-request script sets `token`, used in a header echoed by the mock server.
    const collectionDir = findCollectionDir(tmpDir);
    const requestBru = [
      'meta {',
      '  name: Ping',
      '  type: http',
      '  seq: 1',
      '}',
      '',
      'get {',
      `  url: ${TEST_SERVER}/capture`,
      '  body: none',
      '  auth: inherit',
      '}',
      '',
      'headers {',
      '  x-token: {{token}}',
      '}',
      '',
      'script:pre-request {',
      "  bru.setVar('token', 'ABC123');",
      '}',
      ''
    ].join('\n');
    fs.writeFileSync(path.join(collectionDir, 'Ping.bru'), requestBru, 'utf8');

    const editor = await openRequest(page, sidebar, collectionName, 'Ping');
    await sendRequest(editor, 200);

    // Ground truth: query the mock server (from Node) for the header the extension actually sent.
    // If the script ran and `{{token}}` interpolated, this is 'ABC123'; if the script never ran (the
    // sandbox failed to initialize), it is the literal '{{token}}'.
    const res = await fetch(`${TEST_SERVER}/last-capture`);
    const { token } = (await res.json()) as { token: string | null };
    expect(token).toBe('ABC123');
  });

  test('bru.setEnvVar / bru.deleteEnvVar take effect and persist to the environment file', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Env Script Vars';

    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

    const collectionDir = findCollectionDir(tmpDir);
    // An environment with a seed var the script will delete.
    fs.mkdirSync(path.join(collectionDir, 'environments'), { recursive: true });
    fs.writeFileSync(path.join(collectionDir, 'environments', 'Local.bru'), 'vars {\n  seed: SEED\n}\n', 'utf8');
    // Request whose pre-request script adds one env var and deletes the seed one.
    fs.writeFileSync(path.join(collectionDir, 'Ping.bru'), [
      'meta {', '  name: Ping', '  type: http', '  seq: 1', '}', '',
      'get {', `  url: ${TEST_SERVER}/capture`, '  body: none', '  auth: inherit', '}', '',
      'headers {', '  x-token: {{envTok}}', '}', '',
      'script:pre-request {', "  bru.setEnvVar('envTok', 'ENVVAL');", "  bru.deleteEnvVar('seed');", '}', ''
    ].join('\n'), 'utf8');

    const editor = await openRequest(page, sidebar, collectionName, 'Ping');

    // Select the "Local" environment so the script has an active environment to write to.
    await editor.locator('[data-testid="environment-selector-trigger"]').click();
    await editor.locator('.dropdown-item').filter({ hasText: 'Local' }).first().click();

    await sendRequest(editor, 200);

    // In-request interpolation proves setEnvVar ran.
    const res = await fetch(`${TEST_SERVER}/last-capture`);
    const { token } = (await res.json()) as { token: string | null };
    expect(token).toBe('ENVVAL');

    // Persistence: the environment file gains the new var and loses the deleted one.
    const envFile = path.join(collectionDir, 'environments', 'Local.bru');
    await expect.poll(() => fs.readFileSync(envFile, 'utf8'), { timeout: 15_000 }).toContain('envTok: ENVVAL');
    expect(fs.readFileSync(envFile, 'utf8')).not.toContain('seed: SEED');

    expect(fs.readFileSync(envFile, 'utf8')).not.toContain('__name__');
  });
});
