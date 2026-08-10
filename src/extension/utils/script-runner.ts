
import { ScriptRuntime, VarsRuntime, TestRuntime, AssertRuntime, ScriptResult, TestResult, VarsResult, formatErrorWithContextV2 } from '@usebruno/js';
import get from 'lodash/get';
import isEqual from 'lodash/isEqual';
import { sendToWebview, broadcastToAllWebviews } from '../ipc/handlers';
import { setRuntimeVariables } from '../store/runtime-variables';
import logsStore, { LogLevel } from '../store/logs';
import type { ScriptErrorContext } from '@bruno-types';

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
  envVariables?: Record<string, unknown> | null;
  runtimeVariables?: Record<string, unknown> | null;
  collectionVariables?: Record<string, unknown> | null;
  globalEnvironmentVariables?: Record<string, unknown> | null;
  error?: string;
  errorContext?: ScriptErrorContext | null;
}

interface TestRunResult {
  success: boolean;
  results: Array<{
    uid: string;
    description: string;
    passed: boolean;
    error?: string;
  }>;
  error?: string;
  errorContext?: ScriptErrorContext | null;
}

interface ScriptError extends Error {
  partialResults?: {
    envVariables?: Record<string, unknown>;
    runtimeVariables?: unknown;
    collectionVariables?: unknown;
    globalEnvironmentVariables?: unknown;
    results?: TestRunResult['results'];
  };
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

const emitScriptTestResults = (
  channel: 'main:pre-request-test-results' | 'main:post-response-test-results',
  results: TestRunResult['results'] | undefined,
  context: ScriptContext
): void => {
  if (!results?.length) return;

  sendToWebview(channel, {
    results,
    requestUid: context.requestUid,
    collectionUid: context.collectionUid,
    itemUid: context.itemUid
  });
};

const emitScriptVariableUpdates = (
  result: {
    envVariables?: Record<string, unknown>;
    runtimeVariables?: unknown;
    collectionVariables?: unknown;
    globalEnvironmentVariables?: unknown;
  },
  context: ScriptContext,
  envVarsBefore?: Record<string, unknown>
): void => {
  // Broadcast (not send-to-current-webview): the same script-authored env +
  // runtime var changes need to land in every open request tab's Redux store,
  // not just the one that ran the request. The desktop app can rely on one
  // window's Redux tree, but here each tab is its own webview and would
  // otherwise miss the update — the exact bug in the ticket.
  broadcastToAllWebviews('main:script-environment-update', {
    envVariables: result.envVariables,
    runtimeVariables: result.runtimeVariables,
    requestUid: context.requestUid,
    collectionUid: context.collectionUid
  });

  if (result.runtimeVariables && typeof result.runtimeVariables === 'object') {
    const runtimeVariables = result.runtimeVariables as Record<string, unknown>;
    setRuntimeVariables(context.collectionUid, runtimeVariables);
    broadcastToAllWebviews('main:runtime-variables-update', {
      collectionUid: context.collectionUid,
      runtimeVariables
    });
  }

  // Persistence stays scoped to the invoking webview: the merge-and-write
  // action runs in Redux + writes to disk, and we only want *one* write per
  // script run. The file watcher then broadcasts the change to sibling tabs.
  if (result.envVariables && !isEqual(result.envVariables, envVarsBefore)) {
    sendToWebview('main:persistent-env-variables-update', {
      persistentEnvVariables: result.envVariables,
      collectionUid: context.collectionUid
    });
  }

  if (result.collectionVariables) {
    broadcastToAllWebviews('main:collection-variables-update', {
      collectionVariables: result.collectionVariables,
      collectionUid: context.collectionUid
    });
  }

  if (result.globalEnvironmentVariables) {
    broadcastToAllWebviews('main:global-environment-variables-update', {
      globalEnvironmentVariables: result.globalEnvironmentVariables
    });
  }
};

export const runPreRequestScript = async (
  request: unknown,
  context: ScriptContext
): Promise<ScriptRunResult> => {
  const script = get(request, 'script.req', '') as string;

  if (!script || !script.length) {
    return { success: true };
  }

  // The runtime mutates envVars in place; snapshot first to detect script-made env changes.
  const envVarsBefore = { ...context.envVars };

  try {
    const scriptRuntime = new ScriptRuntime({
      runtime: context.scriptingConfig?.runtime
    });

    const onConsoleLog = createConsoleLogHandler(context.collectionUid, context.requestUid);

    const result = await scriptRuntime.runRequestScript(
      decomment(script),
      request,
      context.envVars,
      context.runtimeVariables,
      context.collectionPath,
      onConsoleLog,
      context.processEnvVars,
      context.scriptingConfig,
      undefined, // historyLogger
      undefined, // secretVariables
      context.runRequestByItemPathname,
      context.collectionName
    );

    emitScriptVariableUpdates(result, context, envVarsBefore);

    emitScriptTestResults('main:pre-request-test-results', (result as any).results, context);

    return {
      success: true,
      skipRequest: result.skipRequest,
      nextRequestName: result.nextRequestName,
      envVariables: result.envVariables,
      runtimeVariables: result.runtimeVariables,
      collectionVariables: result.collectionVariables,
      globalEnvironmentVariables: result.globalEnvironmentVariables
    };
  } catch (error) {
    const err = error as ScriptError;
    if (err.partialResults) {
      emitScriptVariableUpdates(err.partialResults, context, envVarsBefore);
      emitScriptTestResults('main:pre-request-test-results', err.partialResults.results, context);
    }
    return {
      success: false,
      error: err.message,
      errorContext: formatErrorWithContextV2(err, 'pre-request', get(request, 'script.reqMetadata'), context.collectionPath),
      envVariables: err.partialResults?.envVariables,
      runtimeVariables: err.partialResults?.runtimeVariables as Record<string, unknown> | undefined
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

    const envVarsBefore = { ...context.envVars };
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
      emitScriptVariableUpdates(result, context, envVarsBefore);

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

  const envVarsBefore = { ...context.envVars };

  try {
    const scriptRuntime = new ScriptRuntime({
      runtime: context.scriptingConfig?.runtime
    });

    const onConsoleLog = createConsoleLogHandler(context.collectionUid, context.requestUid);

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
      undefined, // historyLogger
      undefined, // secretVariables
      context.runRequestByItemPathname,
      context.collectionName
    );

    emitScriptVariableUpdates(result, context, envVarsBefore);

    emitScriptTestResults('main:post-response-test-results', (result as any).results, context);

    return {
      success: true,
      nextRequestName: result.nextRequestName,
      envVariables: result.envVariables,
      runtimeVariables: result.runtimeVariables,
      collectionVariables: result.collectionVariables,
      globalEnvironmentVariables: result.globalEnvironmentVariables
    };
  } catch (error) {
    const err = error as ScriptError;
    if (err.partialResults) {
      emitScriptVariableUpdates(err.partialResults, context, envVarsBefore);
      emitScriptTestResults('main:post-response-test-results', err.partialResults.results, context);
    }
    return {
      success: false,
      error: err.message,
      errorContext: formatErrorWithContextV2(err, 'post-response', get(request, 'script.resMetadata'), context.collectionPath),
      envVariables: err.partialResults?.envVariables,
      runtimeVariables: err.partialResults?.runtimeVariables as Record<string, unknown> | undefined
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

  const envVarsBefore = { ...context.envVars };

  try {
    const testRuntime = new TestRuntime({
      runtime: context.scriptingConfig?.runtime
    });

    const onConsoleLog = createConsoleLogHandler(context.collectionUid, context.requestUid);

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
      undefined, // historyLogger
      undefined, // secretVariables
      context.runRequestByItemPathname,
      context.collectionName
    );

    emitScriptVariableUpdates(result, context, envVarsBefore);

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
    const err = error as ScriptError;
    if (err.partialResults) {
      emitScriptVariableUpdates(err.partialResults, context, envVarsBefore);
    }

    const errorResults = [...(err.partialResults?.results || []), {
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
      results: errorResults,
      error: err.message,
      errorContext: formatErrorWithContextV2(err, 'test', get(request, 'testsMetadata'), context.collectionPath)
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
