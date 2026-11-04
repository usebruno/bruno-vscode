import type { ItemType } from '@bruno-types';

export const REQUEST_TYPES: ItemType[] = ['http-request', 'graphql-request', 'grpc-request', 'ws-request'];

export const PREVIEW_SAVE_MIN_INTERVAL_MS = 500;

export const PREVIEW_SAVE_HOTKEY_MESSAGE = { type: 'bruno:preview-hotkey', action: 'save' } as const;

// All auth modes. HTTP and GraphQL support every one of these; WS and gRPC use the subsets below.
export const AUTH_MODES = {
  AWSV4: 'awsv4',
  BASIC: 'basic',
  BEARER: 'bearer',
  DIGEST: 'digest',
  NTLM: 'ntlm',
  OAUTH1: 'oauth1',
  OAUTH2: 'oauth2',
  WSSE: 'wsse',
  APIKEY: 'apikey',
  NONE: 'none',
  INHERIT: 'inherit'
} as const;

// Auth modes supported by the WebSocket protocol.
export const AUTH_MODES_WS: string[] = [
  AUTH_MODES.BASIC,
  AUTH_MODES.BEARER,
  AUTH_MODES.APIKEY,
  AUTH_MODES.OAUTH2,
  AUTH_MODES.NONE,
  AUTH_MODES.INHERIT
];

// Auth modes supported by GRPC protocol
export const AUTH_MODES_GRPC: string[] = [
  AUTH_MODES.BASIC,
  AUTH_MODES.BEARER,
  AUTH_MODES.APIKEY,
  AUTH_MODES.OAUTH2,
  AUTH_MODES.WSSE,
  AUTH_MODES.NONE,
  AUTH_MODES.INHERIT
];
