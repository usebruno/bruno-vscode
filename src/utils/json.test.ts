import { describe, expect, it } from 'vitest';
import { prettifyJsonString } from './json';

describe('prettifyJsonString', () => {
  it('indents without changing values', () => {
    expect(prettifyJsonString('{"id":12345678901234567890,"t":"{{token}}"}'))
      .toBe('{\n  "id": 12345678901234567890,\n  "t": "{{token}}"\n}');
  });

  it('returns text that is not JSON as it is', () => {
    expect(prettifyJsonString('not json')).toBe('not json');
  });

  it('still formats a very long single line, keeping variables', () => {
    const items = Array.from({ length: 3000 }, (_, i) => `{"i":${i},"v":"{{var${i}}}"}`).join(',');
    const out = prettifyJsonString(`{"items":[${items}]}`);
    expect(out.split('\n').length).toBeGreaterThan(3000);
    expect(out).toContain('"v": "{{var2999}}"');
    expect(out).not.toContain('bruno-var-hash');
  });
});
