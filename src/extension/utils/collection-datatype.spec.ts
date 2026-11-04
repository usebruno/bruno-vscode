import { describe, test, expect, vi } from 'vitest';

vi.mock('vscode', () => ({}));

const { getEnvVars, mergeVars } = await import('./collection');

describe('getEnvVars applies each variable\'s data type', () => {
  test('coerces string-backed values and leaves untyped ones alone', () => {
    const envVars: any = getEnvVars({
      name: 'Local',
      variables: [
        { name: 'timeout', value: '30', enabled: true, dataType: 'number' },
        { name: 'flag', value: 'true', enabled: true, dataType: 'boolean' },
        { name: 'cfg', value: '{"host":"localhost"}', enabled: true, dataType: 'object' },
        { name: 'token', value: 'abc', enabled: true },
        { name: 'off', value: '1', enabled: false, dataType: 'number' }
      ]
    } as never);

    expect(envVars.timeout).toBe(30);
    expect(envVars.flag).toBe(true);
    expect(envVars.cfg).toEqual({ host: 'localhost' });
    expect(envVars.token).toBe('abc');
    expect(envVars.off).toBeUndefined();
    expect(envVars.__name__).toBe('Local');
  });

  test('keeps falsy typed values instead of dropping them', () => {
    const envVars: any = getEnvVars({
      name: 'Local',
      variables: [
        { name: 'zero', value: '0', enabled: true, dataType: 'number' },
        { name: 'no', value: 'false', enabled: true, dataType: 'boolean' },
        { name: 'blank', value: '', enabled: true }
      ]
    } as never);

    expect(envVars.zero).toBe(0);
    expect(envVars.no).toBe(false);
    expect(envVars.blank).toBe('');
  });

  test('passes a value through unchanged when it cannot be coerced', () => {
    const envVars: any = getEnvVars({
      name: 'Local',
      variables: [{ name: 'timeout', value: 'not-a-number', enabled: true, dataType: 'number' }]
    } as never);

    expect(envVars.timeout).toBe('not-a-number');
  });
});

describe('mergeVars applies data types across the variable scopes', () => {
  test('coerces collection, folder and request pre-request vars', () => {
    const collection: any = {
      root: { request: { vars: { req: [{ name: 'collNum', value: '1', enabled: true, dataType: 'number' }], res: [] } } }
    };
    const folder: any = {
      type: 'folder',
      root: { request: { vars: { req: [{ name: 'folderFlag', value: 'false', enabled: true, dataType: 'boolean' }], res: [] } } }
    };
    const item: any = {
      type: 'http-request',
      request: { vars: { req: [{ name: 'reqCfg', value: '{"a":1}', enabled: true, dataType: 'object' }], res: [] } }
    };
    const request: any = { vars: { req: [{ name: 'reqCfg', value: '{"a":1}', enabled: true, dataType: 'object' }], res: [] } };

    mergeVars(collection, request, [folder, item]);

    expect(request.collectionVariables).toEqual({ collNum: 1 });
    expect(request.folderVariables).toEqual({ folderFlag: false });
    expect(request.requestVariables).toEqual({ reqCfg: { a: 1 } });
    expect(request.vars.req.find((v: any) => v.name === 'collNum').value).toBe(1);
  });

  test('leaves post-response vars uncoerced, since their value is an expression', () => {
    const collection: any = {
      root: { request: { vars: { req: [], res: [{ name: 'resNum', value: '7', enabled: true, dataType: 'number' }] } } }
    };
    const request: any = { vars: { req: [], res: [] } };

    mergeVars(collection, request, []);

    expect(request.vars.res).toEqual([{ name: 'resNum', value: '7', enabled: true, type: 'response' }]);
  });
});
