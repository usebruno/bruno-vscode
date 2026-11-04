import * as fs from 'fs';
import * as path from 'path';
import { expect } from '@playwright/test';
import { dragItemAboveOrBelow, expandCollection, sidebar, collectionPath } from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';
import { Workspace } from '../../e2e-helper';

export const desc = 'Dropping a request or a folder above another and below the last row saves the new order';

export const workspace: Workspace = {
  collections: [
    {
      name: 'reorder-collection',
      format: 'yml',
      folders: [
        { name: 'f1' },
        { name: 'f2' },
        { name: 'f3' },
      ],
      requests: [
        { name: 'r1', url: 'https://example.com', type: 'HTTP', method: 'GET' },
        { name: 'r2', url: 'https://example.com', type: 'HTTP', method: 'GET' },
        { name: 'r3', url: 'https://example.com', type: 'HTTP', method: 'GET' },
      ],
    },
  ],
};

const requestSeq = (name: string) => Number(fs.readFileSync(path.join(collectionPath, `${name}.yml`), 'utf8').match(/seq: (\d+)/)?.[1]);
const folderSeq = (name: string) => Number(fs.readFileSync(path.join(collectionPath, name, 'folder.yml'), 'utf8').match(/seq: (\d+)/)?.[1]);

async function reorderRequests() {
  const requestRows = buildCommonLocators(sidebar).sidebar.collectionItems().filter({ hasText: /r\d/ });

  // Drop r3 above r1
  await dragItemAboveOrBelow(sidebar, 'r3', 'r1', 'above');
  await expect(requestRows).toHaveText([/r3/, /r1/, /r2/]);
  await expect.poll(() => [requestSeq('r3'), requestSeq('r1'), requestSeq('r2')]).toEqual([1, 2, 3]);

  // Drop r3 below the last request (below r2)
  await dragItemAboveOrBelow(sidebar, 'r3', 'r2', 'below');
  await expect(requestRows).toHaveText([/r1/, /r2/, /r3/]);
  await expect.poll(() => [requestSeq('r1'), requestSeq('r2'), requestSeq('r3')]).toEqual([1, 2, 3]);
}

async function reorderFolders() {
  const folderRows = buildCommonLocators(sidebar).sidebar.collectionItems().filter({ hasText: /f\d/ });

  // Drop f3 above f1
  await dragItemAboveOrBelow(sidebar, 'f3', 'f1', 'above');
  await expect(folderRows).toHaveText([/f3/, /f1/, /f2/]);
  await expect.poll(() => [folderSeq('f3'), folderSeq('f1'), folderSeq('f2')]).toEqual([1, 2, 3]);

  // Drop f3 below the last folder (below f2)
  await dragItemAboveOrBelow(sidebar, 'f3', 'f2', 'below');
  await expect(folderRows).toHaveText([/f1/, /f2/, /f3/]);
  await expect.poll(() => [folderSeq('f1'), folderSeq('f2'), folderSeq('f3')]).toEqual([1, 2, 3]);
}

export async function run() {
  await expandCollection(sidebar, 'reorder-collection');
  await reorderRequests();
  await reorderFolders();
}
