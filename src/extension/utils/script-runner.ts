
import { ScriptRuntime, VarsRuntime, TestRuntime, AssertRuntime, ScriptResult, TestResult, VarsResult } from '@usebruno/js';
import get from 'lodash/get';
import { sendToWebview } from '../ipc/handlers';
import logsStore, { LogLevel } from '../store/logs';

// Strip comments from script (simple implementation)
const decomment = (script: string): string => {
  if (!script) return '';
  return script;
};

interface ScriptContext {
  collectionUid: string;
  collectionPath: string;
  collectionName?: string;
  itemUid: string;
  requestUid: string;
  envVars: Record<string, unknown>;
  runtimeVariables: Record<string, unknown>;
  processEnvVars: Record<string, string>;
  scriptingConfig?: {
    runtime?: string;
  };
  // Optional callback for bru.runRequest() support
  runRequestByItemPathname?: (relativeItemPathname: string) => Promise<unknown>;
}

interface ScriptRunResult {
  success: boolean;
  skipRequest?: boolean;
  nextRequestName?: string;
  envVariables?: Record<string, unknown>;
  runtimeVariables?: Record<string, unknown>;
  persistentEnvVariables?: Record<string, unknown>;
  globalEnvironmentVariables?: Record<string, unknown>;
  error?: string;
}

interface TestRunResult {
  success: boolean;
  results: Array<{
    uid: string;
    description: string;
    passed: boolean;
    error?: string;
  }>;
}

const createConsoleLogHandler = (collectionUid: string, requestUid: string) => {
  return (type: string, args: unknown[]) => {
    sendToWebview('main:console-log', {
      type,
      args,
      collectionUid,
      requestUid
    });
    logsStore.addLog(type as LogLevel, args);
  };
};

export const runPreRequestScript = async (
  request: unknown,
  context: ScriptContext
): Promise<ScriptRunResult> => {
  const script = get(request, 'script.req', '') as string;

  if (!script || !script.length) {
    return { success: true };
  }

  try {
    const scriptRuntime = new ScriptRuntime({
      runtime: context.scriptingConfig?.runtime
    });

    const onConsoleLog = createConsoleLogHandler(context.collectionUid, context.requestUid);

    // ScriptRuntime.runRequestScript signature (@usebruno/js v0.44.0):
    // (script, request, envVariables, runtimeVariables, collectionPath, onConsoleLog,
    //  processEnvVars, scriptingConfig, historyLogger, secretVariables, runRequestByItemPathname, collectionName)
    const result = await scriptRuntime.runRequestScript(
      decomment(script),
      request,
      context.envVars,
      context.runtimeVariables,
      context.collectionPath,
      onConsoleLog,
      context.processEnvVars,
      context.scriptingConfig,
      undefined, // historyLogger - not used in extension
      undefined, // secretVariables - not used in extension
      context.runRequestByItemPathname,
      context.collectionName
    );

    sendToWebview('main:script-environment-update', {
      envVariables: result.envVariables,
      runtimeVariables: result.runtimeVariables,
      persistentEnvVariables: result.persistentEnvVariables,
      requestUid: context.requestUid,
      collectionUid: context.collectionUid
    });

    if (result.globalEnvironmentVariables) {
      sendToWebview('main:global-environment-variables-update', {
        globalEnvironmentVariables: result.globalEnvironmentVariables
      });
    }

    const preReqTestResults = (result as any).results;
    if (preReqTestResults && preReqTestResults.length > 0) {
      sendToWebview('main:pre-request-test-results', {
        results: preReqTestResults,
        requestUid: context.requestUid,
        collectionUid: context.collectionUid,
        itemUid: context.itemUid
      });
    }

    return {
      success: true,
      skipRequest: result.skipRequest,
      nextRequestName: result.nextRequestName,
      envVariables: result.envVariables,
      runtimeVariables: result.runtimeVariables,
      persistentEnvVariables: result.persistentEnvVariables,
      globalEnvironmentVariables: result.globalEnvironmentVariables
    };
  } catch (error) {
    const err = error as Error;
    return {
      success: false,
      error: err.message
    };
  }
};

export const runPostResponseVars = (
  request: unknown,
  response: unknown,
  context: ScriptContext
): VarsResult | null => {
  const postResponseVars = get(request, 'vars.res', []);

  if (!postResponseVars || !postResponseVars.length) {
    return null;
  }

  try {
    const varsRuntime = new VarsRuntime({
      runtime: context.scriptingConfig?.runtime
    });

    const result = varsRuntime.runPostResponseVars(
      postResponseVars,
      request,
      response,
      context.envVars,
      context.runtimeVariables,
      context.collectionPath,
      context.processEnvVars
    );

    if (result) {
      sendToWebview('main:script-environment-update', {
        envVariables: result.envVariables,
        runtimeVariables: result.runtimeVariables,
        persistentEnvVariables: result.persistentEnvVariables,
        requestUid: context.requestUid,
        collectionUid: context.collectionUid
      });

      if (result.globalEnvironmentVariables) {
        sendToWebview('main:global-environment-variables-update', {
          globalEnvironmentVariables: result.globalEnvironmentVariables
        });
      }

      if (result.error) {
        sendToWebview('main:display-error', { error: result.error });
      }
    }

    return result;
  } catch (error) {
    const err = error as Error;
    sendToWebview('main:display-error', { error: err.message });
    return { error: err.message };
  }
};

export const runPostResponseScript = async (
  request: unknown,
  response: unknown,
  context: ScriptContext
): Promise<ScriptRunResult> => {
  const script = get(request, 'script.res', '') as string;

  if (!script || !script.length) {
    return { success: true };
  }

  try {
    const scriptRuntime = new ScriptRuntime({
      runtime: context.scriptingConfig?.runtime
    });

    const onConsoleLog = createConsoleLogHandler(context.collectionUid, context.requestUid);

    // ScriptRuntime.runResponseScript signature (@usebruno/js v0.44.0):
    // (script, request, response, envVariables, runtimeVariables, collectionPath,
    //  onConsoleLog, processEnvVars, scriptingConfig, historyLogger, secretVariables, runRequestByItemPathname, collectionName)
    const result = await scriptRuntime.runResponseScript(
      decomment(script),
      request,
      response,
      context.envVars,
      context.runtimeVariables,
      context.collectionPath,
      onConsoleLog,
      context.processEnvVars,
      context.scriptingConfig,
      undefined, // historyLogger - not used in extension
      undefined, // secretVariables - not used in extension
      context.runRequestByItemPathname,
      context.collectionName
    );

    sendToWebview('main:script-environment-update', {
      envVariables: result.envVariables,
      runtimeVariables: result.runtimeVariables,
      persistentEnvVariables: result.persistentEnvVariables,
      requestUid: context.requestUid,
      collectionUid: context.collectionUid
    });

    if (result.globalEnvironmentVariables) {
      sendToWebview('main:global-environment-variables-update', {
        globalEnvironmentVariables: result.globalEnvironmentVariables
      });
    }

    const postResTestResults = (result as any).results;
    if (postResTestResults && postResTestResults.length > 0) {
      sendToWebview('main:post-response-test-results', {
        results: postResTestResults,
        requestUid: context.requestUid,
        collectionUid: context.collectionUid,
        itemUid: context.itemUid
      });
    }

    return {
      success: true,
      nextRequestName: result.nextRequestName,
      envVariables: result.envVariables,
      runtimeVariables: result.runtimeVariables,
      persistentEnvVariables: result.persistentEnvVariables,
      globalEnvironmentVariables: result.globalEnvironmentVariables
    };
  } catch (error) {
    const err = error as Error;
    return {
      success: false,
      error: err.message
    };
  }
};

export const runTests = async (
  request: unknown,
  response: unknown,
  context: ScriptContext
): Promise<TestRunResult> => {
  const testsScript = get(request, 'tests', '') as string;

  if (!testsScript || !testsScript.length) {
    return { success: true, results: [] };
  }

  try {
    const testRuntime = new TestRuntime({
      runtime: context.scriptingConfig?.runtime
    });

    const onConsoleLog = createConsoleLogHandler(context.collectionUid, context.requestUid);

    // TestRuntime.runTests signature (@usebruno/js v0.44.0):
    // (testsFile, request, response, envVariables, runtimeVariables, collectionPath,
    //  onConsoleLog, processEnvVars, scriptingConfig, historyLogger, secretVariables, runRequestByItemPathname, collectionName)
    const result = await testRuntime.runTests(
      decomment(testsScript),
      request,
      response,
      context.envVars,
      context.runtimeVariables,
      context.collectionPath,
      onConsoleLog,
      context.processEnvVars,
      context.scriptingConfig,
      undefined, // historyLogger - not used in extension
      undefined, // secretVariables - not used in extension
      context.runRequestByItemPathname,
      context.collectionName
    );

    sendToWebview('main:test-results', {
      results: result.results,
      requestUid: context.requestUid,
      collectionUid: context.collectionUid,
      itemUid: context.itemUid
    });

    return {
      success: true,
      results: result.results
    };
  } catch (error) {
    const err = error as Error;
    const errorResults = [{
      uid: 'error',
      description: 'Test execution error',
      passed: false,
      status: 'fail',
      error: err.message
    }];

    sendToWebview('main:test-results', {
      results: errorResults,
      requestUid: context.requestUid,
      collectionUid: context.collectionUid,
      itemUid: context.itemUid
    });

    return {
      success: false,
      results: errorResults
    };
  }
};

export const runAssertions = (
  request: unknown,
  response: unknown,
  context: ScriptContext
): { results: Array<unknown> } => {
  const assertions = get(request, 'assertions', []);

  if (!assertions || !assertions.length) {
    return { results: [] };
  }

  try {
    const assertRuntime = new AssertRuntime({
      runtime: context.scriptingConfig?.runtime
    });

    // AssertRuntime.runAssertions signature:
    // runAssertions(assertions, request, response, envVariables, runtimeVariables, processEnvVars, historyLogger, secretVariables)
    // assertRuntime.runAssertions returns an array of assertion results directly
    const assertionResults = assertRuntime.runAssertions(
      assertions,
      request,
      response,
      context.envVars,
      context.runtimeVariables,
      context.processEnvVars
    );

    sendToWebview('main:assertion-results', {
      results: assertionResults,
      requestUid: context.requestUid,
      collectionUid: context.collectionUid,
      itemUid: context.itemUid
    });

    return { results: assertionResults as unknown[] };
  } catch (error) {
    const err = error as Error;
    return {
      results: [{
        uid: 'error',
        lhsExpr: 'assertion',
        rhsExpr: 'error',
        operator: 'error',
        error: err.message,
        status: 'fail'
      }]
    };
  }
};
