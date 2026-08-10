import { describe, test, expect } from 'vitest';
import { interpolateVars } from './interpolate-vars';

describe('interpolateVars', () => {
  const baseOptions = {
    envVars: { API_URL: 'https://api.example.com', TOKEN: 'secret123' },
    collectionVariables: {},
    folderVariables: {},
    requestVariables: {},
    runtimeVariables: {},
    processEnvVars: { NODE_ENV: 'test' },
    globalEnvironmentVariables: {}
  };

  describe('formUrlEncoded body interpolation', () => {
    test('interpolates variables in body.formUrlEncoded values', () => {
      const request = {
        url: 'https://example.com',
        headers: [{ name: 'content-type', value: 'application/x-www-form-urlencoded', enabled: true }],
        body: {
          mode: 'formUrlEncoded',
          formUrlEncoded: [
            { name: 'username', value: '{{TOKEN}}', enabled: true },
            { name: 'url', value: '{{API_URL}}/auth', enabled: true },
            { name: 'static', value: 'plain-value', enabled: true }
          ]
        },
        data: [
          { name: 'username', value: '{{TOKEN}}', enabled: true },
          { name: 'url', value: '{{API_URL}}/auth', enabled: true },
          { name: 'static', value: 'plain-value', enabled: true }
        ]
      };

      const result = interpolateVars(request, baseOptions);

      // body.formUrlEncoded should be interpolated
      expect(result.body.formUrlEncoded[0].value).toBe('secret123');
      expect(result.body.formUrlEncoded[1].value).toBe('https://api.example.com/auth');
      expect(result.body.formUrlEncoded[2].value).toBe('plain-value');

      // data (array format) should also be interpolated
      expect(result.data[0].value).toBe('secret123');
      expect(result.data[1].value).toBe('https://api.example.com/auth');
      expect(result.data[2].value).toBe('plain-value');
    });

    test('interpolates process.env variables in formUrlEncoded values', () => {
      const request = {
        url: 'https://example.com',
        headers: [{ name: 'content-type', value: 'application/x-www-form-urlencoded', enabled: true }],
        body: {
          mode: 'formUrlEncoded',
          formUrlEncoded: [
            { name: 'env', value: '{{process.env.NODE_ENV}}', enabled: true }
          ]
        },
        data: [
          { name: 'env', value: '{{process.env.NODE_ENV}}', enabled: true }
        ]
      };

      const result = interpolateVars(request, baseOptions);

      expect(result.body.formUrlEncoded[0].value).toBe('test');
      expect(result.data[0].value).toBe('test');
    });

    test('interpolates variables in formUrlEncoded names', () => {
      const request = {
        url: 'https://example.com',
        headers: [{ name: 'content-type', value: 'application/x-www-form-urlencoded', enabled: true }],
        body: {
          mode: 'formUrlEncoded',
          formUrlEncoded: [
            { name: '{{TOKEN}}', value: 'some-value', enabled: true }
          ]
        },
        data: [
          { name: '{{TOKEN}}', value: 'some-value', enabled: true }
        ]
      };

      const result = interpolateVars(request, baseOptions);

      expect(result.body.formUrlEncoded[0].name).toBe('secret123');
    });

    test('does NOT interpolate variables when data is a pre-encoded string (regression guard)', () => {
      // This test documents the bug from issue #58:
      // If buildFormUrlEncodedPayload is called BEFORE interpolation,
      // {{variables}} get URL-encoded to %7B%7Bvariables%7D%7D and
      // the interpolation engine can't recognize them.
      const request = {
        url: 'https://example.com',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        // Pre-encoded string — this is what the old code produced
        data: 'username=%7B%7BTOKEN%7D%7D&url=%7B%7BAPI_URL%7D%7D%2Fauth'
      };

      const result = interpolateVars(request, baseOptions);

      // The pre-encoded data CANNOT be interpolated — variables remain URL-encoded
      expect(result.data).toContain('%7B%7BTOKEN%7D%7D');
      expect(result.data).not.toContain('secret123');
    });

    test('correctly interpolates variables when data is kept as array (current behavior)', () => {
      // This test verifies the fix: data stays as array, interpolation works
      const request = {
        url: 'https://example.com',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        data: [
          { name: 'username', value: '{{TOKEN}}', enabled: true },
          { name: 'url', value: '{{API_URL}}/auth', enabled: true }
        ]
      };

      const result = interpolateVars(request, baseOptions);

      expect(result.data[0].value).toBe('secret123');
      expect(result.data[1].value).toBe('https://api.example.com/auth');
    });
  });

  describe('JSON body interpolation', () => {
    test('interpolates variables in body.json', () => {
      const request = {
        url: 'https://example.com',
        headers: [{ name: 'content-type', value: 'application/json', enabled: true }],
        body: {
          mode: 'json',
          json: '{"token": "{{TOKEN}}"}'
        }
      };

      const result = interpolateVars(request, baseOptions);

      expect(result.body.json).toBe('{"token": "secret123"}');
    });
  });

  describe('URL interpolation', () => {
    test('interpolates variables in URL', () => {
      const request = {
        url: '{{API_URL}}/users',
        headers: []
      };

      const result = interpolateVars(request, baseOptions);

      expect(result.url).toBe('https://api.example.com/users');
    });
  });

  describe('header interpolation', () => {
    test('interpolates variables in header values (array format)', () => {
      const request = {
        url: 'https://example.com',
        headers: [
          { name: 'Authorization', value: 'Bearer {{TOKEN}}', enabled: true }
        ]
      };

      const result = interpolateVars(request, baseOptions);

      expect(result.headers[0].value).toBe('Bearer secret123');
    });
  });
});
