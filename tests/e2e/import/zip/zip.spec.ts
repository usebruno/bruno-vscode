import * as fs from 'node:fs';
import * as path from 'node:path';
import AdmZip from 'adm-zip';

import { test, expect } from '../../utils/fixtures';
import { openBrunoSidebar, openImportReview } from '../../utils/page/actions';

// The "Yml With Version" collection, zipped under a folder the way the Bruno app exports it.
const FIXTURE_DIR = path.resolve(__dirname, '../../collection/open/fixtures/yml-with-version');
const COLLECTION_NAME = 'Yml With Version';

test.describe('Import zipped collection', () => {
  test('unpacks a zipped Bruno collection as it is', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);

    const zipPath = path.join(tmpDir, 'yml-with-version.zip');
    const zip = new AdmZip();
    zip.addLocalFolder(FIXTURE_DIR, 'yml-with-version');
    zip.writeZip(zipPath);

    const importDir = path.join(tmpDir, 'imported');
    fs.mkdirSync(importDir);

    const review = await openImportReview(sidebar, [zipPath]);
    await expect(review.row(COLLECTION_NAME)).toBeVisible();
    await expect(review.row(COLLECTION_NAME)).toContainText('Bruno zip');

    // A zip keeps its format, so no format prompt follows the location.
    await review.submit(importDir);

    await expect(sidebar.locators.collectionName(COLLECTION_NAME)).toBeVisible({ timeout: 20_000 });

    const collectionDir = path.join(importDir, COLLECTION_NAME);
    expect(fs.readFileSync(path.join(collectionDir, 'opencollection.yml'), 'utf8'))
      .toBe(fs.readFileSync(path.join(FIXTURE_DIR, 'opencollection.yml'), 'utf8'));
    expect(fs.existsSync(path.join(collectionDir, 'ping.yml'))).toBe(true);
  });
});
