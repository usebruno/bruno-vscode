import { test, expect } from '../../utils/fixtures';
import {
  addRequestTag,
  closeEditorTabIfOpen,
  createCollection,
  createRequestByType,
  excludeRunnerTag,
  includeRunnerTag,
  openBrunoSidebar,
  openCollectionRunner,
  runCollection,
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

const TEST_SERVER = 'http://127.0.0.1:8081';

test.describe('Collection runner', () => {

  test('TC-3668: Verify that the user is able to execute all the request which are under the Collection using Run', { tag: '@sanity' }, async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Runner Collection';
    const requestName = 'Ping';
    const locators = buildCommonLocators(sidebar);

    await test.step('Create a collection with one request', async () => {
      await createCollection(page, sidebar, collectionName, tmpDir);
      await createRequestByType(page, sidebar, collectionName, {
        name: requestName,
        url: `${TEST_SERVER}/ping`,
      });
      await expect(locators.sidebar.collectionName(collectionName)).toBeVisible();
      await expect(locators.sidebar.collectionItem(requestName)).toBeVisible();
    });

    const runner = await test.step('Open the runner from the collection ellipse menu', async () => {
      const runnerFrame = await openCollectionRunner(page, sidebar, collectionName);
      await expect(buildCommonLocators(runnerFrame).runner.runCollectionButton()).toBeEnabled();
      await expect(buildCommonLocators(runnerFrame).runner.requestCountText()).toContainText('1');
      return runnerFrame;
    });

    await test.step('Run the collection and verify the request passed', async () => {
      const runnerLocators = buildCommonLocators(runner).runner;
      await runCollection(runner);
      await expect(runnerLocators.resultDisplay(requestName)).toBeVisible();
      await expect(runnerLocators.resultDisplay(requestName)).toContainText('200');
      await expect(runnerLocators.filterButton('All')).toContainText('1');
      await expect(runnerLocators.filterButton('Passed')).toContainText('1');
      await expect(runnerLocators.filterButton('Failed')).toContainText('0');
    });
  });

  test('TC-3667: Verify that the delay in the requests execution in the Collection run', { tag: '@sanity' }, async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Delay Runner Collection';
    const firstRequest = 'Ping One';
    const secondRequest = 'Ping Two';
    // The runner waits this long before each request, so two requests take at least twice that.
    const delayMs = 2000;
    const locators = buildCommonLocators(sidebar);

    await test.step('Create a collection with two requests', async () => {
      await createCollection(page, sidebar, collectionName, tmpDir);
      await createRequestByType(page, sidebar, collectionName, {
        name: firstRequest,
        url: `${TEST_SERVER}/ping`,
      });
      await closeEditorTabIfOpen(page, firstRequest);
      await createRequestByType(page, sidebar, collectionName, {
        name: secondRequest,
        url: `${TEST_SERVER}/ping`,
      });
      await expect(locators.sidebar.collectionItem(firstRequest)).toBeVisible();
      await expect(locators.sidebar.collectionItem(secondRequest)).toBeVisible();
    });

    const runner = await test.step('Open the runner and set the delay', async () => {
      const runnerFrame = await openCollectionRunner(page, sidebar, collectionName);
      const runnerLocators = buildCommonLocators(runnerFrame).runner;
      await expect(runnerLocators.runCollectionButton()).toBeEnabled();
      await expect(runnerLocators.requestCountText()).toContainText('2');
      await runnerLocators.delayInput().fill(String(delayMs));
      await expect(runnerLocators.delayInput()).toHaveValue(String(delayMs));
      return runnerFrame;
    });

    await test.step('Run the collection and verify the delay is applied', async () => {
      const runnerLocators = buildCommonLocators(runner).runner;
      const startedAt = Date.now();

      await runCollection(runner);

      // The runner pauses delayMs before each request, so two requests take at least delayMs * 2.
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(delayMs * 2);
      await expect(runnerLocators.resultDisplay(firstRequest)).toContainText(firstRequest);
      await expect(runnerLocators.resultDisplay(secondRequest)).toContainText(secondRequest);
      await expect(runnerLocators.filterButton('All')).toContainText('2');
      await expect(runnerLocators.filterButton('Passed')).toContainText('2');
      await expect(runnerLocators.filterButton('Failed')).toContainText('0');
    });
  });

  test('TC-3666: Verify the Include Tags functionality under Collection Run', { tag: '@sanity' }, async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Tagged Runner Collection';
    const taggedRequest = 'Smoke Request';
    const plainRequest = 'Plain Request';
    const tag = 'smoke';
    const locators = buildCommonLocators(sidebar);

    await test.step('Create a collection with two requests and tag one of them', async () => {
      await createCollection(page, sidebar, collectionName, tmpDir);
      await createRequestByType(page, sidebar, collectionName, {
        name: taggedRequest,
        url: `${TEST_SERVER}/ping`,
      });
      await closeEditorTabIfOpen(page, taggedRequest);
      await createRequestByType(page, sidebar, collectionName, {
        name: plainRequest,
        url: `${TEST_SERVER}/ping`,
      });
      await expect(locators.sidebar.collectionItem(taggedRequest)).toBeVisible();
      await expect(locators.sidebar.collectionItem(plainRequest)).toBeVisible();
      await closeEditorTabIfOpen(page, plainRequest);
      await addRequestTag(page, sidebar, collectionName, taggedRequest, tag);
    });

    const runner = await test.step('Open the runner and include the tag', async () => {
      const runnerFrame = await openCollectionRunner(page, sidebar, collectionName);
      await expect(buildCommonLocators(runnerFrame).runner.runCollectionButton()).toBeEnabled();
      await expect(buildCommonLocators(runnerFrame).runner.requestCountText()).toContainText('2');
      await includeRunnerTag(page, runnerFrame, tag);
      return runnerFrame;
    });

    await test.step('Run and verify only the tagged request is executed', async () => {
      const runnerLocators = buildCommonLocators(runner).runner;

      await runCollection(runner);

      await expect(runnerLocators.resultDisplay(taggedRequest)).toContainText(taggedRequest);
      await expect(runnerLocators.resultDisplay(plainRequest)).toHaveCount(0);
      await expect(runnerLocators.filterButton('All')).toContainText('1');
      await expect(runnerLocators.filterButton('Passed')).toContainText('1');
      await expect(runnerLocators.filterButton('Failed')).toContainText('0');
    });
  });

  test('TC-3665: Verify the Exclude Tags functionality under Collection Run', { tag: '@sanity' }, async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    const collectionName = 'Exclude Runner Collection';
    const taggedRequest = 'Smoke Request';
    const plainRequest = 'Plain Request';
    const tag = 'smoke';
    const locators = buildCommonLocators(sidebar);

    await test.step('Create a collection with two requests and tag one of them', async () => {
      await createCollection(page, sidebar, collectionName, tmpDir);
      await createRequestByType(page, sidebar, collectionName, {
        name: taggedRequest,
        url: `${TEST_SERVER}/ping`,
      });
      await closeEditorTabIfOpen(page, taggedRequest);
      await createRequestByType(page, sidebar, collectionName, {
        name: plainRequest,
        url: `${TEST_SERVER}/ping`,
      });
      await expect(locators.sidebar.collectionItem(taggedRequest)).toBeVisible();
      await expect(locators.sidebar.collectionItem(plainRequest)).toBeVisible();
      await closeEditorTabIfOpen(page, plainRequest);
      await addRequestTag(page, sidebar, collectionName, taggedRequest, tag);
    });

    const runner = await test.step('Open the runner and exclude the tag', async () => {
      const runnerFrame = await openCollectionRunner(page, sidebar, collectionName);
      await expect(buildCommonLocators(runnerFrame).runner.runCollectionButton()).toBeEnabled();
      await expect(buildCommonLocators(runnerFrame).runner.requestCountText()).toContainText('2');
      await excludeRunnerTag(page, runnerFrame, tag);
      return runnerFrame;
    });

    await test.step('Run and verify the tagged request is left out', async () => {
      const runnerLocators = buildCommonLocators(runner).runner;

      await runCollection(runner);

      await expect(runnerLocators.resultDisplay(plainRequest)).toContainText(plainRequest);
      await expect(runnerLocators.resultDisplay(taggedRequest)).toHaveCount(0);
      await expect(runnerLocators.filterButton('All')).toContainText('1');
      await expect(runnerLocators.filterButton('Passed')).toContainText('1');
      await expect(runnerLocators.filterButton('Failed')).toContainText('0');
    });
  });
});
