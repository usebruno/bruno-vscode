import { expect, test } from '../utils/fixtures';
import { createSetup, type CollectionSettingsConfig } from '../e2e-helper';
import {
  cloneRequest,
  deleteRequest,
  editCollectionSettings,
  exportCollection,
  exportedRequestPaths,
  moveRequest,
  openCollectionRunner,
  runCollection,
  takeScreenshot
} from '../utils/page/actions';
import { buildCommonLocators } from '../utils/page/locators';

// Render showOpenDialog/showSaveDialog as a quick input so the folder picker and save dialog can be driven,
// and modal messages (e.g. delete confirmation) in the workbench DOM instead of as native OS dialogs.
test.use({ vscodeSettings: { 'files.simpleDialog.enable': true, 'window.dialogStyle': 'custom' } });

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

const updatedSettings: CollectionSettingsConfig = {
  vars: { apiVersion: 'version-updated' },
  headers: { 'x-lifecycle': 'header-updated' },
};

test('Collection lifecycle: settings, vars, headers, run request, clone, delete, move, run collection, export', async ({ page }) => {
  const { sidebar, ctx } = await createSetup({
    collections: [
      {
        name: 'collection-1',
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

  await test.step('Clone request-1', async () => {
    await cloneRequest(page, sidebar, ctx!, 'request-1', 'yml')
  });

  await test.step('Clone graphql-1', async () => {
    await cloneRequest(page, sidebar, ctx!, 'graphql-1', 'yml')
  });

  await test.step('Delete graphql-1-clone', async () => {
    await deleteRequest(page, sidebar, ctx!, 'graphql-1-clone', 'yml')
  });

  await test.step('Move request-1 into folder-1', async () => {
    await moveRequest(sidebar, ctx!, 'request-1', 'folder-1', 'yml')
  });

  await test.step('Edit collection settings', async () => {
    await editCollectionSettings(page, sidebar, ctx!, updatedSettings, remainingPaths.length, 'yml');
  });

  await test.step('Run collection', async () => {
    const runner = await openCollectionRunner(page, sidebar, ctx!.collectionName);
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
    const exported = await exportCollection(page, sidebar, ctx!)
    expect(exportedRequestPaths(exported, 'yml').sort()).toEqual(remainingPaths.sort());
  });

  await test.step('Screenshot', async () => {
    await takeScreenshot(page, test)
  });
})
