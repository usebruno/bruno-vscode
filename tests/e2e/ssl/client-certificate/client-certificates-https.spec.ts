import { test, expect } from '../../utils/fixtures';
import {
  CLIENT_CERT,
  CLIENT_KEY,
  CLIENT_PFX,
  CLIENT_SUBJECT_CN,
  MTLS_URL,
  PFX_PASSPHRASE
} from './server/mtls-certs';
import {
  openBrunoSidebar,
  createCollection,
  createRequestByType,
  openRequest,
  sendRequest
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';
import { TLS_HANDSHAKE_FAILURE, addCertificate, storedCertPaths, openClientCertsTab } from './helpers';

const HTTPS_REQUEST = 'https-request';

test.describe('Collection client certificates - https', () => {
  test('a PEM cert/key is attached on https', async ({ page, tmpDir }) => {
    const collectionName = 'Certs Pem';
    const sidebar = await openBrunoSidebar(page);
    await createCollection(page, sidebar, collectionName, tmpDir);
    await createRequestByType(page, sidebar, collectionName, { name: HTTPS_REQUEST, url: MTLS_URL });

    await test.step('without a certificate the server rejects the request', async () => {
      const editor = await openRequest(page, sidebar, collectionName, HTTPS_REQUEST);
      const locators = buildCommonLocators(editor);
      await locators.sendRequest().click();
      const error = locators.response.error();
      await expect(error).toBeVisible();
      await expect(error).toHaveText(TLS_HANDSHAKE_FAILURE);
      await expect(locators.response.statusCode()).toHaveText(/^\s*0\s*$/);
    });

    await test.step('adding the certificate records it in the collection config', async () => {
      const settings = await openClientCertsTab(page, sidebar, collectionName);
      const locators = buildCommonLocators(settings);
      await expect(locators.clientCerts.emptyMessage()).toBeVisible();
      await addCertificate(page, settings, { certPath: CLIENT_CERT, keyPath: CLIENT_KEY });
      await expect.poll(() => storedCertPaths(tmpDir)).toHaveLength(2);
    });

    await test.step('https carries the certificate', async () => {
      const editor = await openRequest(page, sidebar, collectionName, HTTPS_REQUEST);
      const locators = buildCommonLocators(editor);
      await sendRequest(editor, 200);
      await expect(locators.response.previewContainer()).toContainText(CLIENT_SUBJECT_CN);
    });
  });

  test('a PFX bundle is attached on https', async ({ page, tmpDir }) => {
    const collectionName = 'Certs Pfx';
    const sidebar = await openBrunoSidebar(page);
    await createCollection(page, sidebar, collectionName, tmpDir);
    await createRequestByType(page, sidebar, collectionName, { name: HTTPS_REQUEST, url: MTLS_URL });
    const settings = await openClientCertsTab(page, sidebar, collectionName);
    await addCertificate(page, settings, { pfxPath: CLIENT_PFX, passphrase: PFX_PASSPHRASE });
    await expect.poll(() => storedCertPaths(tmpDir)).toHaveLength(1);
    const editor = await openRequest(page, sidebar, collectionName, HTTPS_REQUEST);
    await sendRequest(editor, 200);
    const locators = buildCommonLocators(editor);
    await expect(locators.response.previewContainer()).toContainText(CLIENT_SUBJECT_CN);
  });
});
