import type { KeyValue } from '../common';

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: KeyValue[];
  size: number;
  duration: number;
  data?: unknown;
  dataBuffer?: string;
  error?: string | null;
  timeline?: ResponseTimeline;
  isFromCache?: boolean;
  responseTime?: number;
}

export interface ResponseTimeline {
  startTime?: number;
  dnsTime?: number;
  tcpTime?: number;
  tlsTime?: number;
  firstByteTime?: number;
  downloadTime?: number;
  endTime?: number;
}

export interface GrpcResponse {
  statusCode: number | null;
  statusText: string;
  statusDescription: string | null;
  headers: KeyValue[];
  metadata: Record<string, unknown> | null;
  trailers: Record<string, unknown> | null;
  statusDetails: unknown;
  error: string | null;
  data: unknown;
  size: number;
  duration: number;
}

export interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  messages: WebSocketMessageLog[];
}

export interface WebSocketMessageLog {
  uid: string;
  type: 'sent' | 'received';
  data: unknown;
  timestamp: number;
  size?: number;
}

export interface TestResult {
  uid: string;
  description: string;
  status: 'pass' | 'fail';
  error?: string | null;
  duration?: number;
}

export interface AssertionResult {
  uid: string;
  name: string;
  lhs: string;
  operator: string;
  rhs: string;
  status: 'pass' | 'fail';
  error?: string | null;
}

export interface StreamState {
  running?: boolean;
  connected?: boolean;
  [key: string]: unknown;
}

export interface ResponseState {
  state: 'idle' | 'sending' | 'received' | 'error' | 'cancelled';
  response?: HttpResponse | GrpcResponse | null;
  testResults?: TestResult[];
  assertionResults?: AssertionResult[];
  error?: string | null;
  stream?: StreamState;
}
