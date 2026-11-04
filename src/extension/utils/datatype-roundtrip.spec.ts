import { describe, test, expect, vi } from 'vitest';

vi.mock('vscode', () => ({}));

const { parseEnvironment, stringifyEnvironment, parseRequest, stringifyRequest } = await import('@usebruno/filestore');

describe('typed environment variables round-trip (.bru)', () => {
  test('preserves data types and native values across parse -> stringify -> parse', async () => {
    const src = 'vars {\n  @number\n  timeout: 30\n  @boolean\n  flag: true\n  @object\n  config: {"host":"localhost"}\n  token: abc\n}\n';

    const parsed: any = await parseEnvironment(src, { format: 'bru' });
    const byName = (n: string) => parsed.variables.find((v: any) => v.name === n);

    expect(byName('timeout')).toMatchObject({ value: 30, dataType: 'number' });
    expect(byName('flag')).toMatchObject({ value: true, dataType: 'boolean' });
    expect(byName('config')).toMatchObject({ value: { host: 'localhost' }, dataType: 'object' });
    // Plain string variable stays a string with no dataType materialized.
    expect(byName('token').value).toBe('abc');
    expect(byName('token').dataType).toBeUndefined();

    const serialized = await stringifyEnvironment(parsed, { format: 'bru' });
    expect(serialized).toContain('@number');
    expect(serialized).toContain('@boolean');
    expect(serialized).toContain('@object');

    const reparsed: any = await parseEnvironment(serialized, { format: 'bru' });
    const reByName = (n: string) => reparsed.variables.find((v: any) => v.name === n);
    expect(reByName('timeout')).toMatchObject({ value: 30, dataType: 'number' });
    expect(reByName('flag')).toMatchObject({ value: true, dataType: 'boolean' });
    expect(reByName('config')).toMatchObject({ value: { host: 'localhost' }, dataType: 'object' });
    expect(reByName('token').value).toBe('abc');
  });
});

describe('typed environment variables round-trip (.yml)', () => {
  test('preserves data types and native values for the yml format', async () => {
    const src = {
      name: 'e',
      variables: [
        { name: 'timeout', value: 30, enabled: true, secret: false, type: 'text', dataType: 'number' },
        { name: 'flag', value: true, enabled: true, secret: false, type: 'text', dataType: 'boolean' },
        { name: 'cfg', value: { host: 'localhost' }, enabled: true, secret: false, type: 'text', dataType: 'object' },
        { name: 'token', value: 'abc', enabled: true, secret: false, type: 'text' }
      ]
    };

    const yml = await stringifyEnvironment(src, { format: 'yml' });
    const parsed: any = await parseEnvironment(yml, { format: 'yml' });
    const byName = (n: string) => parsed.variables.find((v: any) => v.name === n);

    expect(byName('timeout')).toMatchObject({ value: 30, dataType: 'number' });
    expect(byName('flag')).toMatchObject({ value: true, dataType: 'boolean' });
    expect(byName('cfg')).toMatchObject({ value: { host: 'localhost' }, dataType: 'object' });
    expect(byName('token').value).toBe('abc');
    expect(byName('token').dataType).toBeUndefined();
  });
});

describe('typed request variables round-trip (.bru)', () => {
  test('preserves dataType on request pre-request vars', async () => {
    const src =
      'meta {\n  name: r\n  type: http\n  seq: 1\n}\n\nget {\n  url: http://x\n}\n\n' +
      'vars:pre-request {\n  @number\n  timeout: 30\n  @object\n  cfg: {"a":1}\n}\n';

    const parsed: any = await parseRequest(src, { format: 'bru' });
    const req = parsed.request.vars.req;
    expect(req.find((v: any) => v.name === 'timeout')).toMatchObject({ value: 30, dataType: 'number' });
    expect(req.find((v: any) => v.name === 'cfg')).toMatchObject({ value: { a: 1 }, dataType: 'object' });

    const serialized = await stringifyRequest(parsed, { format: 'bru' });
    expect(serialized).toContain('@number');
    expect(serialized).toContain('@object');

    const reparsed: any = await parseRequest(serialized, { format: 'bru' });
    const reReq = reparsed.request.vars.req;
    expect(reReq.find((v: any) => v.name === 'timeout')).toMatchObject({ value: 30, dataType: 'number' });
    expect(reReq.find((v: any) => v.name === 'cfg')).toMatchObject({ value: { a: 1 }, dataType: 'object' });
  });
});
