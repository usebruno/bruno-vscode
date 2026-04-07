interface BrunoConfig {
  [key: string]: unknown;
}

interface Collection {
  draft?: {
    brunoConfig?: BrunoConfig;
  };
  brunoConfig?: BrunoConfig;
}

const config: Record<string, BrunoConfig> = {};

export const getBrunoConfig = (collectionUid: string, collection?: Collection): BrunoConfig => {
  if (collection?.draft?.brunoConfig) {
    return collection.draft.brunoConfig;
  }
  return config[collectionUid] || {};
};

export const setBrunoConfig = (collectionUid: string, brunoConfig: BrunoConfig): void => {
  config[collectionUid] = brunoConfig;
};
