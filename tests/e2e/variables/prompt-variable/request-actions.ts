import { Page, Frame, expect } from '@playwright/test';
import { openBrunoSidebar, createCollection, openNewRequestPanel, createRequest, openRequest } from '../../utils/page/actions';
import { getActiveEditorFrame } from '../../utils/page/oauth2-actions';
import { buildCommonLocators } from '../../utils/page/locators';
import { expectNoPromptModal } from './prompt-actions';

/** Shared setup/assertion helpers for the prompt-variable specs (http / graphql / websocket / grpc). */

export const SERVER = 'http://127.0.0.1:8081';
export const WS_SERVER = 'ws://127.0.0.1:8081'; // shares the HTTP port
export const GRPC_SERVER = 'grpc://localhost:8082';

export { getActiveEditorFrame };

/** Open the Bruno sidebar and create a fresh collection; returns the sidebar frame. */
export async function setupCollection(page: Page, tmpDir: string, collectionName: string): Promise<Frame> {
  const sidebar = await openBrunoSidebar(page);
  await createCollection(page, sidebar, collectionName, tmpDir);
  return sidebar;
}

/** Create an HTTP request via the UI and open it; returns the editor frame. */
export async function newHttpRequest(
  page: Page,
  sidebar: Frame,
  collectionName: string,
  name: string,
  url: string,
  method: string = 'GET'
): Promise<Frame> {
  const panel = await openNewRequestPanel(page, sidebar, collectionName);
  await createRequest(page, panel, sidebar, collectionName, name, url, method);
  return openRequest(page, sidebar, collectionName, name);
}

/** Click Send in the request editor. */
export async function clickSend(editor: Frame): Promise<void> {
  await buildCommonLocators(editor).sendRequest().click();
}

// The response assertions below re-acquire the editor frame first (VS Code may recreate it mid-request).

/** Assert a 200 response whose body contains every value in `expected`. */
export async function expectResponseContainsAll(page: Page, editor: Frame, expected: string[]): Promise<void> {
  const current = await getActiveEditorFrame(page, editor);
  const locators = buildCommonLocators(current);
  const status = locators.response.statusCode();
  await expect(status).toBeVisible();
  await expect(status).toContainText('200');
  const body = locators.response.previewContainer();
  for (const value of expected) {
    await expect(body).toContainText(value);
  }
}

/** Assert a 200 response whose body contains `expected`. */
export async function expectResponseContains(page: Page, editor: Frame, expected: string): Promise<void> {
  await expectResponseContainsAll(page, editor, [expected]);
}

/** Assert the request was sent without a prompt modal (e.g. an invalid `{{? x}}`). */
export async function expectSentWithoutPrompt(page: Page, editor: Frame): Promise<void> {
  const current = await getActiveEditorFrame(page, editor);
  await expect(buildCommonLocators(current).response.statusCode()).toBeVisible();
  await expectNoPromptModal(current);
}

/** Assert the request was aborted (prompt cancelled): no response appears. */
export async function expectRequestAborted(page: Page, editor: Frame): Promise<void> {
  const current = await getActiveEditorFrame(page, editor);
  const locators = buildCommonLocators(current);
  await expectNoPromptModal(current);
  await expect(locators.sendRequest()).toBeVisible();
  await expect(locators.response.statusCode()).toHaveCount(0);
}
