import { expect } from '@playwright/test';
import { Workspace } from '../../e2e-helper';
import { activeEditor, setAuth, sendRequestAndExpect, expectResponsePane, page } from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';
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

const response = () => buildCommonLocators(activeEditor(page)).response.previewContainer();

async function testBasicAuth() {
  await setAuth('basic-request', 'basic', { username: 'bruno', password: 'wrong' });
  await sendRequestAndExpect('basic-request', 401);
  await setAuth('basic-request', 'basic', { username: 'bruno', password: 'della' });
  await sendRequestAndExpect('basic-request', 200);
  await expectResponsePane('basic-request', 'Timeline', { contains: [/authorization/i] }, 'Request');

  await setAuth('basic-request', 'none');
  await sendRequestAndExpect('basic-request', 401);
  await expectResponsePane('basic-request', 'Timeline', { notContains: [/authorization/i] }, 'Request');
}

async function testBearerAuth() {
  await setAuth('bearer-request', 'bearer', { token: 'wrong-token' });
  await sendRequestAndExpect('bearer-request', 401);
  await setAuth('bearer-request', 'bearer', { token: 'your_secret_token' });
  await sendRequestAndExpect('bearer-request', 200);
}

async function testDigestAuth() {
  await setAuth('digest-request', 'digest', { username: 'bruno', password: 'wrong' });
  await sendRequestAndExpect('digest-request', 401);
  await setAuth('digest-request', 'digest', { username: 'bruno', password: 'della' });
  await sendRequestAndExpect('digest-request', 200);
  await expect(response()).toContainText('authenticated');
}

async function testAwsV4Auth() {
  await setAuth('aws-request', 'awsv4', {
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    service: 'execute-api',
    region: 'us-east-1',
  });
  await sendRequestAndExpect('aws-request', 200);
  await expect(response()).toContainText('AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/');
  await expect(response()).not.toContainText('MissingAuthenticationToken');
  await expectResponsePane('aws-request', 'Timeline', { contains: ['Authorization', 'AWS4-HMAC-SHA256', 'X-Amz-Date'] }, 'Request');
}

async function testApiKeyAuth() {
  await setAuth('api-key-header-request', 'apikey', { key: 'x-api-key', value: 'header-secret-123', addTo: 'header' });
  await sendRequestAndExpect('api-key-header-request', 200);
  await expect(response()).toContainText('x-api-key');
  await expect(response()).toContainText('header-secret-123');

  await setAuth('api-key-query-request', 'apikey', { key: 'api_key', value: 'query-secret-456', addTo: 'queryParams' });
  await sendRequestAndExpect('api-key-query-request', 200);
  await expect(response()).toContainText('api_key');
  await expect(response()).toContainText('query-secret-456');
}

// NTLM is covered in ntlm.ts and OAuth 2.0 in oauth2.ts
export async function run() {
  await testAwsV4Auth();
  await testBasicAuth();
  await testBearerAuth();
  await testDigestAuth();
  await testApiKeyAuth();
}

