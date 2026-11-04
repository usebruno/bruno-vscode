// Copy this file into a suites folder, fix the imports and list it in runSuites([...]).
// Export `desc`, `workspace` and `run` (`setup` is optional). Order: setup -> beforeEach builds `workspace` -> run -> afterEach.
import type { test as Test } from './utils/fixtures';
import { Workspace } from './e2e-helper';

// Suite name in the report, also used by --grep
export const desc = 'What this suite checks';

// Created before run(): collections, with folders (nested in `folders`) holding their requests
export const workspace: Workspace = {
  collections: [
    {
      name: 'sample-collection',
      format: 'yml',
      folders: [
        {
          name: 'sample-folder',
          requests: [
            { name: 'sample-request', url: 'https://example.com', type: 'HTTP', method: 'GET' },
          ],
        },
      ],
    },
  ],
};

// Optional. Registered for this suite only, before the collection is created.
// Use the conditional forms here: test.skip(true, ...), test.slow(true), test.fixme(true, ...).
export function setup(test: typeof Test) {
  // test.skip(!!process.env.CI, 'not on CI'); // skip without creating the collection
  // test.fixme(true, 'known bug'); // same, reported as fixme
  // test.describe.configure({ timeout: 2 * 60_000 }); // timeout for this suite
  // test.slow(true); // triple this suite's timeout
  // test.beforeEach(async () => {});
  // test.afterEach(async () => {});
}

// Only needed when a suite has more than one case (e.g. 2 cases): one function per case, called from run() in order.
// With a single case, put the steps directly in run().
async function firstCase() {
  // These also work here. Import `test` as a value: import { test } from './utils/fixtures'
  // test.skip(true, 'reason'); // skips the rest of this suite, but its collection is already created
  // await someAction('sample-request');
  // await expect(locator).toBeVisible();
}

async function secondCase() {
  // await anotherAction('sample-folder');
  // await expect(locator).toHaveText('value');
}

// The collection already exists. Actions come from utils/page/actions.
export async function run() {
  await firstCase();
  await secondCase();
}
