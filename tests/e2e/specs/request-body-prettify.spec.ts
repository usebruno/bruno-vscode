import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '../utils/fixtures';
import {
  openBrunoSidebar,
  createCollection,
  openNewRequestPanel,
  createRequest,
  openRequest,
  fillJsonBody,
  openRequestPaneTab,
  runCommand,
  findCollectionDir
} from '../utils/page/actions';
import { buildCommonLocators } from '../utils/page/locators';

test.describe('Request body formatting', () => {
  test('reopens a POST request after prettifying and saving its JSON body', async ({ page, tmpDir }) => {
    const collectionName = 'Prettify Collection';
    const requestName = 'Create Estimate';
    const compactJson = '{"customer":{"id":1},"items":[{"sku":"A-1","quantity":2}]}';

    const { sidebar, editor } = await test.step('Create a POST request with compact JSON', async () => {
      const sidebar = await openBrunoSidebar(page);
      await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

      const newRequestPanel = await openNewRequestPanel(page, sidebar, collectionName);
      await createRequest(
        page,
        newRequestPanel,
        sidebar,
        collectionName,
        requestName,
        'https://example.com/estimates',
        'POST'
      );

      const editor = await openRequest(page, sidebar, collectionName, requestName);
      await fillJsonBody(page, editor, compactJson);

      return { sidebar, editor };
    });

    const requestFile = path.join(findCollectionDir(tmpDir), `${requestName}.bru`);

    await test.step('Prettify and save the request', async () => {
      const locators = buildCommonLocators(editor);

      await locators.body.prettifyButton().click();

      await expect
        .poll(() => locators.body.lines().count())
        .toBeGreaterThan(1);

      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await page.keyboard.press(`${modifier}+s`);

      await expect(
        locators.notifications.message('Request saved successfully')
      ).toBeVisible();

      // Re-enter the save path without changing the formatted body. This used to
      // persist VS Code's invisible dirty marker and make the request unparseable.
      await locators.body.prettifyButton().click();
      await page.waitForTimeout(500);
      await page.keyboard.press(`${modifier}+s`);
      await page.waitForTimeout(500);
    });

    await test.step('Close and reopen the saved request', async () => {
      await runCommand(page, 'View: Close Editor');

      const reopenedEditor = await openRequest(
        page,
        sidebar,
        collectionName,
        requestName
      );

      await openRequestPaneTab(reopenedEditor, 'Body');

      const reopenedLocators = buildCommonLocators(reopenedEditor);

      await expect
        .poll(() => reopenedLocators.body.lines().count())
        .toBeGreaterThan(1);

      await expect(reopenedLocators.body.editor()).toContainText('"quantity": 2');
      expect(fs.readFileSync(requestFile, 'utf8')).not.toContain('\u200B');
    });
  });
});
