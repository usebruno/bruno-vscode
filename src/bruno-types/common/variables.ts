import type { UID } from './uid';

export interface Variable {
  uid: UID;
  name?: string | null;
  value?: string | null;
  description?: string | null;
  enabled?: boolean;
  local?: boolean;
}

export type Variables = Variable[] | null;
