import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '../../utils/fixtures';
import {
  openBrunoSidebar,
  createCollection,
  openNewRequestPanel,
  createRequest,
  openRequest,
  copyItem,
  pasteIntoCollection,
  expandCollection,
  collapseCollection,
} from '../../utils/page/actions';

const TEST_SERVER = 'http://127.0.0.1:8081';

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

// Pasting a request across collections of different on-disk formats used to
// write source-format content into a destination-named file, crashing the
// sidebar. See VSCODE-75.
test.describe('Cross-format paste', () => {

  test('paste a request from a .bru collection into a .yml collection', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);

    const sourceCollection = 'Bru Source';
    const targetCollection = 'Yml Target';
    const requestName = 'Ping';
    const requestUrl = `${TEST_SERVER}/ping`;

    await createCollection(page, sidebar, sourceCollection, tmpDir, 'bru');
    await createCollection(page, sidebar, targetCollection, tmpDir, 'yml');

    const newReqPanel = await openNewRequestPanel(page, sidebar, sourceCollection);
    await createRequest(page, newReqPanel, sidebar, sourceCollection, requestName, requestUrl, 'POST');

    await copyItem(sidebar, requestName);
    await pasteIntoCollection(sidebar, targetCollection);

    // A crash unmounts the tree, so surviving rows prove the sidebar is alive.
    await expect(sidebar.locator('.sidebar-header')).toBeVisible();
    await expect(
      sidebar.locator('[data-testid="sidebar-collection-row"]').filter({ hasText: sourceCollection })
    ).toBeVisible();
    await expect(
      sidebar.locator('[data-testid="sidebar-collection-row"]').filter({ hasText: targetCollection })
    ).toBeVisible();

    await expandCollection(sidebar, targetCollection);
    await expect(
      sidebar
        .locator('[data-testid="sidebar-collection-item-row"]')
        .filter({ hasText: requestName })
    ).toBeVisible({ timeout: 15_000 });

    const ocConfig = walkFiles(tmpDir).find((f) => path.basename(f) === 'opencollection.yml');
    expect(ocConfig, 'target collection opencollection.yml should exist').toBeTruthy();
    const targetDir = path.dirname(ocConfig as string);
    const pastedFile = fs
      .readdirSync(targetDir)
      .find((name) => name.toLowerCase().endsWith('.yml') && name !== 'opencollection.yml');
    expect(pastedFile, 'pasted request .yml file should exist in the target collection').toBeTruthy();

    // The pasted file must hold YAML (`info:`), not `.bru` syntax (`meta {`).
    const pastedContent = fs.readFileSync(path.join(targetDir, pastedFile as string), 'utf8');
    expect(pastedContent).toContain('info:');
    expect(pastedContent).not.toContain('meta {');

    // Collapse the source so the identically named source request leaves the DOM
    // and we open the pasted one.
    await collapseCollection(sidebar, sourceCollection);
    const editor = await openRequest(page, sidebar, targetCollection, requestName);
    await expect(editor.locator('#request-url')).toContainText(requestUrl, { timeout: 10_000 });
  });
});
