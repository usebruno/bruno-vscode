import { describe, it, expect } from 'vitest';
import { prepareBody } from './prepare-request';

describe('prepareBody strips comments from a json body', () => {
  it('sends plain JSON as written, whitespace included', () => {
    const json = '{\n  "name" : "bruno"\n}';
    expect(prepareBody({ mode: 'json', json }, {})).toBe(json);
  });

  it('strips // and /* */ comments', () => {
    const json = `{
  // line comment
  "name": "bruno", /* inline block comment */
  "url": "https://example.com/path", // url with // inside a string
  "nested": {
    /* multi
       line */
    "enabled": true
  }
}`;
    const data = prepareBody({ mode: 'json', json }, {}) as string;
    expect(data).not.toContain('//' + ' line comment');
    expect(data).not.toContain('/*');
    expect(JSON.parse(data)).toEqual({
      name: 'bruno',
      url: 'https://example.com/path',
      nested: { enabled: true }
    });
  });

  it('keeps the original formatting after removing a comment', () => {
    const json = '{\n  // Line comment\n  "name" : "bruno"\n}';
    expect(prepareBody({ mode: 'json', json }, {})).toBe('{\n  "name" : "bruno"\n}');
  });

  it('sends no body when the json is nothing but comments', () => {
    const json = '// {\n//   // Line comment\n//   "name" : "bruno"\n// }';
    expect(prepareBody({ mode: 'json', json }, {})).toBeUndefined();
  });

  it('sends no body when json is empty', () => {
    expect(prepareBody({ mode: 'json', json: '' }, {})).toBeUndefined();
  });

  it('keeps unquoted variables so interpolation can still run on the string', () => {
    const json = `{
  // the id comes from the environment
  "id": {{userId}},
  "name": "{{name}}"
}`;
    const data = prepareBody({ mode: 'json', json }, {}) as string;
    expect(data).toContain('"id": {{userId}}');
    expect(data).not.toContain('// the id');
  });
});
