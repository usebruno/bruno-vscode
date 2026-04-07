export const REQUEST_TYPES = ['http-request', 'graphql-request', 'grpc-request', 'ws-request'] as const;

export type RequestType = typeof REQUEST_TYPES[number];
