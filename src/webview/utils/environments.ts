import isEqual from 'lodash/isEqual';
import { uuid } from './common/index';
import type { EnvironmentVariable, UID, BrunoVariableDataType } from '@bruno-types';

interface ScriptVarEntry {
  name: string;
  value: unknown;
  enabled?: boolean;
  [key: string]: unknown;
}

interface ApplyScriptVarsOptions {
  skipKeys?: string[];
  newVarDefaults?: Record<string, unknown>;
}

/**
 * Apply a scope's script-produced variable map onto an existing variable array.
 *
 * The map is the full set of *enabled* variables after the script ran, so an enabled variable
 * absent from it was deleted (bru.deleteCollectionVar / bru.deleteGlobalEnvVar) and is dropped;
 * disabled variables are always preserved. Script writes target the enabled slot only.
 *
 * With a baseline: only values the script actually changed (vs the snapshot) are applied, so a
 * concurrent draft edit is not clobbered by a no-op re-run. Without a baseline: direct apply.
 *
 * Pure — never mutates the input array or its entries. `newVarDefaults` shapes inserted variables
 * per scope (env vars carry `type`/`secret`; collection/global vars do not).
 */
export const applyScriptVars = (
  variables: ScriptVarEntry[] | undefined,
  scriptVars: Record<string, unknown>,
  baseline: Record<string, unknown> | null | undefined,
  { skipKeys = [], newVarDefaults = {} }: ApplyScriptVarsOptions = {}
): ScriptVarEntry[] => {
  const scriptVarNames = new Set(Object.keys(scriptVars || {}));
  const skip = new Set(skipKeys);
  const next: ScriptVarEntry[] = (variables || []).map((v) => ({ ...v }));
  const makeNew = (name: string, value: unknown): ScriptVarEntry => ({ uid: uuid(), name, value, enabled: true, ...newVarDefaults });

  const setValue = (name: string, value: unknown) => {
    const existing = next.find((v) => v.name === name && v.enabled);
    if (existing) {
      existing.value = value;
    } else {
      next.push(makeNew(name, value));
    }
  };

  if (baseline) {
    Object.entries(scriptVars).forEach(([key, value]) => {
      if (skip.has(key)) return;
      const isNew = !(key in baseline);
      // Deep-equal so structurally-equal object/array values aren't seen as modifications.
      const isModified = !isNew && !isEqual(baseline[key], value);
      if (isNew || isModified) setValue(key, value);
    });

    return next.filter((v) => {
      if (!v.enabled) return true;
      if (v.name in baseline && !scriptVarNames.has(v.name)) return false;
      return true;
    });
  }

  Object.entries(scriptVars).forEach(([key, value]) => {
    if (skip.has(key)) return;
    setValue(key, value);
  });

  return next.filter((v) => !v.enabled || scriptVarNames.has(v.name));
};

/**
 * Keys the script actually modified relative to a baseline (or all script keys in direct-apply
 * mode). Scopes dataType re-inference to changed variables so a no-op re-run can't overwrite a
 * user's in-progress draft type change.
 */
export const getScriptModifiedKeys = (
  scriptVars: Record<string, unknown>,
  baseline: Record<string, unknown> | null | undefined,
  { skipKeys = [] }: { skipKeys?: string[] } = {}
): Set<string> => {
  const skip = new Set(skipKeys);
  const out = new Set<string>();
  Object.entries(scriptVars || {}).forEach(([key, value]) => {
    if (skip.has(key)) return;
    if (baseline) {
      const isNew = !(key in baseline);
      if (!isNew && isEqual(baseline[key], value)) return;
    }
    out.add(key);
  });
  return out;
};

interface EnvVariableInput {
  name?: string;
  value?: string | number | boolean | Record<string, unknown>;
  enabled?: boolean;
  secret?: boolean;
  ephemeral?: boolean;
  persistedValue?: string | number | boolean | Record<string, unknown>;
  dataType?: BrunoVariableDataType;
}

interface BuildEnvVariableOptions {
  envVariable: EnvVariableInput;
  withUuid?: boolean;
}

interface BuildPersistedOptions {
  mode?: 'save' | 'merge';
  persistedNames?: Set<string>;
}

const isPersistableEnvVarForMerge = (persistedNames: Set<string>) => (v: EnvVariableInput): boolean => {
  return !v?.ephemeral || v?.persistedValue !== undefined || (!!v?.name && persistedNames.has(v.name));
};

const toPersistedEnvVarForMerge = (persistedNames: Set<string>) => (v: EnvVariableInput): Omit<EnvVariableInput, 'ephemeral' | 'persistedValue'> => {
  const { ephemeral, persistedValue, ...rest } = v || {};
  if (v?.ephemeral && persistedValue !== undefined && !(v?.name && persistedNames.has(v.name))) {
    return { ...rest, value: persistedValue };
  }
  return rest;
};

const toPersistedEnvVarForSave = (v: EnvVariableInput): Omit<EnvVariableInput, 'ephemeral' | 'persistedValue'> => {
  const { ephemeral, persistedValue, ...rest } = v || {};
  return v?.ephemeral ? (persistedValue !== undefined ? { ...rest, value: persistedValue } : rest) : rest;
};

/*
 High-level builder for persisted variables
 - mode 'save': write what the user sees
 - mode 'merge': write only allowed vars (non-ephemeral, ephemerals with persistedValue, or explicitly persisted this run)
*/
export const buildPersistedEnvVariables = (variables: EnvVariableInput[] | unknown, {
  mode,
  persistedNames
}: BuildPersistedOptions = {}): Omit<EnvVariableInput, 'ephemeral' | 'persistedValue'>[] => {
  const src = Array.isArray(variables) ? variables : [];
  if (mode === 'merge') {
    const names = persistedNames instanceof Set ? persistedNames : new Set<string>();
    return src.filter(isPersistableEnvVarForMerge(names)).map(toPersistedEnvVarForMerge(names));
  }
  // default to save mode
  return src.map(toPersistedEnvVarForSave);
};

export const buildEnvVariable = ({ envVariable: obj, withUuid = false }: BuildEnvVariableOptions): EnvironmentVariable | Omit<EnvironmentVariable, 'uid'> => {
  const envVariable: Omit<EnvironmentVariable, 'uid'> = {
    name: obj.name ?? '',
    value: !!obj.secret ? '' : (obj.value ?? ''),
    type: 'text',
    enabled: obj.enabled !== false,
    secret: !!obj.secret,
    // 'string' is the implicit default — never materialize it as an explicit @string annotation.
    ...(obj.dataType && obj.dataType !== 'string' ? { dataType: obj.dataType } : {})
  };

  if (!withUuid) {
    return envVariable;
  }

  return {
    uid: uuid() as UID,
    ...envVariable
  };
};
