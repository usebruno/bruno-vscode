import * as fs from 'fs';
import * as path from 'path';
import type { Frame } from '@playwright/test';
import { test, expect } from '../utils/fixtures';
import { openBrunoSidebar, createCollection, openRequest, findCollectionDir, openRequestPaneTab } from '../utils/page/actions';

const TEST_SERVER = 'http://127.0.0.1:8081';

async function setupRequest(page: any, tmpDir: string, collectionName: string): Promise<Frame> {
  const sidebar = await openBrunoSidebar(page);
  await createCollection(page, sidebar, collectionName, tmpDir, 'bru');
  const collectionDir = findCollectionDir(tmpDir);

  fs.writeFileSync(path.join(collectionDir, 'Echo.bru'), [
    'meta {', '  name: Echo', '  type: http', '  seq: 1', '}', '',
    'post {', `  url: ${TEST_SERVER}/api/echo/json`, '  body: json', '  auth: none', '}', '',
    'body:json {', '  {', '    "name": "bruno",', '    "tags": [', '      "api"', '    ]', '  }', '}', ''
  ].join('\n'), 'utf8');

  const editor = await openRequest(page, sidebar, collectionName, 'Echo');
  await openRequestPaneTab(editor, 'Body');
  return editor;
}

test.describe('Request body editor', () => {
  test('fills the height of the request pane', async ({ page, tmpDir }) => {
    const editor = await setupRequest(page, tmpDir, 'Body Editor Height');
    const body = editor.locator('.flex-boundary .CodeMirror').first();
    await expect(body).toBeVisible({ timeout: 10_000 });

    await expect(async () => {
      const fill = await body.evaluate((el: any) => {
        const editorHeight = el.getBoundingClientRect().height;
        const containerHeight = el.parentElement.getBoundingClientRect().height;
        return containerHeight > 0 ? editorHeight / containerHeight : 0;
      });
      expect(fill).toBeGreaterThan(0.98);
    }).toPass({ timeout: 10_000 });
  });

  test('offers fold controls on a json body', async ({ page, tmpDir }) => {
    const editor = await setupRequest(page, tmpDir, 'Body Editor Folding');
    const body = editor.locator('.flex-boundary .CodeMirror').first();
    const foldControl = body.locator('.CodeMirror-foldgutter-open').first();

    await expect(foldControl).toBeVisible({ timeout: 10_000 });

    await foldControl.click();
    await expect(body.locator('.CodeMirror-foldmarker')).toHaveCount(1);
  });
});
