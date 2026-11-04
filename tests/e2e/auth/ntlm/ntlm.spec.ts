import * as path from 'path';
import { test, expect } from '../../utils/fixtures';
import {
  openBrunoSidebar,
  importCollection,
  openRequest,
  sendRequest,
  closeEditorTab,
  selectResponsePaneTab
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';
import { startNtlmServer, type NtlmEndpoint } from '../../server/auth/ntlm';

const PASSWORD = 'Br!unoNtlm';
// The fixture's request URLs point at this port.
const NTLM_PORT = 8091;

// Each step gets its own server so the requests it records belong to that step alone.
async function withNtlmServer(options: Parameters<typeof startNtlmServer>[0], run: (endpoint: NtlmEndpoint) => Promise<void>): Promise<void> {
  const endpoint = await startNtlmServer({ password: PASSWORD, port: NTLM_PORT, ...options });
  try {
    await run(endpoint);
  } finally {
    await endpoint.close();
  }
}

test.describe('NTLM auth', () => {
  test('authenticates requests with NTLM', async ({ page, tmpDir }) => {
    const collectionName = 'NTLM';
    const sidebar = await openBrunoSidebar(page);
    await importCollection(page, sidebar, path.resolve(__dirname, 'fixtures/ntlm-collection.json'), tmpDir, collectionName);
    // Each request opens in its own webview, which would cover the next one's Send button, so close it first.
    let openTab: string | undefined;
    const sendTo = async (requestName: string, expectedStatus: number) => {
      if (openTab) {
        await closeEditorTab(page, openTab);
      }
      openTab = requestName;
      const editor = await openRequest(page, sidebar, collectionName, requestName);
      await sendRequest(editor, expectedStatus);
      return editor;
    };

    await test.step('negotiates and authenticates over a single connection', async () => {
      await withNtlmServer({}, async (endpoint) => {
        const editor = await sendTo('api', 200);
        await expect(buildCommonLocators(editor).response.previewContainer()).toContainText('authenticated');

        expect(endpoint.messageTypesSeen()).toEqual([null, 1, 3]);
        expect(endpoint.requests.map((request) => request.authenticated)).toEqual([undefined, undefined, true]);
        expect(endpoint.connectionsUsed()).toBe(1);
      });
    });

    await test.step('is refused when the password is wrong', async () => {
      await withNtlmServer({}, async (endpoint) => {
        await sendTo('wrong-password', 401);

        expect(endpoint.messageTypesSeen()).toEqual([null, 1, 3]);
        expect(endpoint.requests.map((request) => request.authenticated)).toEqual([undefined, undefined, false]);
      });
    });

    await test.step('uses NTLM auth inherited from the collection', async () => {
      await withNtlmServer({}, async (endpoint) => {
        await sendTo('inherited', 200);

        expect(endpoint.messageTypesSeen()).toEqual([null, 1, 3]);
        expect(endpoint.requests.map((request) => request.authenticated)).toEqual([undefined, undefined, true]);
      });
    });

    await test.step('sends the body on every request of the handshake', async () => {
      await withNtlmServer({}, async (endpoint) => {
        await sendTo('body', 200);

        expect(endpoint.messageTypesSeen()).toEqual([null, 1, 3]);
        expect(endpoint.requests.map((request) => JSON.parse(request.body))).toEqual([
          { hello: 'world' }, { hello: 'world' }, { hello: 'world' }
        ]);
      });
    });

    await test.step('negotiates again after a same host redirect and only sends X-retry with the finished message', async () => {
      await withNtlmServer({}, async (endpoint) => {
        const editor = await sendTo('redirect', 200);
        await expect(buildCommonLocators(editor).response.previewContainer()).toContainText('/landing');

        expect(endpoint.messageTypesSeen()).toEqual([null, 1, 3, null, 1, 3]);
        const carryingRetry = endpoint.requests.filter((request) => request.headers['x-retry'] !== undefined);
        expect(carryingRetry.map((request) => request.type)).toEqual([3, 3]);
      });
    });

    await test.step('logs the NTLM handshake on the timeline', async () => {
      await withNtlmServer({}, async () => {
        const editor = await sendTo('timeline', 200);

        await selectResponsePaneTab(page, 'Timeline');
        const { timeline } = buildCommonLocators(editor);
        const entry = timeline.lastItem();
        await timeline.itemHeader(entry).click();
        await timeline.networkTab(entry).click();
        const logs = timeline.networkPanel(entry);
        // "TlRMTVNTUAAB" and "TlRMTVNTUAAD" are base64 for the NTLMSSP type 1 and type 3 messages.
        await expect(logs).toContainText('Authorization: NTLM TlRMTVNTUAAB');
        await expect(logs).toContainText('Authorization: NTLM TlRMTVNTUAAD');
        await expect(logs).toContainText('HTTP/1.1 200 OK');
      });
    });

    await test.step('negotiates and authenticates over a single TLS connection', async () => {
      await withNtlmServer({ tls: true }, async (endpoint) => {
        await sendTo('https', 200);

        expect(endpoint.messageTypesSeen()).toEqual([null, 1, 3]);
        expect(endpoint.requests.map((request) => request.authenticated)).toEqual([undefined, undefined, true]);
        expect(endpoint.connectionsUsed()).toBe(1);
      });
    });
  });
});
