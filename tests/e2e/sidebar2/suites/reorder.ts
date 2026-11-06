import { expect, type Page } from '@playwright/test';
import { dragItem, sidebarLocators } from '../../utils/page/actions';
import type { Workspace } from '../../e2e-helper';

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

async function reorderRequests(page: Page) {
  const requestRows = (await sidebarLocators(page)).sidebar.collectionItems().filter({ hasText: /r\d/ });

  // Drop r3 above r1
  await dragItem(page, { dragItem: 'r3', target: 'r1', position: 'above' });
  await expect(requestRows).toHaveText([/r3/, /r1/, /r2/]);

  // Drop r3 below the last request (below r2)
  await dragItem(page, { dragItem: 'r3', target: 'r2', position: 'below' });
  await expect(requestRows).toHaveText([/r1/, /r2/, /r3/]);
}

async function reorderFolders(page: Page) {
  const folderRows = (await sidebarLocators(page)).sidebar.collectionItems().filter({ hasText: /f\d/ });

  // Drop f3 above f1
  await dragItem(page, { dragItem: 'f3', target: 'f1', position: 'above' });
  await expect(folderRows).toHaveText([/f3/, /f1/, /f2/]);

  // Drop f3 below the last folder (below f2)
  await dragItem(page, { dragItem: 'f3', target: 'f2', position: 'below' });
  await expect(folderRows).toHaveText([/f1/, /f2/, /f3/]);
}

export async function run(page: Page) {
  await reorderRequests(page);
  await reorderFolders(page);
}
