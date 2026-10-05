import { Page, Frame, expect } from '@playwright/test';
import { createCollection, openNewRequestPanel, createRequest, openRequest, runCommand } from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';
import { selectDropdownItem } from '../../utils/page/oauth2-actions';

export type GrantType = 'Client Credentials' | 'Password Credentials' | 'Authorization Code' | 'Implicit';

export async function setupOAuth2Request(
  page: Page,
  sidebar: Frame,
  tmpDir: string,
  collectionName: string,
  grantType: GrantType,
  url: string
): Promise<Frame> {
  await createCollection(page, sidebar, collectionName, tmpDir);
  const newReqPanel = await openNewRequestPanel(page, sidebar, collectionName);
  await createRequest(page, newReqPanel, sidebar, collectionName, 'User Info', url);
  const editor = await openRequest(page, sidebar, collectionName, 'User Info');

  const oauth2 = buildCommonLocators(editor).oauth2;
  await buildCommonLocators(editor).tabs.byText('Auth').click();
  await selectDropdownItem(editor, oauth2.authModeSelector(), 'OAuth 2.0');
  await selectDropdownItem(editor, oauth2.grantTypeSelector(), grantType);
  await expect(oauth2.getTokenBtn()).toBeVisible();

  return editor;
}

function fieldRowByLabel(editor: Frame, label: string) {
  return editor.locator('label').filter({ hasText: label }).first().locator('..');
}

export async function fillField(page: Page, editor: Frame, keyOrLabel: string, value: string): Promise<void> {
  let row = buildCommonLocators(editor).oauth2.field(keyOrLabel);
  if (await row.count() === 0) {
    row = fieldRowByLabel(editor, keyOrLabel);
  }

  const cm = row.locator('.CodeMirror');
  await expect(cm).toBeVisible();
  await cm.click();
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(value);
  await page.keyboard.press('Tab');
}

export async function selectCredentialsPlacement(
  editor: Frame,
  placement: 'Request Body' | 'Basic Auth Header'
): Promise<void> {
  const trigger = fieldRowByLabel(editor, 'Add Credentials to').locator('.token-placement-selector');
  await selectDropdownItem(editor, trigger, placement);
}

export async function enablePkce(editor: Frame): Promise<void> {
  const checkbox = fieldRowByLabel(editor, 'Use PKCE').locator('input[type="checkbox"]');
  await checkbox.check();
  await expect(checkbox).toBeChecked();
}

export async function clickGetAccessToken(editor: Frame): Promise<void> {
  const getTokenBtn = buildCommonLocators(editor).oauth2.getTokenBtn();
  await expect(getTokenBtn).toBeEnabled();
  await getTokenBtn.click();
}

export async function expectAccessToken(editor: Frame): Promise<void> {
  const oauth2 = buildCommonLocators(editor).oauth2;
  await expect(oauth2.tokenTitle().filter({ hasText: 'Access Token' })).toBeVisible();
  await expect(oauth2.getTokenBtn()).toBeEnabled();
}

export async function clearTokenCache(editor: Frame): Promise<void> {
  const oauth2 = buildCommonLocators(editor).oauth2;
  await editor.getByTestId('oauth2-clear-cache-btn').click();
  await expect(oauth2.tokenTitle()).toHaveCount(0);
}

export async function expectErrorToast(editor: Frame, message: RegExp): Promise<void> {
  await expect(editor.getByRole('status').filter({ hasText: message })).toBeVisible();
}

/**
 * Deliver a `vscode://` URI to the running VS Code through "Developer: Open URL" — the same
 * path the OS takes when the browser follows the oauth.usebruno.com redirect.
 */
export async function openVSCodeUri(page: Page, uri: string): Promise<void> {
  await runCommand(page, 'Developer: Open URL');
  // Wait for the command palette (">…") to give way to the "URL to open" prompt. The prompt
  // prefills the last URL it opened; `fill` replaces it.
  const input = page.locator('.quick-input-widget input');
  await expect(input).not.toHaveValue(/^>/);
  await input.fill(uri);
  await page.keyboard.press('Enter');
  await expect(page.locator('.quick-input-widget')).toBeHidden();
}
