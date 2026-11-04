import { describe, test, expect } from 'vitest';
import type { NetworkLogEntry } from '@bruno-types';
import { getRequestHeaders } from './index';

const addEntry = (type: NetworkLogEntry['type'], message?: string): NetworkLogEntry => ({ timestamp: new Date(), type, message });
const addHeader = (message: string) => addEntry('requestHeader', message);

describe('getRequestHeaders', () => {
  test('returns the sent headers in wire order, ignoring response headers', () => {
    const timeline = [
      addEntry('request', 'GET /items'),
      addHeader('Host: example.com'),
      addHeader('Authorization: AWS4-HMAC-SHA256 Credential=abc, Signature=def'),
      addEntry('response', 'HTTP/1.1 200 OK'),
      addEntry('responseHeader', 'content-type: text/plain')
    ];

    expect(getRequestHeaders(timeline)).toEqual([
      { name: 'Host', value: 'example.com' },
      { name: 'Authorization', value: 'AWS4-HMAC-SHA256 Credential=abc, Signature=def' }
    ]);
  });

  test('reports only the final hop after a redirect', () => {
    const timeline = [
      addEntry('request', 'GET /a'),
      addHeader('Authorization: Bearer secret'),
      addHeader('Host: localhost'),
      addEntry('response', 'HTTP/1.1 302 Found'),
      addEntry('request', 'GET /b'),
      addHeader('Host: 127.0.0.1'),
      addEntry('response', 'HTTP/1.1 200 OK')
    ];

    expect(getRequestHeaders(timeline)).toEqual([{ name: 'Host', value: '127.0.0.1' }]);
  });

  test('returns an empty list when there are no sent headers', () => {
    expect(getRequestHeaders([addEntry('request', 'GET /x')])).toEqual([]);
    expect(getRequestHeaders(undefined)).toEqual([]);
  });
});
