import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '../utils/fixtures';
import {
  openBrunoSidebar,
  createCollection,
  openRequest,
  sendRequest,
  addRequestHeader,
  findCollectionDir
} from '../utils/page/actions';

const TEST_SERVER = 'http://127.0.0.1:8081';

function seedGetRequest(collectionDir: string, name: string, url: string): void {
  fs.writeFileSync(path.join(collectionDir, `${name}.bru`), [
    'meta {', `  name: ${name}`, '  type: http', '  seq: 1', '}', '',
    'get {', `  url: ${url}`, '  body: none', '  auth: inherit', '}', ''
  ].join('\n'), 'utf8');
}

test.describe('HTML response preview', () => {
  test('base href uses the interpolated request URL when the URL contains a variable', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Html Preview';

    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

    const collectionDir = findCollectionDir(tmpDir);
    fs.mkdirSync(path.join(collectionDir, 'environments'), { recursive: true });
    fs.writeFileSync(path.join(collectionDir, 'environments', 'Local.bru'), `vars {\n  host: ${TEST_SERVER}\n}\n`, 'utf8');
    seedGetRequest(collectionDir, 'Page', '{{host}}/htmlpage');

    const editor = await openRequest(page, sidebar, collectionName, 'Page');

    await editor.locator('[data-testid="environment-selector-trigger"]').click();
    await editor.locator('.dropdown-item').filter({ hasText: 'Local' }).first().click();

    await sendRequest(editor, 200);

    // The base href should be the interpolated url, not the raw {{host}} form.
    const previewFrame = editor.locator('iframe');
    await expect(previewFrame).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => (await previewFrame.getAttribute('srcdoc')) || '', { timeout: 15_000 })
      .toContain(`<base href="${TEST_SERVER}/htmlpage">`);
    const srcdoc = (await previewFrame.getAttribute('srcdoc')) || '';
    expect(srcdoc).not.toContain('{{host}}');
  });

  test('Ctrl/Cmd+S saves when keyboard focus is inside the preview iframe', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Html Preview Save';

    await createCollection(page, sidebar, collectionName, tmpDir, 'bru');

    const collectionDir = findCollectionDir(tmpDir);
    seedGetRequest(collectionDir, 'Page', `${TEST_SERVER}/htmlpage-autofocus`);

    const editor = await openRequest(page, sidebar, collectionName, 'Page');

    await sendRequest(editor, 200);

    const previewFrame = editor.locator('iframe');
    await expect(previewFrame).toBeVisible({ timeout: 15_000 });

    // Dirty the request so a successful save is observable.
    await addRequestHeader(page, editor, 'X-Test', '1');

    // Real focus inside the preview is the situation the fix exists for.
    await editor.frameLocator('iframe').locator('#focustrap').click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+S' : 'Control+S');

    await expect(editor.getByText('Request saved successfully')).toBeVisible({ timeout: 15_000 });
  });
});
