import type { Page, Frame } from '@playwright/test';
import { test, expect } from '../../utils/fixtures';
import {
  openBrunoSidebar,
  createCollection,
  openNewRequestPanel,
  createRequest,
  openRequest,
  openRequestPaneTab,
  runCommand
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

// Edit a path param's value via the hover popover over its `:param` token.
async function editPathParamViaPopover(
  page: Page,
  editor: Frame,
  paramName: string,
  value: string
): Promise<void> {
  const locators = buildCommonLocators(editor);

  const paramSpan = locators.requestUrl.highlightedToken(paramName);
  await expect(paramSpan).toBeVisible({ timeout: 5_000 });

  // Retry the hover: move off the token first so a fresh mouseover fires.
  const popover = locators.varPopover.container();
  await expect(async () => {
    await locators.requestUrl.editor().hover({ position: { x: 2, y: 2 } });
    await paramSpan.hover();
    await expect(popover).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 5_000 });

  const editableDisplay = locators.varPopover.editableDisplay();
  await expect(editableDisplay).toBeVisible({ timeout: 5_000 });
  await editableDisplay.click();

  const popoverEditor = locators.varPopover.editor();
  await expect(popoverEditor).toBeVisible({ timeout: 5_000 });

  // Retry select-all + type until the editor holds the full value.
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await expect(async () => {
    await popoverEditor.click();
    await expect(locators.varPopover.editorFocused()).toBeVisible({ timeout: 2_000 });
    await page.keyboard.press(`${modifier}+a`);
    await page.keyboard.type(value, { delay: 30 });
    const typed = (await locators.varPopover.editorLine().textContent())?.trim();
    expect(typed).toBe(value);
  }).toPass({ timeout: 5_000 });

  await page.keyboard.press('Enter');

  // Remove lingering popovers so they can't intercept clicks below the URL bar.
  await editor.evaluate(() => {
    document.querySelectorAll('.CodeMirror-brunoVarInfo').forEach((el) => el.remove());
  });
  await expect(locators.varPopover.all()).toHaveCount(0, { timeout: 5_000 });
}

// Read the path param value from the Params -> Path table.
async function getPathParamTableValue(editor: Frame): Promise<string> {
  const valueLine = buildCommonLocators(editor).paramsTable.pathValueCell();
  await expect(valueLine).toBeVisible({ timeout: 5_000 });
  return (await valueLine.textContent())?.trim() ?? '';
}

test.describe('Path parameters', () => {
  test('Edit a path param value from the URL hover popover', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Path Param Collection';
    const requestName = 'Get User';
    const requestUrl = 'https://echo.usebruno.com/:userId';
    const paramValue = '42';

    await createCollection(page, sidebar, collectionName, tmpDir);
    const newReqPanel = await openNewRequestPanel(page, sidebar, collectionName);
    await createRequest(page, newReqPanel, sidebar, collectionName, requestName, requestUrl, 'GET');

    const editor = await openRequest(page, sidebar, collectionName, requestName);

    await editPathParamViaPopover(page, editor, 'userId', paramValue);

    // Edited value must propagate to the Params -> Path table (in-memory store).
    await openRequestPaneTab(editor, 'Params');
    await expect(async () => {
      const value = await getPathParamTableValue(editor);
      expect(value).toBe(paramValue);
    }).toPass({ timeout: 5_000 });

    // Persistence: save to disk, close the tab, then reopen from a fresh editor and
    // confirm the edited value survives.
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+s`);
    await runCommand(page, 'View: Close Editor');

    const reopened = await openRequest(page, sidebar, collectionName, requestName);
    await openRequestPaneTab(reopened, 'Params');
    await expect(async () => {
      const value = await getPathParamTableValue(reopened);
      expect(value).toBe(paramValue);
    }).toPass({ timeout: 5_000 });
  });
});
