import * as fs from 'node:fs';
import { test, expect } from '../../utils/fixtures';
import { openBrunoSidebar, createCollection, activeEditor, findFilesWithName } from '../../utils/page/actions';
import { TEST_SERVER_LOCAL_URL } from '../../utils/urls';

const COLLECTION = 'Curl Collection';
const REQUEST = 'Echo JSON';
const REQUEST_URL = `${TEST_SERVER_LOCAL_URL}/api/echo/json`;

test.describe('New request from cURL', () => {
  test('fills the request from the command and saves it', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    await createCollection(sidebar, COLLECTION, tmpDir);

    await sidebar.newRequest(COLLECTION, {
      name: REQUEST,
      curl: `curl -X POST '${REQUEST_URL}' -H 'Content-Type: application/json' -H 'X-Trace: abc' -d '{"name":"bruno"}'`
    });

    await test.step('the editor shows the method and URL', async () => {
      const editor = activeEditor(page);

      await expect(editor.getByTestId('request-method')).toContainText('POST');
      await expect(editor.locator('.input-container .CodeMirror').first()).toContainText(REQUEST_URL);
    });

    await test.step('the file carries the method, URL, headers and body', async () => {
      const [file] = findFilesWithName(tmpDir, `${REQUEST}.yml`);
      expect(file).toBeDefined();
      const text = fs.readFileSync(file, 'utf8');

      expect(text).toContain(REQUEST_URL);
      expect(text.toLowerCase()).toContain('post');
      expect(text).toContain('application/json');
      expect(text).toContain('X-Trace');
      expect(text).toContain('"name": "bruno"');
    });
  });
});
