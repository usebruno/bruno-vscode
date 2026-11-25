import { expect, type Page } from '@playwright/test';
import type { Workspace } from '../../e2e-helper';
import { editorLocators, openRequestEditor, updateUrl } from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

export const desc = 'Save on the unsaved changes prompt writes the request edits, when closing the tab and when opening with the text editor';

export const workspace: Workspace = {
  collections: [
    {
      name: 'unsaved-edits-collection',
      format: 'yml',
      requests: [
        { name: 'close-tab-request', url: 'https://example.com/saved', type: 'HTTP', method: 'GET' },
        { name: 'text-editor-request', url: 'https://example.com/saved', type: 'HTTP', method: 'GET' },
      ],
    },
  ],
};

const EDITED_URL = 'https://example.com/edited';

async function verifyUnsavedEditsSaveOnTabClose(page: Page) {
  const { workbench } = buildCommonLocators(page);
  const tab = workbench.editorTab('close-tab-request');

  await updateUrl(page, 'close-tab-request', EDITED_URL, { save: false });

  await tab.hover();
  await workbench.editorTabClose('close-tab-request').click();
  await workbench.dialogButton('Save').click();
  await expect(tab).toHaveCount(0);

  await openRequestEditor(page, 'close-tab-request');
  await expect(editorLocators(page).requestUrl.editor()).toContainText(EDITED_URL);
}

async function verifyUnsavedEditsOpenInTextEditor(page: Page) {
  const { workbench } = buildCommonLocators(page);

  await updateUrl(page, 'text-editor-request', EDITED_URL, { save: false });

  await workbench.editorTitleAction('Open with Text Editor').click();
  await workbench.dialogButton('Save').click();

  await expect(workbench.textEditor()).toContainText(EDITED_URL);
}

export async function run(page: Page) {
  await verifyUnsavedEditsSaveOnTabClose(page);
  await verifyUnsavedEditsOpenInTextEditor(page);
}
