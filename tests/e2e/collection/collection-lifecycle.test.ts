import { createSetup, type CollectionSettingsConfig } from '../e2e-helper';
import { expect, test } from '../utils/fixtures';
import {
  cloneRequest,
  deleteRequest,
  exportCollection,
  exportedRequestPaths,
  moveRequestToFolder,
  openCollectionRunner,
  openCollectionSettings,
  openRequestPaneTab,
  runCollection,
  setCollectionHeaders,
  setCollectionVars,
  takeScreenshot,
  toKeyValue
} from '../utils/page/actions';
import { buildCommonLocators } from '../utils/page/locators';
import { parseCollection } from '@usebruno/filestore';

// Render showOpenDialog/showSaveDialog as a quick input so the folder picker and save dialog can be driven,
// and modal messages (e.g. delete confirmation) in the workbench DOM instead of as native OS dialogs.
test.use({ vscodeSettings: { 'files.simpleDialog.enable': true, 'window.dialogStyle': 'custom' } });

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

test('Collection lifecycle: settings, vars, headers, run request, clone, delete, move, run collection, export', async ({ page }) => {
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
  }, page)

  // What should be left after the clone, delete and move below.
  const remainingPaths = ['folder-1/request-1', 'request-1-clone', 'graphql-1'];

  const sidebarElements = buildCommonLocators(sidebar).sidebar;

  await test.step('Clone request-1', async () => {
    await cloneRequest(page, sidebar, COLLECTION, 'request-1')
    await expect(sidebarElements.collectionItem('request-1-clone')).toBeVisible();
  });

  await test.step('Clone graphql-1', async () => {
    await cloneRequest(page, sidebar, COLLECTION, 'graphql-1')
    await expect(sidebarElements.collectionItem('graphql-1-clone')).toBeVisible();
  });

  await test.step('Delete graphql-1-clone', async () => {
    await deleteRequest(page, sidebar, COLLECTION, 'graphql-1-clone')
    await expect(sidebarElements.collectionItem('graphql-1-clone')).toHaveCount(0);
  });

  await test.step('Move request-1 into folder-1', async () => {
    await moveRequestToFolder(sidebar, COLLECTION, 'request-1', 'folder-1')
    await expect(sidebarElements.folderChild('folder-1', 'request-1')).toBeVisible();
  });

  await test.step('Edit collection settings', async () => {
    const settings = await openCollectionSettings(page, sidebar, COLLECTION);
    await openRequestPaneTab(settings, 'Overview');
    await expect(buildCommonLocators(settings).collectionSettings.requestsInfo()).toHaveText(`${remainingPaths.length} requests in collection`);

    await setCollectionVars(page, settings, updatedSettings.vars);
    await setCollectionHeaders(page, settings, updatedSettings.headers);
  });

  await test.step('Run collection', async () => {
    const runner = await openCollectionRunner(page, sidebar, COLLECTION);
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
    expect(toKeyValue(collectionRoot?.request?.vars?.req)).toEqual({ ...settings.vars, ...updatedSettings.vars });
    expect(toKeyValue(collectionRoot?.request?.headers)).toEqual({ ...settings.headers, ...updatedSettings.headers });
    expect(brunoConfig?.presets?.requestUrl).toBe(settings.presets!.requestUrl);
  });

  await test.step('Screenshot', async () => {
    await takeScreenshot(page, test)
  });
})
