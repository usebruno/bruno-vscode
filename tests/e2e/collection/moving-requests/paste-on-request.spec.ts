import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '../../utils/fixtures';
import { buildCommonLocators } from '../../utils/page/locators';
import {
  openBrunoSidebar,
  createCollection,
  createRequestByType,
  copyItem,
  pasteOntoItem,
  findCollectionDir,
} from '../../utils/page/actions';

const TEST_SERVER = 'http://127.0.0.1:8081';

test.describe('Paste on a request', () => {
  test('pasting with a request row focused puts the copy beside it', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Paste Target';
    const requestName = 'Ping';

    await createCollection(sidebar, collectionName, tmpDir, 'bru');
    await createRequestByType(sidebar, collectionName, { name: requestName, url: `${TEST_SERVER}/ping` });

    await copyItem(sidebar, requestName);
    await pasteOntoItem(sidebar, requestName);

    await expect(buildCommonLocators(sidebar).sidebar.collectionItem(`${requestName} copy`)).toBeVisible({ timeout: 15_000 });

    const collectionDir = findCollectionDir(tmpDir);

    expect(fs.existsSync(path.join(collectionDir, `${requestName} copy.bru`))).toBe(true);
  });
});
