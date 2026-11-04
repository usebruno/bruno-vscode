import type { UID } from './uid';

// Bru lang variable data type, written on disk as an `@number`/`@boolean`/`@object` annotation.
// Mirrors @usebruno/common's BrunoVariableDataType. Absent/'string' means a plain string value
// (the implicit default — no annotation is emitted).
export type BrunoVariableDataType = 'string' | 'number' | 'boolean' | 'object';

export interface Variable {
  uid: UID;
  name?: string | null;
  // Typed variables (`@number`/`@boolean`/`@object` annotations) parse to native values;
  // plain variables remain strings. `dataType` records the on-disk annotation.
  value?: string | number | boolean | Record<string, unknown> | null;
  description?: string | null;
  enabled?: boolean;
  local?: boolean;
  dataType?: BrunoVariableDataType;
}

export type Variables = Variable[] | null;
