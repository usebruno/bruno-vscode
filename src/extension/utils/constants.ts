export const REQUEST_TYPES = ['http-request', 'graphql-request', 'grpc-request', 'ws-request'] as const;

export type RequestType = typeof REQUEST_TYPES[number];

export const DEFAULT_GITIGNORE = [
  '# Secrets',
  '.env*',
  '',
  '# Dependencies',
  'node_modules',
  '',
  '# OS files',
  '.DS_Store',
  'Thumbs.db',
  ''
].join('\n');
