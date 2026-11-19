import { expect, type Page } from '@playwright/test';
import type { Workspace } from '../../e2e-helper';
import { editorLocators, setCodeMirrorValue } from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

export const desc = 'Open with Text Editor asks to save unsaved request edits, and Save writes them so the text editor shows them';

export const workspace: Workspace = {
  collections: [
    {
      name: 'text-editor-collection',
      format: 'yml',
      requests: [
        { name: 'unsaved-request', url: 'https://example.com/saved', type: 'HTTP', method: 'GET' },
      ],
    },
  ],
};

const EDITED_URL = 'https://example.com/edited';

async function verifyUnsavedEditsOpenInTextEditor(page: Page) {
  const { workbench } = buildCommonLocators(page);

  await setCodeMirrorValue(page, editorLocators(page).requestUrl.editor().locator('.CodeMirror'), EDITED_URL);

  await workbench.editorTitleAction('Open with Text Editor').click();
  await workbench.dialogButton('Save').click();

  await expect(workbench.textEditor()).toContainText(EDITED_URL);
}

export async function run(page: Page) {
  await verifyUnsavedEditsOpenInTextEditor(page);
}
