import { expect, type Page } from '@playwright/test';
import type { Workspace } from '../../e2e-helper';
import { editorLocators, setAuth } from '../../utils/page/actions';
import { verifyRequestPane, sendRequestAndVerify, verifyResponsePane } from '../../utils/page/assertions';
import { TEST_SERVER_REMOTE_URL } from '../../utils/urls';

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

const authModifiedIndicator = (page: Page) => editorLocators(page).tabs.byText('Auth').getByTestId('status-dot-auth');
const collectionAuthModifiedIndicator = (page: Page) => editorLocators(page).paneTabs.collectionSettingsTab('auth').getByTestId('status-dot-auth');
const folderAuthModifiedIndicator = (page: Page) => editorLocators(page).paneTabs.folderSettingsTab('auth').getByTestId('status-dot-auth');

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
              url: `${TEST_SERVER_REMOTE_URL}/api/auth/basic/protected`,
              type: 'HTTP',
              method: 'POST',
              auth: 'inherit',
            },
            { name: 'graphql-request', url: 'http://localhost:8080/graphql', type: 'GraphQL', method: 'POST', auth: 'inherit' },
            { name: 'grpc-request', url: 'grpc://localhost:8080', type: 'gRPC', method: 'GET', auth: 'inherit' },
            { name: 'ws-request', url: 'ws://localhost:8080', type: 'WebSocket', method: 'GET', auth: 'inherit' },
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
          url: `${TEST_SERVER_REMOTE_URL}/api/auth/bearer/protected`,
          type: 'HTTP',
          method: 'GET',
          auth: 'inherit',
        },
      ],
    },
  ],
};

// Request set to Inherit: it resolves each auth type from its folder
async function verifyAuthInheritanceFromFolder(page: Page) {
  for (const [mode, label] of authTypes) {
    await setAuth(page, 'folder-1', mode);
    await verifyRequestPane(page, 'request-1', 'Auth', { contains: ['Auth inherited from folder-1:', label] });
  }
}

// Folder set to Inherit: the request resolves each auth type from the collection
async function verifyAuthInheritanceFromCollection(page: Page) {
  await setAuth(page, 'folder-1', 'inherit');
  for (const [mode, label] of authTypes) {
    await setAuth(page, 'collection-1', mode);
    await verifyRequestPane(page, 'request-1', 'Auth', { contains: ['Auth inherited from Collection:', label] });
  }
}

// The nearest parent wins, and a No Auth folder stops the chain
async function verifyAuthInheritanceChain(page: Page) {
  await setAuth(page, 'collection-1', 'basic');
  await setAuth(page, 'folder-1', 'basic');
  await setAuth(page, 'folder-2', 'basic');
  await setAuth(page, 'folder-3', 'inherit');
  await verifyRequestPane(page, 'folder-3', 'Auth', { contains: ['Auth inherited from folder-2:', 'Basic Auth'] });

  await setAuth(page, 'folder-1', 'none');
  await verifyRequestPane(page, 'request-1', 'Auth', { contains: ['Auth inherited from folder-1:', 'No Auth'] });
  await sendRequestAndVerify(page, 'request-1', 401);
  await verifyResponsePane(page, 'request-1', { tab: 'Timeline', section: 'Request' }, { notContains: [/authorization/i] });
}

// An inheriting request sends the collection's auth (Bearer), and sends nothing when the collection is No Auth
async function verifyCollectionAuthApplied(page: Page) {
  await setAuth(page, 'collection-1', 'bearer', { token: 'wrong-token' });
  await verifyRequestPane(page, 'request-2', 'Auth', { contains: ['Auth inherited from Collection:', 'Bearer Token'] });
  await sendRequestAndVerify(page, 'request-2', 401);

  await setAuth(page, 'collection-1', 'bearer', { token: 'your_secret_token' });
  await expect(() => sendRequestAndVerify(page, 'request-2', 200)).toPass({ timeout: 30_000 });

  await setAuth(page, 'collection-1', 'none');
  await verifyRequestPane(page, 'request-2', 'Auth', { contains: ['Auth inherited from Collection:', 'No Auth'] });
  await sendRequestAndVerify(page, 'request-2', 401);
  await verifyResponsePane(page, 'request-2', { tab: 'Timeline', section: 'Request' }, { notContains: [/authorization/i] });
}

// The Auth tab dot shows only when the effective auth is not No Auth, for the collection, a folder and every request type
async function verifyAuthModifiedIndicator(page: Page) {
  const folderRequests = ['request-1', 'graphql-request', 'grpc-request', 'ws-request'];

  await setAuth(page, 'collection-1', 'basic');
  await expect(collectionAuthModifiedIndicator(page)).toBeVisible();
  await setAuth(page, 'collection-1', 'none');
  await expect(collectionAuthModifiedIndicator(page)).toBeHidden();

  await setAuth(page, 'folder-1', 'basic');
  await expect(folderAuthModifiedIndicator(page)).toBeVisible();

  await setAuth(page, 'folder-1', 'inherit');
  await verifyRequestPane(page, 'folder-1', 'Auth', { contains: ['Auth inherited from Collection:', 'No Auth'] });
  await expect(folderAuthModifiedIndicator(page)).toBeHidden();

  await setAuth(page, 'folder-1', 'none');
  await expect(folderAuthModifiedIndicator(page)).toBeHidden();
  for (const request of folderRequests) {
    await verifyRequestPane(page, request, 'Auth', { contains: ['Auth inherited from folder-1:', 'No Auth'] });
    await expect(authModifiedIndicator(page)).toBeHidden();
  }

  await setAuth(page, 'folder-1', 'basic');
  for (const request of folderRequests) {
    await verifyRequestPane(page, request, 'Auth', { contains: ['Auth inherited from folder-1:', 'Basic Auth'] });
    await expect(authModifiedIndicator(page)).toBeVisible();
  }
}

export async function run(page: Page) {
  await verifyAuthInheritanceFromFolder(page);
  await verifyAuthInheritanceFromCollection(page);
  await verifyAuthInheritanceChain(page);
  await verifyCollectionAuthApplied(page);
  await verifyAuthModifiedIndicator(page);
}
