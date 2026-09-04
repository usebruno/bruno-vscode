import * as fs from 'fs';
import * as path from 'path';
import type { Frame } from '@playwright/test';
import { test, expect } from '../../utils/fixtures';
import {
  openBrunoSidebar,
  createCollection,
  openNewRequestPanel,
  createRequest,
  openRequest,
  openRequestPaneTab,
  sendRequest
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

const TEST_SERVER = 'http://127.0.0.1:8081';

/**
 * Switch the body to "File / Binary" mode and attach `filePath` to the first file row.
 * The picker opens a native dialog, so we intercept its `renderer:browse-files` IPC call.
 */
async function attachFileBody(editor: Frame, filePath: string): Promise<void> {
  const body = buildCommonLocators(editor).requestBody;

  await openRequestPaneTab(editor, 'Body');
  await body.modeSelector().click();
  await body.modeOption('file').click();
  await body.addFile().click();

  await editor.evaluate((selected) => {
    const ipc = (window as any).ipcRenderer;
    const originalInvoke = ipc.invoke.bind(ipc);
    ipc.invoke = async (channel: string, ...args: any[]) => {
      if (channel === 'renderer:browse-files') {
        ipc.invoke = originalInvoke; // restore after one use
        return [selected];
      }
      return originalInvoke(channel, ...args);
    };
  }, filePath);

  await body.selectFile().click();

  // The row shows the file name once the pick lands in state
  await expect(body.selectedFileName()).toHaveText(path.basename(filePath), { timeout: 10_000 });
}

test.describe('Request body: File / Binary', () => {
  test('the picked file is uploaded as the raw request body', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'File Body';
    const requestName = 'Upload File';
    const fileContent = 'first line\nsecond line\n';

    // Outside the collection directory, like a file picked from ~/Downloads — stored as an absolute path
    const payloadPath = path.join(tmpDir, 'payload.txt');
    fs.writeFileSync(payloadPath, fileContent, 'utf8');

    await createCollection(page, sidebar, collectionName, tmpDir);

    const newReqPanel = await openNewRequestPanel(page, sidebar, collectionName);
    await createRequest(page, newReqPanel, sidebar, collectionName, requestName, `${TEST_SERVER}/raw-body`, 'POST');

    const editor = await openRequest(page, sidebar, collectionName, requestName);
    await attachFileBody(editor, payloadPath);
    await sendRequest(editor, 200);

    // Ask the server what arrived — a request with no body still comes back 200
    const res = await fetch(`${TEST_SERVER}/get-raw-body`);
    const sent = (await res.json()) as { contentType: string | null; body: string };

    expect(sent.body).toBe(fileContent);
    // Filled in from the file extension when the file is picked
    expect(sent.contentType).toBe('text/plain; charset=utf-8');
  });
});
