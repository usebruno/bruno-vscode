import { createSetup, type CollectionSettingsConfig } from '../e2e-helper';
import { expect, test } from '../utils/fixtures';
import {
  cloneRequest,
  deleteRequest,
  dragItem,
  expandFolder,
  exportCollection,
  exportedRequestPaths,
  openCollectionRunner,
  openCollectionSettings,
  openRequestPaneTab,
  runCollection,
  takeScreenshot,
  toKeyValue,
  toRows,
  updateHeaders,
  updateVars
} from '../utils/page/actions';
import { buildCommonLocators } from '../utils/page/locators';
import { parseCollection } from '@usebruno/filestore';

const COLLECTION = 'collection-1';
const TEST_SERVER = 'https://testbench-sanity.usebruno.com';
const GRAPHQL_QUERY = '{ ping }';

const settings: CollectionSettingsConfig = {
  vars: {
    host: TEST_SERVER,
    apiVersion: 'version-initial',
  },
  headers: {
    'x-lifecycle': 'header-initial',
  },
  presets: { requestUrl: TEST_SERVER },
};

const updatedSettings = {
  vars: { apiVersion: 'version-updated' },
  headers: { 'x-lifecycle': 'header-updated' },
};

test('Collection lifecycle: settings, vars, headers, run request, clone, delete, move, run collection, export', async ({ page, tmpDir }) => {
  const { sidebar, ctx } = await createSetup({
    collections: [
      {
        name: COLLECTION,
        format: 'yml',
        ...settings,
        folders: [{ name: 'folder-1' }],
        requests: [
          {
            name: 'request-1',
            url: '{{host}}/ping',
            type: 'HTTP',
            method: 'GET',
            run: true,
            env: 'prod',
          },
          {
            // The testbench has no GraphQL server; a GraphQL request is a POST of `{ query, variables }`, which this echoes back.
            name: 'graphql-1',
            url: '{{host}}/api/echo/json',
            type: 'GraphQL',
            method: 'POST',
            payload: GRAPHQL_QUERY,
            run: true,
            env: 'prod',
          }
        ],
      }
    ],
    envs: [
      {
        name: 'local',
        vars: []
      },
      {
        name: 'prod',
        vars: []
      }
    ]
  }, page, tmpDir)

  // What should be left after the clone, delete and move below.
  const remainingPaths = ['folder-1/request-1', 'request-1 copy', 'graphql-1'];

  const sidebarElements = buildCommonLocators(sidebar).sidebar;

  await test.step('Clone request-1', async () => {
    await cloneRequest(sidebar, COLLECTION, 'request-1')
    await expect(sidebarElements.collectionItem('request-1 copy')).toBeVisible();
  });

  await test.step('Clone graphql-1', async () => {
    await cloneRequest(sidebar, COLLECTION, 'graphql-1')
    await expect(sidebarElements.collectionItem('graphql-1 copy')).toBeVisible();
  });

  await test.step('Delete graphql-1 copy', async () => {
    await deleteRequest(sidebar, COLLECTION, 'graphql-1 copy')
    await expect(sidebarElements.collectionItem('graphql-1 copy')).toHaveCount(0);
  });

  await test.step('Move request-1 into folder-1', async () => {
    await dragItem(page, { dragItem: 'request-1', target: 'folder-1', position: 'inside' })
    await expandFolder(sidebar, 'folder-1')
    // The tree nests the request one level below its folder.
    const folderLevel = Number(await sidebarElements.folder('folder-1').getAttribute('aria-level'))
    await expect(sidebarElements.collectionItem('request-1')).toHaveAttribute('aria-level', String(folderLevel + 1));
  });

  await test.step('Edit collection settings', async () => {
    const settings = await openCollectionSettings(sidebar, COLLECTION);
    await openRequestPaneTab(settings, 'Overview');
    await expect(buildCommonLocators(settings).collectionSettings.requestsInfo()).toHaveText(`${remainingPaths.length} requests in collection`);

    await updateVars(page, COLLECTION, toRows(updatedSettings.vars, ['name', 'value']));
    await updateHeaders(page, COLLECTION, toRows(updatedSettings.headers, ['name', 'value']));
  });

  await test.step('Run collection', async () => {
    const runner = await openCollectionRunner(sidebar, COLLECTION);
    const runnerElements = buildCommonLocators(runner).runner;
    await expect(runnerElements.requestCountText()).toContainText(String(remainingPaths.length));
    await runCollection(runner);

    for (const requestPath of remainingPaths) {
      await expect(runnerElements.resultByPath(requestPath)).toBeVisible();
    }

    await expect(runnerElements.filterButton('All')).toContainText(String(remainingPaths.length));
    await expect(runnerElements.filterButton('Passed')).toContainText(String(remainingPaths.length));
    await expect(runnerElements.filterButton('Failed')).toContainText('0');
  });

  await test.step('Export collection', async () => {
    const exported = await exportCollection(page, sidebar, ctx, COLLECTION)
    expect(exportedRequestPaths(Object.keys(exported), 'yml').sort()).toEqual(remainingPaths.sort());

    // Collection settings live in the exported opencollection.yml
    const { collectionRoot, brunoConfig } = parseCollection(exported['opencollection.yml'], { format: 'yml' });
    expect(toKeyValue(collectionRoot?.request?.vars?.req, ['name', 'value'])).toEqual({ ...settings.vars, ...updatedSettings.vars });
    expect(toKeyValue(collectionRoot?.request?.headers, ['name', 'value'])).toEqual({ ...settings.headers, ...updatedSettings.headers });
    expect(brunoConfig?.presets?.requestUrl).toBe(settings.presets!.requestUrl);
  });

  await test.step('Screenshot', async () => {
    await takeScreenshot(page, test)
  });
})
