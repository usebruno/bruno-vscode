/**
 * Per-collection runtime variables (`bru.setVar`), held in the extension host
 * because each tab is a separate webview with its own Redux store. Survives
 * tab close/reopen; resets on extension host restart. Webviews mirror it via
 * `main:runtime-variables-update`.
 */

type RuntimeVariables = Record<string, unknown>;

const runtimeVariablesByCollection: Record<string, RuntimeVariables> = {};

export const getRuntimeVariables = (collectionUid: string): RuntimeVariables => {
  return runtimeVariablesByCollection[collectionUid] || {};
};

export const setRuntimeVariables = (
  collectionUid: string,
  runtimeVariables: RuntimeVariables
): void => {
  runtimeVariablesByCollection[collectionUid] = { ...(runtimeVariables || {}) };
};

export const mergeRuntimeVariables = (
  collectionUid: string,
  runtimeVariables: RuntimeVariables
): RuntimeVariables => {
  const current = runtimeVariablesByCollection[collectionUid] || {};
  const next = { ...current, ...(runtimeVariables || {}) };
  runtimeVariablesByCollection[collectionUid] = next;
  return next;
};

export const clearRuntimeVariables = (collectionUid: string): void => {
  delete runtimeVariablesByCollection[collectionUid];
};
