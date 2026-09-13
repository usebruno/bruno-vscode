import * as fs from 'fs';
import * as path from 'path';
import type { Frame, Page } from '@playwright/test';
import { test, expect } from '../../utils/fixtures';
import {
  openBrunoSidebar,
  createCollection,
  createRequestByType,
  openGrpcRequest,
  loadGrpcProtoFile,
  selectGrpcMethod,
  openGrpcMessageTab,
  findCollectionDir
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

/**
 * Message tab only allows more than one request message for client-streaming / bidi-streaming methods.
 *
 * Methods come from `streaming.proto` (one rpc per method type).
 */

const GRPC_SERVER = 'grpc://localhost:8082';

async function setupGrpcRequest(
  page: Page,
  tmpDir: string,
  collectionName: string,
  requestName: string
): Promise<Frame> {
  const sidebar = await openBrunoSidebar(page);
  await createCollection(page, sidebar, collectionName, tmpDir);

  const protoInCollection = path.join(tmpDir, 'streaming.proto');
  fs.copyFileSync(path.resolve(__dirname, '../../utils/fixtures/streaming.proto'), protoInCollection);

  await createRequestByType(page, sidebar, collectionName, { name: requestName, url: GRPC_SERVER, type: 'gRPC' });
  const editor = await openGrpcRequest(page, sidebar, collectionName, requestName);

  await loadGrpcProtoFile(editor, protoInCollection);
  await openGrpcMessageTab(editor);
  return editor;
}

test.describe('gRPC method type', () => {
  test('the selected method type drives how many request messages are allowed', async ({ page, tmpDir }) => {
    const editor = await setupGrpcRequest(page, tmpDir, 'gRPC Method Type', 'MethodType');
    const grpc = buildCommonLocators(editor).grpc;

    // Unary
    await selectGrpcMethod(editor, 'SayHello');
    await expect(grpc.messages()).toHaveCount(1);
    await expect(grpc.addMessageButton()).toHaveCount(0);

    // Client-streaming
    await selectGrpcMethod(editor, 'Collect');
    await expect(grpc.addMessageButton()).toBeVisible();
    await grpc.addMessageButton().click();
    await expect(grpc.messages()).toHaveCount(2);

    // Server-streaming
    await selectGrpcMethod(editor, 'Subscribe');
    await expect(grpc.messages()).toHaveCount(1);
    await expect(grpc.addMessageButton()).toHaveCount(0);

    // Bidi-streaming
    await selectGrpcMethod(editor, 'Chat');
    await expect(grpc.addMessageButton()).toBeVisible();
    await expect(grpc.messages()).toHaveCount(2);

    await selectGrpcMethod(editor, 'SayHello');
    await expect(grpc.messages()).toHaveCount(1);
    await expect(grpc.addMessageButton()).toHaveCount(0);
  });
});
