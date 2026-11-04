import { expect } from '@playwright/test';
import { Workspace } from '../../e2e-helper';
import { setAuth, setBody, sendRequestAndExpect, expectResponsePane } from '../../utils/page/actions';
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
        { name: 'https', url: `https://127.0.0.1:${NTLM_PORT}/api`, type: 'HTTP', method: 'GET' },
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

async function setUpAuth() {
  await setAuth('ntlm-collection', 'ntlm', credentials);
  for (const request of ['api', 'redirect', 'timeline', 'https']) {
    await setAuth(request, 'ntlm', credentials);
  }
  await setAuth('wrong-password', 'ntlm', { ...credentials, password: 'notThePassword' });

  await setAuth('body', 'ntlm', credentials);
  await setBody('body', '{"hello":"world"}');
}

async function verifyHandshake() {
  await withNtlmServer({}, async (endpoint) => {
    await sendRequestAndExpect('api', 200);
    await expectResponsePane('api', 'Response', { contains: ['authenticated'] });

    expect(endpoint.messageTypesSeen()).toEqual([null, 1, 3]);
    expect(endpoint.requests.map((request) => request.authenticated)).toEqual([undefined, undefined, true]);
    expect(endpoint.connectionsUsed()).toBe(1);
  });
}

async function verifyWrongPassword() {
  await withNtlmServer({}, async (endpoint) => {
    await sendRequestAndExpect('wrong-password', 401);

    expect(endpoint.messageTypesSeen()).toEqual([null, 1, 3]);
    expect(endpoint.requests.map((request) => request.authenticated)).toEqual([undefined, undefined, false]);
  });
}

async function verifyInherited() {
  await withNtlmServer({}, async (endpoint) => {
    await sendRequestAndExpect('inherited', 200);

    expect(endpoint.messageTypesSeen()).toEqual([null, 1, 3]);
    expect(endpoint.requests.map((request) => request.authenticated)).toEqual([undefined, undefined, true]);
  });
}

async function verifyBodyOnEveryRequest() {
  await withNtlmServer({}, async (endpoint) => {
    await sendRequestAndExpect('body', 200);

    expect(endpoint.messageTypesSeen()).toEqual([null, 1, 3]);
    expect(endpoint.requests.map((request) => JSON.parse(request.body))).toEqual([
      { hello: 'world' }, { hello: 'world' }, { hello: 'world' },
    ]);
  });
}

async function verifyRedirect() {
  await withNtlmServer({}, async (endpoint) => {
    await sendRequestAndExpect('redirect', 200);
    await expectResponsePane('redirect', 'Response', { contains: ['/landing'] });

    expect(endpoint.messageTypesSeen()).toEqual([null, 1, 3, null, 1, 3]);
    const carryingRetry = endpoint.requests.filter((request) => request.headers['x-retry'] !== undefined);
    expect(carryingRetry.map((request) => request.type)).toEqual([3, 3]);
  });
}

async function verifyTimelineLogsHandshake() {
  await withNtlmServer({}, async () => {
    await sendRequestAndExpect('timeline', 200);

    await expectResponsePane('timeline', 'Timeline', {
      contains: ['Authorization: NTLM TlRMTVNTUAAB', 'Authorization: NTLM TlRMTVNTUAAD', 'HTTP/1.1 200 OK'],
    }, 'Network');
  });
}

async function verifyTls() {
  await withNtlmServer({ tls: true }, async (endpoint) => {
    await sendRequestAndExpect('https', 200);

    expect(endpoint.messageTypesSeen()).toEqual([null, 1, 3]);
    expect(endpoint.requests.map((request) => request.authenticated)).toEqual([undefined, undefined, true]);
    expect(endpoint.connectionsUsed()).toBe(1);
  });
}

export async function run() {
  await setUpAuth();
  await verifyHandshake();
  await verifyWrongPassword();
  await verifyInherited();
  await verifyBodyOnEveryRequest();
  await verifyRedirect();
  await verifyTimelineLogsHandshake();
  await verifyTls();
}
