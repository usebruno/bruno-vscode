import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '../../utils/fixtures';
import {
  openBrunoSidebar,
  createCollection,
  createRequestByType,
  closeEditorTabIfOpen,
  createFolder,
  expandCollection,
  dragItemAboveOrBelow,
  findFilesWithName
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

test.describe('Reorder requests by drag and drop', () => {
  test('Dropping a request above another and below the last row saves the new order', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Reorder Collection';
    const requestNames = ['r1', 'r2', 'r3'];
    const rows = () => buildCommonLocators(sidebar).sidebar.collectionItems();

    const seqOf = (requestName: string) => {
      const [file] = findFilesWithName(tmpDir, `${requestName}.yml`);
      return Number(fs.readFileSync(file, 'utf8').match(/seq: (\d+)/)?.[1]);
    };

    await test.step('Create a collection with three requests', async () => {
      await createCollection(page, sidebar, collectionName, tmpDir);
      for (const requestName of requestNames) {
        await createRequestByType(page, sidebar, collectionName, { name: requestName, url: 'https://example.com' });
        await closeEditorTabIfOpen(page, requestName);
      }
      await expandCollection(sidebar, collectionName);
    });

    await test.step('Drop r3 above r1 and verify the new order in the sidebar and on disk', async () => {
      await dragItemAboveOrBelow(sidebar, 'r3', 'r1', 'above');
      await expect(rows()).toHaveText([/r3/, /r1/, /r2/]);
      await expect.poll(() => [seqOf('r3'), seqOf('r1'), seqOf('r2')]).toEqual([1, 2, 3]);
    });

    await test.step('Drop r3 below the last row (below r2) and verify the new order in the sidebar and on disk', async () => {
      await dragItemAboveOrBelow(sidebar, 'r3', 'r2', 'below');
      await expect(rows()).toHaveText([/r1/, /r2/, /r3/]);
      await expect.poll(() => [seqOf('r1'), seqOf('r2'), seqOf('r3')]).toEqual([1, 2, 3]);
    });
  });

  test('Dropping a folder above another and below the last row saves the new order', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Reorder Folders Collection';
    const folderNames = ['f1', 'f2', 'f3'];
    const rows = () => buildCommonLocators(sidebar).sidebar.collectionItems();

    const seqOf = (folderName: string) => {
      const file = findFilesWithName(tmpDir, 'folder.yml').find((f) => path.basename(path.dirname(f)) === folderName)!;
      return Number(fs.readFileSync(file, 'utf8').match(/seq: (\d+)/)?.[1]);
    };

    await test.step('Create a collection with three folders', async () => {
      await createCollection(page, sidebar, collectionName, tmpDir);
      for (const folderName of folderNames) {
        await createFolder(sidebar, collectionName, folderName);
      }
      await expandCollection(sidebar, collectionName);
    });

    await test.step('Drop f3 above f1 and verify the new order in the sidebar and on disk', async () => {
      await dragItemAboveOrBelow(sidebar, 'f3', 'f1', 'above');
      await expect(rows()).toHaveText([/f3/, /f1/, /f2/]);
      await expect.poll(() => [seqOf('f3'), seqOf('f1'), seqOf('f2')]).toEqual([1, 2, 3]);
    });

    await test.step('Drop f3 below the last row (below f2) and verify the new order in the sidebar and on disk', async () => {
      await dragItemAboveOrBelow(sidebar, 'f3', 'f2', 'below');
      await expect(rows()).toHaveText([/f1/, /f2/, /f3/]);
      await expect.poll(() => [seqOf('f1'), seqOf('f2'), seqOf('f3')]).toEqual([1, 2, 3]);
    });
  });
});
