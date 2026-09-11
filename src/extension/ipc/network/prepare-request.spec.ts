import { describe, test, expect } from 'vitest';
import { prepareBody } from './prepare-request';

const jsonBody = (json: string) => prepareBody({ mode: 'json', json }, {});

describe('prepareBody strips comments from a json body', () => {
  test('line comment', () => {
    expect(jsonBody('{\n  "a": 1 // note\n}')).toEqual({ a: 1 });
  });

  test('comment on its own line', () => {
    expect(jsonBody('{\n  // note\n  "a": 1\n}')).toEqual({ a: 1 });
  });

  test('block comment', () => {
    expect(jsonBody('{\n  /* note */ "a": 1\n}')).toEqual({ a: 1 });
  });

  test('a double slash inside a value is not a comment', () => {
    expect(jsonBody('{\n  "url": "http://example.com//path" // note\n}')).toEqual({
      url: 'http://example.com//path'
    });
  });

  test('escaped quotes inside a value survive', () => {
    expect(jsonBody('{\n  "quote": "he said \\"hi \\"" // note\n}')).toEqual({
      quote: 'he said "hi "'
    });
  });

  test('a body that is still invalid falls back to the comment-free text', () => {
    // Unquoted variables only become valid JSON after interpolation, which runs later.
    const result = jsonBody('{\n  "id": {{id}} // note\n}');
    expect(typeof result).toBe('string');
    expect(result).not.toContain('//');
  });

  test('an empty body sends nothing', () => {
    expect(jsonBody('')).toBeUndefined();
  });

  test('the content type is still defaulted', () => {
    const headers: Record<string, string> = {};
    prepareBody({ mode: 'json', json: '{}' }, headers);
    expect(headers['content-type']).toBe('application/json');
  });
});
