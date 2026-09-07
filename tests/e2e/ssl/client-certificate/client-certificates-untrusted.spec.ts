import { test, expect } from '../../utils/fixtures';
import {
  MTLS_URL,
  UNTRUSTED_CLIENT_CERT,
  UNTRUSTED_CLIENT_KEY
} from './server/mtls-certs';
import {
  openBrunoSidebar,
  createCollection,
  createRequestByType,
  openRequest,
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';
import {
  TLS_HANDSHAKE_FAILURE,
  addCertificate,
  storedCertPaths,
  openClientCertsTab
} from './helpers';

const HTTPS_REQUEST = 'https-request';

test.describe('Collection client certificates - untrusted', () => {
  test('an untrusted PEM cert/key is rejected at the handshake', async ({ page, tmpDir }) => {
    const collectionName = 'Certs Untrusted';
    const sidebar = await openBrunoSidebar(page);
    await createCollection(page, sidebar, collectionName, tmpDir);
    await createRequestByType(page, sidebar, collectionName, { name: HTTPS_REQUEST, url: MTLS_URL });

    await test.step('adding the untrusted certificate records it in the collection config', async () => {
      const settings = await openClientCertsTab(page, sidebar, collectionName);
      const locators = buildCommonLocators(settings);
      await expect(locators.clientCerts.emptyMessage()).toBeVisible();
      await addCertificate(page, settings, { certPath: UNTRUSTED_CLIENT_CERT, keyPath: UNTRUSTED_CLIENT_KEY });
      await expect.poll(() => storedCertPaths(tmpDir)).toHaveLength(2);
    });

    await test.step('the server rejects the request and the error surfaces', async () => {
      const editor = await openRequest(page, sidebar, collectionName, HTTPS_REQUEST);
      const locators = buildCommonLocators(editor);
      await locators.sendRequest().click();
      const error = locators.response.error();
      await expect(error).toBeVisible();
      await expect(error).toHaveText(TLS_HANDSHAKE_FAILURE);
      await expect(locators.response.statusCode()).toHaveText(/^\s*0\s*$/);
    });
  });
});
