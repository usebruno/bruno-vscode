import { expect, type Locator, type Page } from '@playwright/test';
import type { ResponsePaneTab, TextCheck } from '../../e2e-helper';
import { editorLocators, openItemTab, openResponseTab, sendRequestByName } from './actions';

async function expectText(panel: Locator, check: TextCheck): Promise<void> {
  for (const text of check.contains ?? []) {
    await expect(panel).toContainText(text);
  }
  for (const text of check.notContains ?? []) {
    await expect(panel).not.toContainText(text);
  }
}

// Checks the text of a tab of a collection, folder or request.
// e.g. verifyRequestPane(page, 'request-1', 'Body', { contains: ['"name": "bruno"'], notContains: ['password'] })
export async function verifyRequestPane(page: Page, target: string, tab: string, check: TextCheck): Promise<void> {
  await openItemTab(page, target, tab);
  await expectText(editorLocators(page).itemPane(), check);
}

// Checks the text of a response pane tab of a request. Timeline checks a view (Request, Response or Network) of the latest entry, other tabs the whole pane.
export async function verifyResponsePane(page: Page, request: string, paneTab: ResponsePaneTab, check: TextCheck): Promise<void> {
  await openResponseTab(page, request, paneTab);

  const locators = editorLocators(page);
  const panel = paneTab.tab === 'Timeline' ? locators.timeline.panel(locators.timeline.lastItem(), paneTab.section) : locators.responsePane();
  await expect(panel).toBeVisible();
  await expectText(panel, check);
}

// Sends a request and checks the response status
export async function sendRequestAndVerify(page: Page, request: string, status?: 200 | 201 | 400 | 401 | 404): Promise<void> {
  await sendRequestByName(page, request);

  const statusCode = editorLocators(page).response.statusCode();
  await expect(statusCode).toBeVisible({ timeout: 30_000 });
  if (status) {
    await expect(statusCode).toContainText(String(status), { timeout: 5_000 });
  }
}
