import { expect, type Page } from '@playwright/test';
import type { Workspace } from '../../e2e-helper';
import { editorLocators, setAuth } from '../../utils/page/actions';
import { sendRequestAndVerify, verifyResponsePane } from '../../utils/page/assertions';
import { TEST_SERVER_LOCAL_URL, TEST_SERVER_REMOTE_URL } from '../../utils/urls';

export const desc = 'Basic, Bearer, Digest, AWS Sig v4 and API Key each send what the server expects, and No Auth sends no Authorization header';

export const workspace: Workspace = {
  collections: [
    {
      name: 'auth-types-collection',
      format: 'yml',
      requests: [
        { name: 'basic-request', url: `${TEST_SERVER_REMOTE_URL}/api/auth/basic/protected`, type: 'HTTP', method: 'POST' },
        { name: 'bearer-request', url: `${TEST_SERVER_REMOTE_URL}/api/auth/bearer/protected`, type: 'HTTP', method: 'GET' },
        { name: 'digest-request', url: `${TEST_SERVER_LOCAL_URL}/api/auth/digest/protected`, type: 'HTTP', method: 'GET' },
        { name: 'aws-request', url: `${TEST_SERVER_LOCAL_URL}/api/echo/auth`, type: 'HTTP', method: 'GET' },
        { name: 'api-key-header-request', url: `${TEST_SERVER_LOCAL_URL}/headers`, type: 'HTTP', method: 'GET' },
        { name: 'api-key-query-request', url: `${TEST_SERVER_LOCAL_URL}/api/echo/query`, type: 'HTTP', method: 'GET' },
      ],
    },
  ],
};

const response = (page: Page) => editorLocators(page).response.previewContainer();

async function verifyBasicAuth(page: Page) {
  await setAuth(page, 'basic-request', 'basic', { username: 'bruno', password: 'wrong' });
  await sendRequestAndVerify(page, 'basic-request', 401);
  await setAuth(page, 'basic-request', 'basic', { username: 'bruno', password: 'della' });
  await sendRequestAndVerify(page, 'basic-request', 200);
  await verifyResponsePane(page, 'basic-request', { tab: 'Timeline', section: 'Request' }, { contains: [/authorization/i] });

  await setAuth(page, 'basic-request', 'none');
  await sendRequestAndVerify(page, 'basic-request', 401);
  await verifyResponsePane(page, 'basic-request', { tab: 'Timeline', section: 'Request' }, { notContains: [/authorization/i] });
}

async function verifyBearerAuth(page: Page) {
  await setAuth(page, 'bearer-request', 'bearer', { token: 'wrong-token' });
  await sendRequestAndVerify(page, 'bearer-request', 401);
  await setAuth(page, 'bearer-request', 'bearer', { token: 'your_secret_token' });
  await sendRequestAndVerify(page, 'bearer-request', 200);
}

async function verifyDigestAuth(page: Page) {
  await setAuth(page, 'digest-request', 'digest', { username: 'bruno', password: 'wrong' });
  await sendRequestAndVerify(page, 'digest-request', 401);
  await setAuth(page, 'digest-request', 'digest', { username: 'bruno', password: 'della' });
  await sendRequestAndVerify(page, 'digest-request', 200);
  await expect(response(page)).toContainText('authenticated');
}

async function verifyAwsV4Auth(page: Page) {
  await setAuth(page, 'aws-request', 'awsv4', {
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    service: 'execute-api',
    region: 'us-east-1',
  });
  await sendRequestAndVerify(page, 'aws-request', 200);
  await expect(response(page)).toContainText('AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/');
  await expect(response(page)).not.toContainText('MissingAuthenticationToken');
  await verifyResponsePane(page, 'aws-request', { tab: 'Timeline', section: 'Request' }, { contains: ['Authorization', 'AWS4-HMAC-SHA256', 'X-Amz-Date'] });
}

async function verifyApiKeyAuth(page: Page) {
  await setAuth(page, 'api-key-header-request', 'apikey', { key: 'x-api-key', value: 'header-secret-123', addTo: 'header' });
  await sendRequestAndVerify(page, 'api-key-header-request', 200);
  await expect(response(page)).toContainText('x-api-key');
  await expect(response(page)).toContainText('header-secret-123');

  await setAuth(page, 'api-key-query-request', 'apikey', { key: 'api_key', value: 'query-secret-456', addTo: 'queryParams' });
  await sendRequestAndVerify(page, 'api-key-query-request', 200);
  await expect(response(page)).toContainText('api_key');
  await expect(response(page)).toContainText('query-secret-456');
}

// NTLM is covered in ntlm.ts and OAuth 2.0 in oauth2.ts
export async function run(page: Page) {
  await verifyAwsV4Auth(page);
  await verifyBasicAuth(page);
  await verifyBearerAuth(page);
  await verifyDigestAuth(page);
  await verifyApiKeyAuth(page);
}

