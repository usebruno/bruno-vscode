import { expect, type Page } from '@playwright/test';
import type { Workspace } from '../../e2e-helper';
import { test } from '../../utils/fixtures';
import { exportPostmanCollection, setAssertions, setAuth, setBody, setDocs, setHeaders, setScript, setTests, setVars } from '../../utils/page/actions';
import { TEST_SERVER_LOCAL_URL } from '../../utils/urls';

export const desc = 'Postman export keeps each request\'s method, URL, query params, headers, auth, body, scripts, tests and docs, the collection vars, the collection and folder scripts, and nests folder requests';

const COLLECTION = 'postman-export-collection';
const REQUEST_URL = `${TEST_SERVER_LOCAL_URL}/api/echo/json?page=1`;
const BODY = { name: 'bruno' };

export const workspace: Workspace = {
  collections: [
    {
      name: COLLECTION,
      format: 'yml',
      vars: { exportVar: 'var-value' },
      folders: [
        {
          name: 'export-folder',
          requests: [
            { name: 'export-request', url: REQUEST_URL, type: 'HTTP', method: 'POST' },
          ],
        },
      ],
    },
  ],
};

async function verifyPostmanExport(page: Page) {
  let exported: any;

  await test.step('Configure export-request', async () => {
    await setHeaders(page, 'export-request', [{ name: 'x-export', value: 'header-value' }]);
    await setAuth(page, 'export-request', 'bearer', { token: 'export-token' });
    await setBody(page, 'export-request', JSON.stringify(BODY));
    await setScript(page, 'export-request', { preRequest: "console.log('pre-request');", postResponse: "console.log('post-response');" });
    await setVars(page, 'export-request', [{ name: 'requestVar', value: 'request-var-value' }]);
    await setAssertions(page, 'export-request', [{ name: 'res.status', value: '200' }]);
    await setTests(page, 'export-request', "console.log('tests');");
    await setDocs(page, 'export-request', 'export docs');
  });

  await test.step('Configure collection and folder scripts', async () => {
    await setScript(page, COLLECTION, { preRequest: "console.log('collection-pre-request');", postResponse: "console.log('collection-post-response');" });
    await setScript(page, 'export-folder', { preRequest: "console.log('folder-pre-request');", postResponse: "console.log('folder-post-response');" });
  });

  await test.step('Export as Postman collection', async () => {
    exported = await exportPostmanCollection(page, COLLECTION);
  });

  await test.step('Verify exported request', async () => {
    const folder = exported.item.find((item: any) => item.name === 'export-folder');
    const { request, event } = folder.item.find((item: any) => item.name === 'export-request');
    const scriptOf = (listen: string) => event.find((e: any) => e.listen === listen).script.exec.join('\n');

    expect(request.method).toBe('POST');
    expect(request.url.raw).toBe(REQUEST_URL);
    expect(request.url.query).toMatchObject([{ key: 'page', value: '1' }]);
    expect(request.header).toMatchObject([{ key: 'x-export', value: 'header-value' }]);
    expect(request.auth.bearer).toMatchObject([{ key: 'token', value: 'export-token' }]);
    expect(JSON.parse(request.body.raw)).toEqual(BODY);
    expect(scriptOf('prerequest')).toContain("console.log('pre-request');");
    expect(scriptOf('test')).toContain("console.log('post-response');");
    expect(scriptOf('test')).toContain("console.log('tests');");
    expect(request.description).toContain('export docs');
  });

  await test.step('Verify collection and folder level exported data', async () => {
    const folder = exported.item.find((item: any) => item.name === 'export-folder');
    const scriptOf = (event: any[], listen: string) => event.find((e: any) => e.listen === listen).script.exec.join('\n');

    expect(exported.variable).toMatchObject([{ key: 'exportVar', value: 'var-value' }]);
    expect(scriptOf(exported.event, 'prerequest')).toContain("console.log('collection-pre-request');");
    expect(scriptOf(exported.event, 'test')).toContain("console.log('collection-post-response');");
    expect(scriptOf(folder.event, 'prerequest')).toContain("console.log('folder-pre-request');");
    expect(scriptOf(folder.event, 'test')).toContain("console.log('folder-post-response');");
  });
}

export async function run(page: Page) {
  await verifyPostmanExport(page);
}
