import * as path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { createSetup, type Workspace } from '../e2e-helper';
import { test } from '../utils/fixtures';
import {
  closeAllEditors,
  connectWebSocket,
  editorLocators,
  openBrunoSidebar,
  removeCollection,
  sendGrpcRequest,
  takeScreenshot,
} from '../utils/page/actions';
import { sendRequestAndVerify } from '../utils/page/assertions';
import { GRPC_SERVER_URL, TEST_SERVER_LOCAL_URL } from '../utils/urls';

const WS_SERVER_URL = TEST_SERVER_LOCAL_URL.replace('http', 'ws');
const ECHO_PROTO = path.resolve(__dirname, '../utils/fixtures/echo.proto');

const workspace: Workspace = {
  collections: [
    {
      name: 'response-actions-collection',
      format: 'yml',
      requests: [
        { name: 'http-request', url: `${TEST_SERVER_LOCAL_URL}/ping`, type: 'HTTP', method: 'GET' },
        { name: 'graphql-request', url: `${TEST_SERVER_LOCAL_URL}/api/echo/json`, type: 'GraphQL', method: 'POST', payload: '{ ping }' },
        { name: 'grpc-request', url: GRPC_SERVER_URL, type: 'gRPC', method: 'GET' },
        { name: 'ws-request', url: WS_SERVER_URL, type: 'WebSocket', method: 'GET' },
      ],
    },
  ],
};

const actions = {
  copy: { button: 'copy', menuItem: 'copy-response' },
  clear: { button: 'clear', menuItem: 'clear-response' },
  layout: { button: 'layout-toggle', menuItem: 'change-layout' },
} as const;

async function verifyResponsePaneActionButtons(page: Page, expected: (keyof typeof actions)[]) {
  const { response } = editorLocators(page);

  const collapsed = await response.actionsMenu().isVisible();
  if (collapsed) {
    await response.actionsMenu().click();
  }
  for (const action of expected) {
    const { button, menuItem } = actions[action];
    await expect(collapsed ? response.actionsMenuItem(menuItem) : response.actionButton(button)).toBeVisible();
  }
  if (collapsed) {
    await page.keyboard.press('Escape');
  }
}

test.describe('response lifecycle', () => {
  let collections: string[] = [];

  test.beforeEach(async ({ workbench }) => {
    ({ ctx: { collections } } = await createSetup(workspace, workbench));
  });

  test.afterEach(async ({ workbench }) => {
    await takeScreenshot(workbench, test);
    await closeAllEditors(workbench);
    const sidebar = await openBrunoSidebar(workbench);
    for (const collection of collections) {
      await removeCollection(sidebar, collection);
    }
  });

  test('shows Copy, Clear and Change layout for HTTP and GraphQL, and Clear and Change layout for gRPC and WebSocket', async({ workbench: page }) => {
    await sendRequestAndVerify(page, 'http-request', 200);
    await verifyResponsePaneActionButtons(page, ['copy', 'clear', 'layout']);

    await sendRequestAndVerify(page, 'graphql-request', 200);
    await verifyResponsePaneActionButtons(page, ['copy', 'clear', 'layout']);

    const { grpc, ws } = editorLocators(page);

    await sendGrpcRequest(page, 'grpc-request', { proto: ECHO_PROTO, method: 'Echo', message: '{"message": "hello"}' });
    await expect(grpc.responseStatusCode()).toContainText('0');
    await verifyResponsePaneActionButtons(page, ['clear', 'layout']);

    await connectWebSocket(page, 'ws-request');
    await expect(ws.connectionStatusStrip()).toBeVisible();
    await expect(ws.incomingMessage()).toContainText('welcome');
    await verifyResponsePaneActionButtons(page, ['clear', 'layout']);
  });
});
