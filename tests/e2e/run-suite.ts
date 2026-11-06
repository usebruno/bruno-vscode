// Runs one suite file: npm run test:suite -- tests/e2e/auth2/suites/oauth2.ts [playwright options]
// A suite is registered by the *.test.ts next to its suites folder, so this runs that file filtered to the suite's title.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const [suitePath, ...playwrightArgs] = process.argv.slice(2);
if (!suitePath) {
  console.error('Usage: npm run test:suite -- <path to a suite file> [playwright options]');
  process.exit(1);
}

const suiteFile = path.resolve(suitePath);
const desc = fs.readFileSync(suiteFile, 'utf8').match(/export const desc = (['"`])((?:\\.|(?!\1).)*)\1/)?.[2];
if (!desc) {
  console.error(`No "export const desc" found in ${suitePath}`);
  process.exit(1);
}

const folder = path.dirname(path.dirname(suiteFile));
const testFiles = fs.readdirSync(folder).filter((file) => file.endsWith('.test.ts'));
if (testFiles.length !== 1) {
  console.error(`Expected one *.test.ts in ${folder}, found ${testFiles.length}`);
  process.exit(1);
}

const result = spawnSync(
  'npx',
  ['playwright', 'test', path.join(folder, testFiles[0]), '-g', desc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), ...playwrightArgs],
  { stdio: 'inherit', shell: process.platform === 'win32' }
);
process.exit(result.status ?? 1);
