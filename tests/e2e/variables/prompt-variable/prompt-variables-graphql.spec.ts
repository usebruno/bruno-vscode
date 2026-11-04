import { test } from '../../utils/fixtures';
import type { Frame } from '@playwright/test';
import {
  createRequestByType,
  openRequest,
  addRequestHeader,
  setBearerToken,
  addRequestVar,
  setCodeMirrorValue,
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';
import {
  expectPromptModal,
  fillPromptAndContinue,
  cancelPrompt,
} from './prompt-actions';
import {
  SERVER,
  setupCollection,
  clickSend,
  expectResponseContains,
  expectResponseContainsAll,
  expectSentWithoutPrompt,
  expectRequestAborted,
} from './request-actions';

/**
 * Prompt-variable coverage for GraphQL requests. They go through the same
 * `sendRequest` thunk as HTTP (POST `{ query, variables }`) and reuse the HTTP
 * Headers/Auth/Vars tabs, so the shared helpers apply and the scenarios mirror the
 * HTTP suite. Requests are created as POST (the form defaults GraphQL to GET) and
 * pointed at the echo endpoints so the interpolated value can be read back.
 */

/** Create a GraphQL request (POST) with the given query, open it, return the editor. */
async function newGraphqlRequest(
  page: import('@playwright/test').Page,
  sidebar: Frame,
  collectionName: string,
  name: string,
  url: string,
  query = '{ ping }'
): Promise<Frame> {
  await createRequestByType(page, sidebar, collectionName, { name, url, type: 'GraphQL', method: 'POST' });
  const editor = await openRequest(page, sidebar, collectionName, name);
  // Set the query on the default (Query) tab.
  await setCodeMirrorValue(page, buildCommonLocators(editor).graphql.queryEditor(), query);
  return editor;
}

test.describe('Prompt variables — GraphQL', () => {

  test('prompt in the GraphQL query is interpolated', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'GQL Query');

    const editor = await newGraphqlRequest(
      page, sidebar, 'GQL Query', 'GQL Prompt Query', `${SERVER}/api/echo/json`,
      '{ echo(msg: "{{?GqlVar}}") }'
    );

    await clickSend(editor);
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['gql-query-1']);

    await expectResponseContains(page, editor, 'gql-query-1');
  });

  test('prompt in the GraphQL variables is interpolated', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'GQL Vars');

    const editor = await newGraphqlRequest(
      page, sidebar, 'GQL Vars', 'GQL Prompt Variables', `${SERVER}/api/echo/json`
    );
    // Set the GraphQL variables JSON (Variables tab).
    const locators = buildCommonLocators(editor);
    await locators.tabs.byKey('variables').click();
    await setCodeMirrorValue(page, locators.graphql.variablesEditor(), '{"name":"{{?GqlVarInput}}"}');

    await clickSend(editor);
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['gql-variables-2']);

    await expectResponseContains(page, editor, 'gql-variables-2');
  });

  test('prompt in the URL / query string is interpolated', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'GQL URL');

    const editor = await newGraphqlRequest(
      page, sidebar, 'GQL URL', 'GQL Prompt URL', `${SERVER}/api/echo/query?token={{?ApiKey}}`
    );

    await clickSend(editor);
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['gql-url-3']);

    await expectResponseContains(page, editor, 'gql-url-3');
  });

  test('prompt in a request header is interpolated', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'GQL Header');

    const editor = await newGraphqlRequest(
      page, sidebar, 'GQL Header', 'GQL Prompt Header', `${SERVER}/api/echo/header`
    );
    await addRequestHeader(page, editor, 'x-prompt-header', '{{?HeaderValue}}');

    await clickSend(editor);
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['gql-header-4']);

    await expectResponseContains(page, editor, 'gql-header-4');
  });

  test('prompt in the bearer auth token is interpolated', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'GQL Auth');

    const editor = await newGraphqlRequest(
      page, sidebar, 'GQL Auth', 'GQL Prompt Auth', `${SERVER}/api/echo/auth`
    );
    await setBearerToken(page, editor, '{{?AuthToken}}');

    await clickSend(editor);
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['gql-auth-5']);

    await expectResponseContains(page, editor, 'gql-auth-5');
  });

  test('prompt nested inside a variable value is discovered and interpolated', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'GQL Var');

    const editor = await newGraphqlRequest(
      page, sidebar, 'GQL Var', 'GQL Prompt Var', `${SERVER}/api/echo/query?v={{dynQuery}}`
    );
    await addRequestVar(page, editor, 'dynQuery', '{{?VarPrompt}}');

    await clickSend(editor);
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['gql-nested-6']);

    await expectResponseContains(page, editor, 'gql-nested-6');
  });

  test('the same prompt used in multiple places is asked only once (dedup)', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'GQL Dedup');

    const editor = await newGraphqlRequest(
      page, sidebar, 'GQL Dedup', 'GQL Dedup', `${SERVER}/api/echo/query?a={{?Shared}}&b={{?Shared}}`
    );
    await addRequestHeader(page, editor, 'x-shared', '{{?Shared}}');

    await clickSend(editor);
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['gql-shared']);

    await expectResponseContainsAll(page, editor, ['gql-shared', '"a"', '"b"']);
  });

  test('multiple distinct prompts each get their own input', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'GQL Multi');

    const editor = await newGraphqlRequest(
      page, sidebar, 'GQL Multi', 'GQL Multi', `${SERVER}/api/echo/query?first={{?First}}&second={{?Second}}`
    );

    await clickSend(editor);
    await expectPromptModal(editor, 2);
    await fillPromptAndContinue(editor, ['gql-alpha', 'gql-beta']);

    await expectResponseContainsAll(page, editor, ['gql-alpha', 'gql-beta']);
  });

  test('an empty value is accepted and does not block the request', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'GQL Empty');

    const editor = await newGraphqlRequest(
      page, sidebar, 'GQL Empty', 'GQL Empty', `${SERVER}/api/echo/query?token={{?EmptyKey}}&marker=sent`
    );

    await clickSend(editor);
    await expectPromptModal(editor, 1);
    await fillPromptAndContinue(editor, ['']);

    await expectResponseContains(page, editor, 'sent');
  });

  test('an invalid prompt pattern ({{? name}}) does not trigger the modal', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'GQL Invalid');

    const editor = await newGraphqlRequest(
      page, sidebar, 'GQL Invalid', 'GQL Invalid', `${SERVER}/api/echo/query?token=literal`
    );
    await addRequestHeader(page, editor, 'x-prompt-header', '{{? Invalid}}');

    await clickSend(editor);

    await expectSentWithoutPrompt(page, editor);
  });

  test('cancelling the modal aborts the request', async ({ page, tmpDir }) => {
    const sidebar = await setupCollection(page, tmpDir, 'GQL Cancel');

    const editor = await newGraphqlRequest(
      page, sidebar, 'GQL Cancel', 'GQL Cancel', `${SERVER}/api/echo/query?token={{?ApiKey}}`
    );

    await clickSend(editor);
    await expectPromptModal(editor, 1);
    await cancelPrompt(editor);

    await expectRequestAborted(page, editor);
  });
});
