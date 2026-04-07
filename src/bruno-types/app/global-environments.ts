import type { UID } from '../common';
import type { Environment, EnvironmentVariable } from '../collection';

export interface GlobalEnvironment extends Environment {
  settings?: GlobalEnvironmentSettings;
}

export interface GlobalEnvironmentSettings {
  autoSync?: boolean;
}

export interface GlobalEnvironmentsState {
  globalEnvironments: GlobalEnvironment[];
  activeGlobalEnvironmentUid: UID | null;
}
