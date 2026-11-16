import * as path from 'path';
import { expect, type Page } from '@playwright/test';
import type { Workspace } from '../../e2e-helper';
import { editorLocators } from '../../utils/page/actions';
import { connectWebSocketAndVerify, sendGrpcRequestAndVerify, sendRequestAndVerify } from '../../utils/page/assertions';
import { GRPC_SERVER_URL, TEST_SERVER_LOCAL_URL } from '../../utils/urls';

export const desc = 'Copy, Clear and Change layout are shown on an HTTP and a GraphQL response, and Clear and Change layout on a gRPC and a WebSocket response';

const WS_SERVER_URL = TEST_SERVER_LOCAL_URL.replace('http', 'ws');
const ECHO_PROTO = path.resolve(__dirname, '../../utils/fixtures/echo.proto');

export const workspace: Workspace = {
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

export async function run(page: Page) {
  await sendRequestAndVerify(page, 'http-request', 200);
  await verifyResponsePaneActionButtons(page, ['copy', 'clear', 'layout']);

  await sendRequestAndVerify(page, 'graphql-request', 200);
  await verifyResponsePaneActionButtons(page, ['copy', 'clear', 'layout']);

  await sendGrpcRequestAndVerify(page, 'grpc-request', { proto: ECHO_PROTO, method: 'Echo', message: '{"message": "hello"}' }, 0);
  await verifyResponsePaneActionButtons(page, ['clear', 'layout']);

  await connectWebSocketAndVerify(page, 'ws-request', 'welcome');
  await verifyResponsePaneActionButtons(page, ['clear', 'layout']);
}
