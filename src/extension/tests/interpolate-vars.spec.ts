import { describe, it, expect } from 'vitest';
import interpolateVars, { InterpolationOptions } from '../ipc/network/interpolate-vars';

/**
 * Unit tests for `interpolateVars` (src/extension/ipc/network/interpolate-vars.ts).
 *
 * `interpolateVars(request, options)` mutates and returns `request`, replacing
 * `{{variable}}` placeholders across every part of a prepared request (url,
 * headers, params, body variants, request.data, path params, proxy, and every
 * auth config) using a merged variable scope. 
 */

// Convenience: run with no ambient variables unless a test supplies some.
const run = (request: any, options: InterpolationOptions = {}) => interpolateVars(request, options);

describe('interpolateVars', () => {
  describe('url', () => {
    it('interpolates a variable in the url', () => {
      const req = run({ url: '{{base}}/users' }, { collectionVariables: { base: 'https://api.test' } });
      expect(req.url).toBe('https://api.test/users');
    });

    it('leaves the url untouched when there are no variables', () => {
      const req = run({ url: 'https://api.test/users' }, {});
      expect(req.url).toBe('https://api.test/users');
    });

    it('resolves a variable whose value itself references another variable (nested)', () => {
      const req = run(
        { url: '{{fullUrl}}' },
        { collectionVariables: { fullUrl: '{{host}}/v1', host: 'https://api.test' } }
      );
      expect(req.url).toBe('https://api.test/v1');
    });
  });

  describe('variable precedence', () => {
    it('prompt variables win over runtime, request, env, collection and global scopes', () => {
      const req = run(
        { url: '{{x}}' },
        {
          globalEnvironmentVariables: { x: 'global' },
          collectionVariables: { x: 'collection' },
          envVars: { x: 'env' },
          folderVariables: { x: 'folder' },
          requestVariables: { x: 'request' },
          runtimeVariables: { x: 'runtime' },
          promptVariables: { x: 'prompt' }
        }
      );
      expect(req.url).toBe('prompt');
    });

    it('runtime variables win over request/env/collection/global', () => {
      const req = run(
        { url: '{{x}}' },
        {
          globalEnvironmentVariables: { x: 'global' },
          collectionVariables: { x: 'collection' },
          envVars: { x: 'env' },
          requestVariables: { x: 'request' },
          runtimeVariables: { x: 'runtime' }
        }
      );
      expect(req.url).toBe('runtime');
    });

    it('reads variable scopes off the request object over the options object', () => {
      const req = run(
        { url: '{{x}}', collectionVariables: { x: 'from-request' } },
        { collectionVariables: { x: 'from-options' } }
      );
      expect(req.url).toBe('from-request');
    });
  });

  describe('prompt variables (?-prefixed)', () => {
    it('resolves a prompt variable in a header value', () => {
      const req = run(
        { url: 'x', headers: [{ name: 'X-Token', value: '{{?ApiKey}}', enabled: true }] },
        { promptVariables: { '?ApiKey': 'secret' } }
      );
      expect(req.headers[0].value).toBe('secret');
    });

    it('resolves a prompt variable in a json body', () => {
      const req = run(
        { url: 'x', body: { json: '{"k":"{{?Val}}"}' } },
        { promptVariables: { '?Val': 'hello' } }
      );
      expect(JSON.parse(req.body.json)).toEqual({ k: 'hello' });
    });

    it('resolves a prompt variable in a bearer token', () => {
      const req = run(
        { url: 'x', auth: { bearer: { token: '{{?AuthToken}}' } } },
        { promptVariables: { '?AuthToken': 'abc' } }
      );
      expect(req.auth.bearer.token).toBe('abc');
    });

    it('resolves a prompt variable in oauth2 config', () => {
      const req = run(
        { url: 'x', oauth2: { grantType: 'client_credentials', clientId: '{{?ClientId}}' } },
        { promptVariables: { '?ClientId': 'test-client' } }
      );
      expect(req.oauth2.clientId).toBe('test-client');
    });

    it('resolves a prompt variable inside a grpc message body', () => {
      const req = run(
        { url: 'x', mode: 'grpc', body: { grpc: [{ content: '{"message":"{{?Msg}}"}' }] } },
        { promptVariables: { '?Msg': 'hi' } }
      );
      expect(req.body.grpc[0].content).toBe('{"message":"hi"}');
    });

    it('resolves multiple distinct prompt variables in one request', () => {
      const req = run(
        { url: 'https://api.test?a={{?First}}&b={{?Second}}' },
        { promptVariables: { '?First': 'one', '?Second': 'two' } }
      );
      expect(req.url).toBe('https://api.test?a=one&b=two');
    });

    it('interpolates an empty prompt value to an empty string', () => {
      const req = run(
        { url: 'https://api.test?token={{?ApiKey}}' },
        { promptVariables: { '?ApiKey': '' } }
      );
      expect(req.url).toBe('https://api.test?token=');
    });
  });

  describe('process env vars', () => {
    it('interpolates {{process.env.X}} directly', () => {
      const req = run({ url: '{{process.env.HOST}}/x' }, { processEnvVars: { HOST: 'https://h' } });
      expect(req.url).toBe('https://h/x');
    });

    it('pre-interpolates env vars that reference process.env before use', () => {
      const req = run(
        { url: '{{base}}/x' },
        { envVars: { base: '{{process.env.HOST}}' }, processEnvVars: { HOST: 'https://h' } }
      );
      expect(req.url).toBe('https://h/x');
    });
  });

  describe('headers', () => {
    it('interpolates name and value for array-format headers', () => {
      const req = run(
        { url: 'x', headers: [{ name: '{{hName}}', value: '{{hVal}}', enabled: true }] },
        { collectionVariables: { hName: 'X-Token', hVal: 'abc' } }
      );
      expect(req.headers[0]).toMatchObject({ name: 'X-Token', value: 'abc', enabled: true });
    });

    it('interpolates keys and values for object-format headers', () => {
      const req = run(
        { url: 'x', headers: { '{{hName}}': '{{hVal}}' } },
        { collectionVariables: { hName: 'X-Token', hVal: 'abc' } }
      );
      expect(req.headers).toEqual({ 'X-Token': 'abc' });
    });
  });

  describe('query params (array format)', () => {
    it('interpolates param name and value', () => {
      const req = run(
        { url: 'x', params: [{ name: '{{pName}}', value: '{{pVal}}', enabled: true }] },
        { collectionVariables: { pName: 'q', pVal: 'search' } }
      );
      expect(req.params[0]).toMatchObject({ name: 'q', value: 'search' });
    });
  });

  describe('body', () => {
    it('interpolates a json body (with JSON escaping)', () => {
      const req = run(
        { url: 'x', body: { json: '{"name":"{{name}}"}' } },
        { collectionVariables: { name: 'alice' } }
      );
      expect(req.body.json).toBe('{"name":"alice"}');
    });

    it('produces valid JSON when interpolating a value into a json body', () => {
      const req = run(
        { url: 'x', body: { json: '{"name":"{{name}}"}' } },
        { collectionVariables: { name: 'alice smith' } }
      );
      expect(() => JSON.parse(req.body.json)).not.toThrow();
      expect(JSON.parse(req.body.json)).toEqual({ name: 'alice smith' });
    });

    it('interpolates a text body', () => {
      const req = run({ url: 'x', body: { text: 'hello {{who}}' } }, { collectionVariables: { who: 'world' } });
      expect(req.body.text).toBe('hello world');
    });

    it('interpolates an xml body', () => {
      const req = run({ url: 'x', body: { xml: '<a>{{v}}</a>' } }, { collectionVariables: { v: '1' } });
      expect(req.body.xml).toBe('<a>1</a>');
    });

    it('interpolates formUrlEncoded entries', () => {
      const req = run(
        { url: 'x', body: { formUrlEncoded: [{ name: '{{n}}', value: '{{v}}', enabled: true }] } },
        { collectionVariables: { n: 'field', v: 'val' } }
      );
      expect(req.body.formUrlEncoded[0]).toMatchObject({ name: 'field', value: 'val' });
    });

    it('interpolates multipartForm entries', () => {
      const req = run(
        { url: 'x', body: { multipartForm: [{ name: '{{n}}', value: '{{v}}', enabled: true }] } },
        { collectionVariables: { n: 'field', v: 'val' } }
      );
      expect(req.body.multipartForm[0]).toMatchObject({ name: 'field', value: 'val' });
    });

    it('interpolates graphql query and variables', () => {
      const req = run(
        { url: 'x', body: { graphql: { query: '{ user(id:"{{id}}") }', variables: '{"id":"{{id}}"}' } } },
        { collectionVariables: { id: '42' } }
      );
      expect(req.body.graphql.query).toBe('{ user(id:"42") }');
      expect(JSON.parse(req.body.graphql.variables)).toEqual({ id: '42' });
    });
  });

  describe('gRPC body (mode: grpc)', () => {
    it('interpolates variables anywhere in the grpc message body', () => {
      const req = run(
        { url: 'x', mode: 'grpc', body: { grpc: [{ content: '{"message":"{{msg}}"}' }] } },
        { collectionVariables: { msg: 'hello' } }
      );
      expect(req.body.grpc[0].content).toBe('{"message":"hello"}');
    });
  });

  describe('WebSocket body (mode: ws)', () => {
    it('interpolates JSON message content and keeps it valid JSON', () => {
      const req = run(
        { url: 'x', mode: 'ws', body: { ws: [{ content: '{"a":"{{v}}"}' }] } },
        { collectionVariables: { v: 'hello' } }
      );
      expect(JSON.parse(req.body.ws[0].content)).toEqual({ a: 'hello' });
    });

    it('interpolates plain-string message content', () => {
      const req = run(
        { url: 'x', mode: 'ws', body: { ws: [{ content: 'ping {{v}}' }] } },
        { collectionVariables: { v: '1' } }
      );
      expect(req.body.ws[0].content).toBe('ping 1');
    });
  });

  describe('request.data by content-type', () => {
    it('interpolates a JSON string body when content-type is json', () => {
      const req = run(
        { url: 'x', headers: { 'content-type': 'application/json' }, data: '{"k":"{{v}}"}' },
        { collectionVariables: { v: 'val' } }
      );
      expect(JSON.parse(req.data)).toEqual({ k: 'val' });
    });

    it('interpolates a JSON object body when content-type is json', () => {
      const req = run(
        { url: 'x', headers: { 'content-type': 'application/json' }, data: { k: '{{v}}' } },
        { collectionVariables: { v: 'val' } }
      );
      expect(req.data).toEqual({ k: 'val' });
    });

    it('interpolates x-www-form-urlencoded array values', () => {
      const req = run(
        {
          url: 'x',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          data: [{ name: 'a', value: '{{v}}' }]
        },
        { collectionVariables: { v: 'val' } }
      );
      expect(req.data[0]).toMatchObject({ name: 'a', value: 'val' });
    });

    it('interpolates multipart/form-data array values', () => {
      const req = run(
        {
          url: 'x',
          headers: { 'content-type': 'multipart/form-data' },
          data: [{ name: 'a', value: '{{v}}' }]
        },
        { collectionVariables: { v: 'val' } }
      );
      expect(req.data[0]).toMatchObject({ name: 'a', value: 'val' });
    });

    it('interpolates a plain string body for other content-types', () => {
      const req = run(
        { url: 'x', headers: { 'content-type': 'text/plain' }, data: 'hi {{v}}' },
        { collectionVariables: { v: 'there' } }
      );
      expect(req.data).toBe('hi there');
    });
  });

  describe('path params', () => {
    it('replaces :param segments in the url path', () => {
      const req = run({ url: 'https://api.test/users/:id', pathParams: [{ name: 'id', value: '{{uid}}' }] },
        { collectionVariables: { uid: '7' } });
      expect(req.url).toBe('https://api.test/users/7');
    });

    it('preserves the query string when substituting path params', () => {
      const req = run({ url: 'https://api.test/users/:id?q=1', pathParams: [{ name: 'id', value: '7' }] }, {});
      expect(req.url).toBe('https://api.test/users/7?q=1');
    });

    it('leaves unknown :param segments in place', () => {
      const req = run({ url: 'https://api.test/:missing', pathParams: [{ name: 'other', value: 'x' }] }, {});
      expect(req.url).toBe('https://api.test/:missing');
    });

    it('prefixes http:// when the url has no protocol', () => {
      const req = run({ url: 'api.test/users/:id', pathParams: [{ name: 'id', value: '7' }] }, {});
      expect(req.url).toBe('http://api.test/users/7');
    });

    it('substitutes OData-style parenthesised params', () => {
      const req = run(
        { url: "https://api.test/Products(:pid)", pathParams: [{ name: 'pid', value: '9' }] },
        {}
      );
      expect(req.url).toBe('https://api.test/Products(9)');
    });
  });

  describe('proxy config', () => {
    it('interpolates proxy fields and auth credentials', () => {
      const req = run(
        {
          url: 'x',
          proxy: {
            protocol: '{{proto}}',
            hostname: '{{host}}',
            port: '{{port}}',
            auth: { username: '{{u}}', password: '{{p}}' }
          }
        },
        { collectionVariables: { proto: 'http', host: 'proxy.test', port: '8080', u: 'user', p: 'pass' } }
      );
      expect(req.proxy).toMatchObject({ protocol: 'http', hostname: 'proxy.test', port: '8080' });
      expect(req.proxy.auth).toMatchObject({ username: 'user', password: 'pass' });
    });
  });

  describe('oauth2 config', () => {
    it('interpolates client_credentials fields', () => {
      const req = run(
        {
          url: 'x',
          oauth2: {
            grantType: 'client_credentials',
            accessTokenUrl: '{{tokenUrl}}',
            clientId: '{{cid}}',
            clientSecret: '{{secret}}'
          }
        },
        { collectionVariables: { tokenUrl: 'https://t', cid: 'id1', secret: 's1' } }
      );
      expect(req.oauth2).toMatchObject({ accessTokenUrl: 'https://t', clientId: 'id1', clientSecret: 's1' });
    });

    it('interpolates authorization_code fields including urls', () => {
      const req = run(
        {
          url: 'x',
          oauth2: {
            grantType: 'authorization_code',
            authorizationUrl: '{{authUrl}}',
            accessTokenUrl: '{{tokenUrl}}',
            clientId: '{{cid}}'
          }
        },
        { collectionVariables: { authUrl: 'https://a', tokenUrl: 'https://t', cid: 'id1' } }
      );
      expect(req.oauth2).toMatchObject({ authorizationUrl: 'https://a', accessTokenUrl: 'https://t', clientId: 'id1' });
    });

    it('interpolates password grant fields', () => {
      const req = run(
        {
          url: 'x',
          oauth2: { grantType: 'password', username: '{{u}}', password: '{{p}}', clientId: '{{cid}}' }
        },
        { collectionVariables: { u: 'user', p: 'pass', cid: 'id1' } }
      );
      expect(req.oauth2).toMatchObject({ username: 'user', password: 'pass', clientId: 'id1' });
    });

    it('interpolates implicit grant fields', () => {
      const req = run(
        {
          url: 'x',
          oauth2: { grantType: 'implicit', authorizationUrl: '{{authUrl}}', clientId: '{{cid}}' }
        },
        { collectionVariables: { authUrl: 'https://a', cid: 'id1' } }
      );
      expect(req.oauth2).toMatchObject({ authorizationUrl: 'https://a', clientId: 'id1' });
    });
  });

  describe('other auth configs', () => {
    it('interpolates awsv4config', () => {
      const req = run(
        { url: 'x', awsv4config: { accessKeyId: '{{k}}', secretAccessKey: '{{s}}', region: '{{r}}' } },
        { collectionVariables: { k: 'AK', s: 'SK', r: 'us-east-1' } }
      );
      expect(req.awsv4config).toMatchObject({ accessKeyId: 'AK', secretAccessKey: 'SK', region: 'us-east-1' });
    });

    it('interpolates digestConfig', () => {
      const req = run(
        { url: 'x', digestConfig: { username: '{{u}}', password: '{{p}}' } },
        { collectionVariables: { u: 'user', p: 'pass' } }
      );
      expect(req.digestConfig).toMatchObject({ username: 'user', password: 'pass' });
    });

    it('interpolates wsse', () => {
      const req = run(
        { url: 'x', wsse: { username: '{{u}}', password: '{{p}}' } },
        { collectionVariables: { u: 'user', p: 'pass' } }
      );
      expect(req.wsse).toMatchObject({ username: 'user', password: 'pass' });
    });

    it('interpolates ntlmConfig', () => {
      const req = run(
        { url: 'x', ntlmConfig: { username: '{{u}}', password: '{{p}}', domain: '{{d}}' } },
        { collectionVariables: { u: 'user', p: 'pass', d: 'CORP' } }
      );
      expect(req.ntlmConfig).toMatchObject({ username: 'user', password: 'pass', domain: 'CORP' });
    });
  });

  describe('auth', () => {
    it('interpolates bearer token', () => {
      const req = run(
        { url: 'x', auth: { bearer: { token: '{{t}}' } } },
        { collectionVariables: { t: 'abc' } }
      );
      expect(req.auth.bearer.token).toBe('abc');
    });

    it('interpolates basic auth username/password', () => {
      const req = run(
        { url: 'x', auth: { basic: { username: '{{u}}', password: '{{p}}' } } },
        { collectionVariables: { u: 'user', p: 'pass' } }
      );
      expect(req.auth.basic).toMatchObject({ username: 'user', password: 'pass' });
    });

    it('interpolates apikey key/value', () => {
      const req = run(
        { url: 'x', auth: { apikey: { key: '{{k}}', value: '{{v}}' } } },
        { collectionVariables: { k: 'X-Key', v: 'secret' } }
      );
      expect(req.auth.apikey).toMatchObject({ key: 'X-Key', value: 'secret' });
    });
  });
});
