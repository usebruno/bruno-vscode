
import { ScriptRuntime, VarsRuntime, TestRuntime, AssertRuntime, ScriptResult, TestResult, VarsResult } from '@usebruno/js';
import get from 'lodash/get';
import isEqual from 'lodash/isEqual';
import { sendToWebview, broadcastToAllWebviews } from '../ipc/handlers';
import { setRuntimeVariables } from '../store/runtime-variables';
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
  envVariables?: Record<string, unknown> | null;
  runtimeVariables?: Record<string, unknown> | null;
  collectionVariables?: Record<string, unknown> | null;
  globalEnvironmentVariables?: Record<string, unknown> | null;
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

/** Broadcast a script's variable changes on their webview channels: env + runtime vars for
 *  in-session state, environment vars for the disk write (persist by default, only when the script
 *  actually changed one), and global env vars. `envVarsBefore` is the pre-script snapshot used to
 *  skip needless environment-file writes.
 *
 *  Runtime variables get a dedicated broadcast (`main:runtime-variables-update`) so *every* open
 *  request tab in the collection updates its Redux mirror — the desktop app can rely on a single
 *  window's Redux tree, but here each tab is its own webview and would otherwise miss the update.
 *  We also persist to the in-memory extension store so a fresh tab (opened after the script ran)
 *  starts with the current values. */
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

  try {
    const scriptRuntime = new ScriptRuntime({
      runtime: context.scriptingConfig?.runtime
    });

    const onConsoleLog = createConsoleLogHandler(context.collectionUid, context.requestUid);

    // The runtime mutates envVars in place; snapshot first to detect script-made env changes.
    const envVarsBefore = { ...context.envVars };
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
      collectionVariables: result.collectionVariables,
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

  try {
    const scriptRuntime = new ScriptRuntime({
      runtime: context.scriptingConfig?.runtime
    });

    const onConsoleLog = createConsoleLogHandler(context.collectionUid, context.requestUid);

    const envVarsBefore = { ...context.envVars };
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
      collectionVariables: result.collectionVariables,
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
