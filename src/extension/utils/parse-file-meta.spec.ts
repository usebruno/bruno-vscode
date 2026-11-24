import { describe, test, expect, vi } from 'vitest';

vi.mock('vscode', () => ({}));

const { parseBruFileMeta, parseFileMeta } = await import('./collection');

const bru = (metaLines: string[], eol = '\n') =>
  ['meta {', ...metaLines.map((line) => `  ${line}`), '}', '', 'get {', '  url: https://example.com/{id}', '}', ''].join(eol);

const yml = (name: string) =>
  ['info:', `  name: ${name}`, '  type: http', '  seq: 4', 'http:', '  method: GET', '  url: https://example.com', ''].join('\n');

describe('parseBruFileMeta reads request names in full (#215)', () => {
  test('keeps a plain name, numeric seq, type and method', () => {
    const meta = parseBruFileMeta(bru(['name: Get users', 'type: http', 'seq: 3']));
    expect(meta).toMatchObject({ name: 'Get users', type: 'http-request', seq: 3, tags: [] });
    expect((meta?.request as { method: string }).method).toBe('get');
  });

  test('keeps colons after the first one in the name', () => {
    const meta = parseBruFileMeta(bru(['name: user/:username/sub/path', 'type: http', 'seq: 1']));
    expect(meta?.name).toBe('user/:username/sub/path');
  });

  test('keeps a closing brace inside the name', () => {
    const meta = parseBruFileMeta(bru(['name: user/{username}/sub/path', 'type: http', 'seq: 2']));
    expect(meta?.name).toBe('user/{username}/sub/path');
    expect(meta?.seq).toBe(2);
  });

  test('handles CRLF line endings', () => {
    const meta = parseBruFileMeta(bru(['name: user/{username}/:id', 'type: graphql', 'seq: 7'], '\r\n'));
    expect(meta).toMatchObject({ name: 'user/{username}/:id', type: 'graphql-request', seq: 7 });
  });

  test('skips a tags array without losing the keys after it', () => {
    const meta = parseBruFileMeta(bru(['name: Tagged', 'type: http', 'tags: [', '  smoke', '  regression', ']', 'seq: 5']));
    expect(meta).toMatchObject({ name: 'Tagged', type: 'http-request', seq: 5, tags: [] });
  });

  test('skips an inline tags array', () => {
    const meta = parseBruFileMeta(bru(['name: Tagged', 'tags: [smoke]', 'seq: 6']));
    expect(meta).toMatchObject({ name: 'Tagged', seq: 6 });
  });

  test('returns null when there is no meta block', () => {
    expect(parseBruFileMeta('get {\n  url: https://example.com\n}\n')).toBeNull();
  });
});

describe('parseFileMeta for yml reads the same names in full', () => {
  test.each(['Get users', 'user/:username/sub/path', 'user/{username}/sub/path'])('%s', (name) => {
    const meta = parseFileMeta(yml(name), 'yml');
    expect(meta).toMatchObject({ name, type: 'http-request', seq: 4 });
    expect((meta?.request as { method: string }).method).toBe('get');
  });
});
