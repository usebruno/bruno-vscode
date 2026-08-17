import { test, expect } from '../../utils/fixtures';
import { CLIENT_CERT, CLIENT_KEY, CLIENT_SUBJECT_CN, MTLS_WS_URL } from './server/mtls-certs';
import {
  openBrunoSidebar,
  createCollection,
  createRequestByType,
  openWsRequest
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';
import { addCertificate, storedCertPaths, openClientCertsTab } from './helpers';

const WSS_REQUEST = 'wss-request';

test.describe('Collection client certificates - wss', () => {
  test('a PEM cert/key is attached on wss', async ({ page, tmpDir }) => {
    const collectionName = 'Certs Wss';
    const sidebar = await openBrunoSidebar(page);
    await createCollection(page, sidebar, collectionName, tmpDir);
    await createRequestByType(page, sidebar, collectionName, {
      name: WSS_REQUEST,
      url: MTLS_WS_URL,
      type: 'WebSocket'
    });

    await test.step('adding the certificate records it in the collection config', async () => {
      const settings = await openClientCertsTab(page, sidebar, collectionName);
      const locators = buildCommonLocators(settings);
      await expect(locators.clientCerts.emptyMessage()).toBeVisible();
      await addCertificate(page, settings, { certPath: CLIENT_CERT, keyPath: CLIENT_KEY });
      await expect.poll(() => storedCertPaths(tmpDir)).toHaveLength(2);
    });

    await test.step('wss carries the certificate', async () => {
      const editor = await openWsRequest(page, sidebar, collectionName, WSS_REQUEST);
      const ws = buildCommonLocators(editor).ws;
      await ws.connectButton().click();
      await expect(ws.incomingMessage().first()).toContainText(CLIENT_SUBJECT_CN);
    });
  });
});
