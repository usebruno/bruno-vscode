import * as path from 'path';
import * as fs from 'fs';
import { test, expect } from '../../utils/fixtures';
import type { Frame } from '@playwright/test';
import {
  createRequestByType,
  openGrpcRequest,
  loadGrpcProtoFile,
  selectGrpcMethod,
  setGrpcMessage,
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';
import {
  expectPromptModal,
  expectNoPromptModal,
  fillPromptAndContinue,
  cancelPrompt,
} from './prompt-actions';
import { GRPC_SERVER, setupCollection, getActiveEditorFrame } from './request-actions';

/**
 * Prompt-variable coverage for gRPC requests. Invocations run through the same
 * `sendRequest` thunk as HTTP and the whole message body is interpolated before
 * the call. Prompts go in the request message (the echo server's single `message`
 * field holds multiple placeholders in one string, so dedup/multiple/empty work),
 * and we assert the resolved value on a status-0 response. Methods load from a
 * `.proto` (no reflection).
 *
 * Omitted: prompt-in-URL (would fire the modal during on-open reflection, a
 * different flow) and metadata/auth echo (would need a richer proto).
 */

/**
 * Create a gRPC request, load the echo proto, and select the Echo method.
 * Returns the editor frame ready for a message to be set + invoked.
 */
async function setupGrpcEchoRequest(
  page: import('@playwright/test').Page,
  tmpDir: string,
  collectionName: string,
  requestName: string
): Promise<Frame> {
  const sidebar = await setupCollection(page, tmpDir, collectionName);

  // Copy the echo proto into the collection dir so the picker records a clean path.
  const protoInCollection = path.join(tmpDir, 'echo.proto');
  fs.copyFileSync(path.resolve(__dirname, '../../utils/fixtures/echo.proto'), protoInCollection);

  await createRequestByType(page, sidebar, collectionName, { name: requestName, url: GRPC_SERVER, type: 'gRPC' });
  const editor = await openGrpcRequest(page, sidebar, collectionName, requestName);

  await loadGrpcProtoFile(editor, protoInCollection);
  await selectGrpcMethod(editor, 'Echo');
  return editor;
}

/** Click invoke on a gRPC request. */
async function invokeGrpc(editor: Frame): Promise<void> {
  await buildCommonLocators(editor).grpc.sendRequestButton().click();
}

/** Assert a successful (status 0) gRPC response whose content contains `text`. */
async function expectGrpcResponseContains(page: import('@playwright/test').Page, editor: Frame, text: string): Promise<void> {
  const grpc = buildCommonLocators(await getActiveEditorFrame(page, editor)).grpc;
  await expect(grpc.responseStatusCode()).toContainText('0');
  await expect(grpc.responseContent()).toContainText(text);
}

test.describe('Prompt variables — gRPC', () => {

  test('prompt in the gRPC message is interpolated before invoking', async ({ page, tmpDir }) => {
    const editor = await setupGrpcEchoRequest(page, tmpDir, 'gRPC Body', 'gRPC Prompt Body');

    await setGrpcMessage(page, editor, '{"message":"{{?GrpcMsg}}"}');
    await invokeGrpc(editor);
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['grpc-body-1']);

    await expectGrpcResponseContains(page, editor, 'grpc-body-1');
  });

  test('the same prompt used twice is asked only once (dedup)', async ({ page, tmpDir }) => {
    const editor = await setupGrpcEchoRequest(page, tmpDir, 'gRPC Dedup', 'gRPC Dedup');

    await setGrpcMessage(page, editor, '{"message":"{{?Shared}}=={{?Shared}}"}');
    await invokeGrpc(editor);
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['dup']);

    await expectGrpcResponseContains(page, editor, 'dup==dup');
  });

  test('multiple distinct prompts each get their own input', async ({ page, tmpDir }) => {
    const editor = await setupGrpcEchoRequest(page, tmpDir, 'gRPC Multi', 'gRPC Multi');

    await setGrpcMessage(page, editor, '{"message":"{{?First}}=={{?Second}}"}');
    await invokeGrpc(editor);
    await expectPromptModal(editor, 2);
    await fillPromptAndContinue(editor, ['one', 'two']);

    await expectGrpcResponseContains(page, editor, 'one==two');
  });

  test('an empty value is accepted and does not block the invocation', async ({ page, tmpDir }) => {
    const editor = await setupGrpcEchoRequest(page, tmpDir, 'gRPC Empty', 'gRPC Empty');

    await setGrpcMessage(page, editor, '{"message":"start-{{?Empty}}-end"}');
    await invokeGrpc(editor);
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['']);

    await expectGrpcResponseContains(page, editor, 'start--end');
  });

  test('an invalid prompt pattern ({{? name}}) does not trigger the modal', async ({ page, tmpDir }) => {
    const editor = await setupGrpcEchoRequest(page, tmpDir, 'gRPC Invalid', 'gRPC Invalid');

    await setGrpcMessage(page, editor, '{"message":"{{? Invalid}}"}');
    await invokeGrpc(editor);

    // No modal — the invocation proceeds directly to a status-0 response.
    const current = await getActiveEditorFrame(page, editor);
    await expect(buildCommonLocators(current).grpc.responseStatusCode()).toContainText('0');
    await expectNoPromptModal(current);
  });

  test('cancelling the modal aborts the invocation', async ({ page, tmpDir }) => {
    const editor = await setupGrpcEchoRequest(page, tmpDir, 'gRPC Cancel', 'gRPC Cancel');

    await setGrpcMessage(page, editor, '{"message":"{{?GrpcMsg}}"}');
    await invokeGrpc(editor);
    await expectPromptModal(editor, 1);
    await cancelPrompt(editor);

    // The call was never made, so no response status appears.
    const current = await getActiveEditorFrame(page, editor);
    await expect(buildCommonLocators(current).grpc.responseStatusCode()).toHaveCount(0);
  });
});
