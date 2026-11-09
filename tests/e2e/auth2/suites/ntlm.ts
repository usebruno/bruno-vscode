import { expect, type Page } from '@playwright/test';
import type { Workspace } from '../../e2e-helper';
import { setAuth, setBody } from '../../utils/page/actions';
import { sendRequestAndVerify, verifyResponsePane } from '../../utils/page/assertions';
import { startNtlmServer, type NtlmEndpoint } from '../../server/auth/ntlm';

export const desc = 'NTLM authenticates over one connection, is refused with a wrong password, and works inherited, with a body, a redirect and TLS';

const PASSWORD = 'Br!unoNtlm';
const NTLM_PORT = 8091;
const NTLM_URL = `http://127.0.0.1:${NTLM_PORT}`;
const credentials = { username: 'ntlmtest', password: PASSWORD };

export const workspace: Workspace = {
  collections: [
    {
      name: 'ntlm-collection',
      format: 'yml',
      requests: [
        { name: 'api', url: `${NTLM_URL}/api`, type: 'HTTP', method: 'GET' },
        { name: 'wrong-password', url: `${NTLM_URL}/api`, type: 'HTTP', method: 'GET' },
        { name: 'inherited', url: `${NTLM_URL}/api`, type: 'HTTP', method: 'GET', auth: 'inherit' },
        { name: 'body', url: `${NTLM_URL}/api`, type: 'HTTP', method: 'POST' },
        { name: 'redirect', url: `${NTLM_URL}/redirect?to=${NTLM_URL}/landing`, type: 'HTTP', method: 'GET' },
        { name: 'timeline', url: `${NTLM_URL}/api`, type: 'HTTP', method: 'GET' },
        { name: 'https', url: `${NTLM_URL.replace('http:', 'https:')}/api`, type: 'HTTP', method: 'GET' },
      ],
    },
  ],
};

// Each step gets its own server, so the requests it records belong to that step alone
async function withNtlmServer(options: Parameters<typeof startNtlmServer>[0], run: (endpoint: NtlmEndpoint) => Promise<void>) {
  const endpoint = await startNtlmServer({ password: PASSWORD, port: NTLM_PORT, ...options });
  try {
    await run(endpoint);
  } finally {
    await endpoint.close();
  }
}

async function setUpAuth(page: Page) {
  await setAuth(page, 'ntlm-collection', 'ntlm', credentials);
  for (const request of ['api', 'redirect', 'timeline', 'https']) {
    await setAuth(page, request, 'ntlm', credentials);
  }
  await setAuth(page, 'wrong-password', 'ntlm', { ...credentials, password: 'notThePassword' });

  await setAuth(page, 'body', 'ntlm', credentials);
  await setBody(page, 'body', '{"hello":"world"}');
}

async function verifyHandshake(page: Page) {
  await withNtlmServer({}, async (endpoint) => {
    await sendRequestAndVerify(page, 'api', 200);
    await verifyResponsePane(page, 'api', { tab: 'Response' }, { contains: ['authenticated'] });

    expect(endpoint.messageTypesSeen()).toEqual([null, 1, 3]);
    expect(endpoint.requests.map((request) => request.authenticated)).toEqual([undefined, undefined, true]);
    expect(endpoint.connectionsUsed()).toBe(1);
  });
}

async function verifyWrongPassword(page: Page) {
  await withNtlmServer({}, async (endpoint) => {
    await sendRequestAndVerify(page, 'wrong-password', 401);

    expect(endpoint.messageTypesSeen()).toEqual([null, 1, 3]);
    expect(endpoint.requests.map((request) => request.authenticated)).toEqual([undefined, undefined, false]);
  });
}

async function verifyAuthInheritanceFromCollection(page: Page) {
  await withNtlmServer({}, async (endpoint) => {
    await sendRequestAndVerify(page, 'inherited', 200);

    expect(endpoint.messageTypesSeen()).toEqual([null, 1, 3]);
    expect(endpoint.requests.map((request) => request.authenticated)).toEqual([undefined, undefined, true]);
  });
}

async function verifyBodyOnEveryRequest(page: Page) {
  await withNtlmServer({}, async (endpoint) => {
    await sendRequestAndVerify(page, 'body', 200);

    expect(endpoint.messageTypesSeen()).toEqual([null, 1, 3]);
    expect(endpoint.requests.map((request) => JSON.parse(request.body))).toEqual([
      { hello: 'world' }, { hello: 'world' }, { hello: 'world' },
    ]);
  });
}

async function verifyRedirect(page: Page) {
  await withNtlmServer({}, async (endpoint) => {
    await sendRequestAndVerify(page, 'redirect', 200);
    await verifyResponsePane(page, 'redirect', { tab: 'Response' }, { contains: ['/landing'] });

    expect(endpoint.messageTypesSeen()).toEqual([null, 1, 3, null, 1, 3]);
    const carryingRetry = endpoint.requests.filter((request) => request.headers['x-retry'] !== undefined);
    expect(carryingRetry.map((request) => request.type)).toEqual([3, 3]);
  });
}

async function verifyTimelineLogsHandshake(page: Page) {
  await withNtlmServer({}, async () => {
    await sendRequestAndVerify(page, 'timeline', 200);

    await verifyResponsePane(page, 'timeline', { tab: 'Timeline', section: 'Network' }, {
      contains: ['Authorization: NTLM TlRMTVNTUAAB', 'Authorization: NTLM TlRMTVNTUAAD', 'HTTP/1.1 200 OK'],
    });
  });
}

async function verifyTls(page: Page) {
  await withNtlmServer({ tls: true }, async (endpoint) => {
    await sendRequestAndVerify(page, 'https', 200);

    expect(endpoint.messageTypesSeen()).toEqual([null, 1, 3]);
    expect(endpoint.requests.map((request) => request.authenticated)).toEqual([undefined, undefined, true]);
    expect(endpoint.connectionsUsed()).toBe(1);
  });
}

export async function run(page: Page) {
  await setUpAuth(page);
  await verifyHandshake(page);
  await verifyWrongPassword(page);
  await verifyAuthInheritanceFromCollection(page);
  await verifyBodyOnEveryRequest(page);
  await verifyRedirect(page);
  await verifyTimelineLogsHandshake(page);
  await verifyTls(page);
}
