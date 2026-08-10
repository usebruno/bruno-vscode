/**
 * In-memory store for per-collection runtime variables.
 *
 * Runtime variables (`bru.setVar` / `bru.getVar`) exist for the lifetime of
 * the VS Code process. They must survive:
 *   - closing a request tab
 *   - opening the same request in a new tab (each tab is its own webview
 *     with its own Redux store)
 * and reset when the extension host restarts.
 *
 * The extension is the single source of truth. Webviews mirror this into
 * their local Redux state via `main:runtime-variables-update` broadcasts.
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

/** Shallow-merge new keys into the stored runtime variables. Returns the
 *  merged snapshot for callers that want to broadcast without re-reading. */
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
