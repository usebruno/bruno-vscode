import { describe, test, expect } from 'vitest';
import { DIRTY_MARKER } from './dirty-marker';
import { parseRequest, parseCollection, parseEnvironment } from './parse';

const request = `meta {
  name: login
  type: http
  seq: 1
}

post {
  url: {{BACKEND_URL}}/auth/login
  body: json
  auth: none
}
`;

const collection = `auth {
  mode: none
}
`;

const environment = `vars {
  host: localhost
}
`;

describe('parsing tolerates a persisted dirty-state marker', () => {
  test('request', async () => {
    const parsed: any = await parseRequest(`${request}${DIRTY_MARKER}`, { format: 'bru' });
    expect(parsed.name).toBe('login');
    expect(parsed.request.url).toBe('{{BACKEND_URL}}/auth/login');
  });

  test('collection', async () => {
    const parsed: any = await parseCollection(`${collection}${DIRTY_MARKER}`, { format: 'bru' });
    expect(parsed.request.auth.mode).toBe('none');
  });

  test('environment', async () => {
    const parsed: any = await parseEnvironment(`${environment}${DIRTY_MARKER}`, { format: 'bru' });
    expect(parsed.variables).toEqual([
      expect.objectContaining({ name: 'host', value: 'localhost' })
    ]);
  });

  test('a marker-free file parses identically', async () => {
    const withMarker: any = await parseRequest(`${request}${DIRTY_MARKER}`, { format: 'bru' });
    const without: any = await parseRequest(request, { format: 'bru' });
    expect(withMarker).toEqual(without);
  });
});
