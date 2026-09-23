import { test, expect } from '../../utils/fixtures';
import {
  openBrunoSidebar,
  createCollection,
  createGrpcRequestWithProto,
  selectGrpcMethod,
  openGrpcMessageTab
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

/**
 * Message tab only allows more than one request message for client-streaming / bidi-streaming methods.
 *
 * Methods come from `streaming.proto` (one rpc per method type).
 */

test.describe('gRPC method type', () => {
  test('the selected method type drives how many request messages are allowed', async ({ page, tmpDir }) => {
    const collectionName = 'gRPC Method Type';
    const sidebar = await openBrunoSidebar(page);
    await createCollection(page, sidebar, collectionName, tmpDir);

    const editor = await createGrpcRequestWithProto(page, sidebar, collectionName, {
      name: 'MethodType',
      protoFixture: 'streaming.proto',
      targetDir: tmpDir
    });
    await openGrpcMessageTab(editor);

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
