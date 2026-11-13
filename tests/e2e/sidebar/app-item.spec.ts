import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '../utils/fixtures';
import { openBrunoSidebar, createCollection, expandCollection, findCollectionDir } from '../utils/page/actions';
import { buildCommonLocators } from '../utils/page/locators';

test.describe('App items', () => {
  test('an app file shows in the tree beside the requests', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'With App';

    await createCollection(sidebar, collectionName, tmpDir, 'bru');

    const appFile = path.join(findCollectionDir(tmpDir), 'Dashboard.bru');
    fs.writeFileSync(appFile, 'meta {\n  name: Dashboard\n  type: app\n  seq: 1\n}\n\napp {\n  code: console.log(1)\n}\n');

    await expandCollection(sidebar, collectionName);
    await expect(buildCommonLocators(sidebar).sidebar.collectionItem('Dashboard')).toBeVisible({ timeout: 15_000 });
  });
});
