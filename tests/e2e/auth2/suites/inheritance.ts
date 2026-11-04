import { expect } from '@playwright/test';
import { Workspace } from '../../e2e-helper';
import { activeEditor, setAuth, expectRequestPane, sendRequestAndExpect, expectResponsePane, page } from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

export const desc = 'Inherit resolves every auth type, goes to the nearest parent, stops at a No Auth folder, and is sent';

const authTypes = [
  ['basic', 'Basic Auth'],
  ['bearer', 'Bearer Token'],
  ['digest', 'Digest Auth'],
  ['ntlm', 'NTLM'],
  ['wsse', 'WSSE Auth'],
  ['apikey', 'API Key'],
  ['awsv4', 'AWS Sig V4'],
] as const;

const authModifiedIndicator = () => buildCommonLocators(activeEditor(page)).tabs.byText('Auth').getByTestId('status-dot-auth');

export const workspace: Workspace = {
  collections: [
    {
      name: 'collection-1',
      format: 'yml',
      auth: 'none',
      folders: [
        {
          name: 'folder-1',
          requests: [
            {
              name: 'request-1',
              url: 'https://testbench-sanity.usebruno.com/api/auth/basic/protected',
              type: 'HTTP',
              method: 'POST',
              auth: 'inherit',
            },
          ],
          folders: [
            {
              name: 'folder-2',
              folders: [
                { name: 'folder-3' },
              ],
            },
          ],
        },
      ],
      requests: [
        {
          name: 'request-2',
          url: 'https://testbench-sanity.usebruno.com/api/auth/bearer/protected',
          type: 'HTTP',
          method: 'GET',
          auth: 'inherit',
        },
      ],
    },
  ],
};

// Request set to Inherit: it resolves each auth type from its folder
async function verifyInheritedFromFolder() {
  for (const [mode, label] of authTypes) {
    await setAuth('folder-1', mode);
    await expectRequestPane('request-1', 'Auth', { contains: ['Auth inherited from folder-1:', label] });
    await expect(authModifiedIndicator()).toBeVisible();
  }
}

// Folder set to Inherit: the request resolves each auth type from the collection
async function verifyInheritedFromCollection() {
  await setAuth('folder-1', 'inherit');
  for (const [mode, label] of authTypes) {
    await setAuth('collection-1', mode);
    await expectRequestPane('request-1', 'Auth', { contains: ['Auth inherited from Collection:', label] });
    await expect(authModifiedIndicator()).toBeVisible();
  }
}

// The nearest parent wins, and a No Auth folder stops the chain
async function verifyInheritanceChain() {
  await setAuth('collection-1', 'basic', { username: 'bruno', password: 'della' });
  await setAuth('folder-1', 'basic');
  await setAuth('folder-2', 'basic');
  await setAuth('folder-3', 'inherit');
  await expectRequestPane('folder-3', 'Auth', { contains: ['Auth inherited from folder-2:', 'Basic Auth'] });

  await setAuth('folder-1', 'none');
  await expectRequestPane('request-1', 'Auth', { contains: ['Auth inherited from folder-1:', 'No Auth'] });
  await sendRequestAndExpect('request-1', 401);
  await expectResponsePane('request-1', 'Timeline', { notContains: [/authorization/i] }, 'Request');
}

// An inheriting request sends the collection's auth (Bearer), and sends nothing when the collection is No Auth
async function verifyCollectionAuthApplied() {
  await setAuth('collection-1', 'bearer', { token: 'wrong-token' });
  await expectRequestPane('request-2', 'Auth', { contains: ['Auth inherited from Collection:', 'Bearer Token'] });
  await sendRequestAndExpect('request-2', 401);

  await setAuth('collection-1', 'bearer', { token: 'your_secret_token' });
  await sendRequestAndExpect('request-2', 200);

  await setAuth('collection-1', 'none');
  await expectRequestPane('request-2', 'Auth', { contains: ['Auth inherited from Collection:', 'No Auth'] });
  await sendRequestAndExpect('request-2', 401);
  await expectResponsePane('request-2', 'Timeline', { notContains: [/authorization/i] }, 'Request');
}

export async function run() {
  await verifyInheritedFromFolder();
  await verifyInheritedFromCollection();
  await verifyInheritanceChain();
  await verifyCollectionAuthApplied();
}
