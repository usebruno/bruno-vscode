import { uuid } from './common/index';
import type { EnvironmentVariable, UID } from '@bruno-types';

interface EnvVariableInput {
  name?: string;
  value?: string | number | boolean | Record<string, unknown>;
  enabled?: boolean;
  secret?: boolean;
  ephemeral?: boolean;
  persistedValue?: string | number | boolean | Record<string, unknown>;
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
    secret: !!obj.secret
  };

  if (!withUuid) {
    return envVariable;
  }

  return {
    uid: uuid() as UID,
    ...envVariable
  };
};
