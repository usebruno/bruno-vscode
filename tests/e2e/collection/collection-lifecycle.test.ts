import { test } from '../utils/fixtures';
import { performE2E } from '../e2e-helper';
import { takeScreenshot } from '../utils/page/actions';

// Render showOpenDialog/showSaveDialog as a quick input so the folder picker and save dialog can be driven,
// and modal messages (e.g. delete confirmation) in the workbench DOM instead of as native OS dialogs.
test.use({ vscodeSettings: { 'files.simpleDialog.enable': true, 'window.dialogStyle': 'custom' } });


test('T1: create, run request, delete request, export', async ({ page }) => {
  await performE2E({
    collections: [
      {
        name: 'collection-1',
        format: 'yml',
        requests: [
          {
            name: 'request-1',
            url: 'https://testbench-sanity.usebruno.com/ping',
            type: 'HTTP',
            method: 'GET',
            run: true,
            env: 'prod',
          },
          {
            name: 'request-2',
            url: 'https://testbench-sanity.usebruno.com/ping',
            type: 'HTTP',
            method: 'GET',
            run: true,
            env: 'prod',
            delete: true,
          }
        ],
        export: true,
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

  await test.step('Screenshot', async () => {
    await takeScreenshot(page, test)
  });
})

