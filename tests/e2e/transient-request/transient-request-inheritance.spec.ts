import * as path from 'path';
import { test, expect } from '../utils/fixtures';
import {
  openBrunoSidebar,
  importCollection,
  openTransientRequest,
  selectEnvironment,
  setCodeMirrorValue,
  sendRequest
} from '../utils/page/actions';
import { buildCommonLocators } from '../utils/page/locators';

/**
 * A transient request is created from the collection's "+" menu and never touches
 * disk, so everything it inherits has to be pushed into its own panel: the collection
 * root (headers / vars / auth), the environments, and the presets.
 */

const SERVER = 'http://127.0.0.1:8081';
const FIXTURE = path.resolve(__dirname, 'fixtures/transient-inheritance-collection.json');
const COLLECTION = 'Transient Inheritance';

test.describe('Transient request inherits collection-level settings', () => {
  test('inherits presets, environments, vars, headers and auth', async ({ page, tmpDir }) => {
    // One launch + an import + four sends does not fit the default per-test budget.
    test.slow();

    const panel = await test.step('create a transient request in the collection', async () => {
      const sidebar = await openBrunoSidebar(page);
      await importCollection(page, sidebar, FIXTURE, tmpDir, COLLECTION);
      return openTransientRequest(page, sidebar, COLLECTION);
    });

    const locators = buildCommonLocators(panel);
    const env = locators.environment;
    const url = locators.requestUrl.editor().locator('.CodeMirror');
    const response = locators.response.previewContainer();

    await test.step('seeds the URL from the collection base-URL preset', async () => {
      await expect(locators.requestUrl.editor()).toContainText('/api/echo/query');
      await expect(locators.requestUrl.editor()).toContainText('{{collectionVar}}');
      await expect(locators.requestUrl.editor()).toContainText('{{envHost}}');
    });

    await test.step('lists the collection environments in the picker', async () => {
      await expect(env.inactiveLabel()).toBeVisible();
      await env.trigger().click();

      await expect(env.item('Local')).toBeVisible();
      await expect(env.item('Staging')).toBeVisible();
      await expect(env.items()).toHaveCount(2);
      await expect(env.emptyState()).toHaveCount(0);

      // Close it again so the next step opens from a known state.
      await env.trigger().click();
      await expect(env.items()).toHaveCount(0);
    });

    await test.step('sends with the collection var and the selected environment', async () => {
      await selectEnvironment(panel, 'Local');
      await sendRequest(panel, 200);
      await expect(response).toContainText('from-collection-vars');
      await expect(response).toContainText('local-env-value');
    });

    await test.step('re-interpolates after switching environment', async () => {
      await selectEnvironment(panel, 'Staging');
      await sendRequest(panel, 200);
      await expect(response).toContainText('staging-env-value');
    });

    await test.step('attaches the collection-level header', async () => {
      await setCodeMirrorValue(page, url, `${SERVER}/api/echo/header`);
      await sendRequest(panel, 200);
      await expect(response).toContainText('from-collection-root');
    });

    await test.step('applies collection-level auth through inherit mode', async () => {
      await setCodeMirrorValue(page, url, `${SERVER}/api/echo/auth`);
      await sendRequest(panel, 200);
      await expect(response).toContainText('Bearer collection-root-token');
    });
  });
});
