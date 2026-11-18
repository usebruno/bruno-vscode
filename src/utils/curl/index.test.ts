import { describe, expect, it } from 'vitest';
import { getRequestFromCurlCommand } from './index';

describe('getRequestFromCurlCommand', () => {
  it('takes a URL with a scheme, or a dotted host without one', () => {
    expect(getRequestFromCurlCommand('curl https://example.com/path')?.url).toBe('https://example.com/path');
    expect(getRequestFromCurlCommand('curl example.com/path?a=1')?.url).toBe('https://example.com/path?a=1');
    expect(getRequestFromCurlCommand('curl 127.0.0.1')?.url).toBe('https://127.0.0.1');
  });

  it('takes a host and port without a scheme', () => {
    expect(getRequestFromCurlCommand('curl localhost:3000/api')?.url).toBe('https://localhost:3000/api');
    expect(getRequestFromCurlCommand('curl 127.0.0.1:8080/x?a=1')?.url).toBe('https://127.0.0.1:8080/x?a=1');
    expect(getRequestFromCurlCommand('curl api.example.com:8443')?.url).toBe('https://api.example.com:8443');
  });

  it('takes localhost without a port', () => {
    expect(getRequestFromCurlCommand('curl localhost')?.url).toBe('https://localhost');
    expect(getRequestFromCurlCommand('curl localhost/api?a=1')?.url).toBe('https://localhost/api?a=1');
  });

  it('does not take a bare word for a URL', () => {
    expect(getRequestFromCurlCommand('curl -X POST')).toBeNull();
    expect(getRequestFromCurlCommand('curl foo:bar')).toBeNull();
    expect(getRequestFromCurlCommand('curl localhostx')).toBeNull();
  });

  it('indents a JSON body without changing its values', () => {
    const request = getRequestFromCurlCommand(
      'curl -X POST https://example.com -H "content-type: application/json" -d \'{"id":12345678901234567890,"token":"{{token}}","n":{{num}}}\''
    );

    expect(request?.body.mode).toBe('json');
    // Formatted as text: the number keeps its digits and the variables stay in place.
    expect(request?.body.json).toMatch(/^\{\n  "id": 12345678901234567890,\n  "token": "\{\{token\}\}",\n  "n":\s?\{\{num\}\}\n\}$/);
  });
});
