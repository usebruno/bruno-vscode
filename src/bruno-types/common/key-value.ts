import type { UID } from './uid';

export interface KeyValue {
  uid: UID;
  name?: string | null;
  value?: string | null;
  description?: string | null;
  enabled?: boolean;
}
