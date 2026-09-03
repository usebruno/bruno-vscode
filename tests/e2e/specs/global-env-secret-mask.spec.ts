import * as fs from 'fs';
import * as path from 'path';
import type { Frame, Locator, Page } from '@playwright/test';
import { test, expect } from '../utils/fixtures';
import {
  openBrunoSidebar,
  createCollection,
  openRequest,
  findCollectionDir,
  setCodeMirrorValue,
  runCommand
} from '../utils/page/actions';
import { getActiveEditorFrame } from '../utils/page/oauth2-actions';
import { buildCommonLocators } from '../utils/page/locators';

const SECRET_VALUE = 'abc123';

const REQUEST_BRU = [
  'meta {', '  name: Masked', '  type: http', '  seq: 1', '}', '',
  'get {', '  url: https://usebruno.com/{{token}}', '  body: none', '  auth: none', '}', ''
].join('\n');

async function frameWith(page: Page, probe: (frame: Frame) => Locator, timeout = 20_000): Promise<Frame> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      try {
        if (await probe(frame).count() > 0) return frame;
      } catch {
        // frame detached mid-poll, skip
      }
    }
    await page.waitForTimeout(400);
  }
  throw new Error(`No webview frame matched the probe within ${timeout}ms`);
}

async function readVarPopoverValue(editor: Frame): Promise<string> {
  const ui = buildCommonLocators(editor);
  await ui.varPopover.container().evaluateAll((popovers) => popovers.forEach((el) => el.remove()));

  const token = ui.requestUrl.pathParamToken('token');
  await expect(token).toBeVisible();
  await token.hover();

  const value = ui.varPopover.editableDisplay();
  await expect(value).toBeVisible();
  return (await value.textContent()) ?? '';
}

test.describe('Global environment secrets', () => {
  test('marking a variable secret masks it in request tab', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Secret Mask';
    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

    fs.writeFileSync(path.join(findCollectionDir(tmpDir), 'Masked.bru'), REQUEST_BRU, 'utf8');

    await runCommand(page, 'Bruno: Open Global Environments');
    let globalEnv = await frameWith(page, (f) => buildCommonLocators(f).environments.createEnvironment());
    let globalEnvUi = buildCommonLocators(globalEnv);

    await globalEnvUi.environments.createEnvironment().click();
    await globalEnvUi.environments.nameInput().fill('Globals');
    await globalEnvUi.environments.confirmCreate().click();

    await expect(globalEnvUi.environments.save()).toBeVisible();
    await globalEnvUi.environments.varNameInput(0).fill('token');
    await setCodeMirrorValue(page, globalEnvUi.environments.varValueEditor('token'), SECRET_VALUE);
    await globalEnvUi.environments.save().click();

    const opened = await openRequest(page, sidebar, collectionName, 'Masked');
    const editor = await getActiveEditorFrame(page, opened);
    const editorUi = buildCommonLocators(editor);

    await editorUi.environments.selectorTrigger().click();
    await editorUi.environments.scopeTab('global').click();
    await editorUi.dropdownItem('Globals').first().click();

    expect(await readVarPopoverValue(editor)).toBe(SECRET_VALUE);

    const workbench = buildCommonLocators(page).workbench;
    await workbench.editorTab('Global Environments').click();
    globalEnv = await frameWith(page, (f) => buildCommonLocators(f).environments.save());
    globalEnvUi = buildCommonLocators(globalEnv);
    await globalEnvUi.environments.varSecretCheckbox('token').check();
    await globalEnvUi.environments.save().click();

    await workbench.editorTab('Masked.bru').click();

    await expect
      .poll(() => readVarPopoverValue(editor))
      .toMatch(/^\*+$/);
  });
});
