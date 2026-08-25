import { describe, it, expect } from 'vitest';
import { interpolateVars } from './interpolate-vars';

const formUrlEncodedHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };

describe('interpolateVars - form-urlencoded body', () => {
  it('interpolates values in array form data', () => {
    const request = {
      url: 'https://example.com/token',
      headers: { ...formUrlEncodedHeaders },
      data: [
        { name: 'grant_type', value: 'client_credentials', enabled: true },
        { name: 'client_secret', value: '{{ClientSecret}}', enabled: true }
      ]
    };

    const result = interpolateVars(request, {
      envVars: { ClientSecret: 's3cr3t-value' }
    });

    expect(result.data[1].value).toBe('s3cr3t-value');
  });

  it('interpolates variables in a pre-serialized string body (send-http-request flow)', () => {
    // The send-http-request handler stringifies the form body via qs.stringify
    // before scripts run, so interpolateVars receives a string with encoded braces
    const request = {
      url: 'https://example.com/token',
      headers: { ...formUrlEncodedHeaders },
      data: 'grant_type=client_credentials&client_secret=%7B%7BClientSecret%7D%7D&client_id=my-client'
    };

    const result = interpolateVars(request, {
      envVars: { ClientSecret: 's3cr3t-value' }
    });

    const params = new URLSearchParams(result.data as string);
    expect(params.get('client_secret')).toBe('s3cr3t-value');
    expect(params.get('grant_type')).toBe('client_credentials');
    expect(params.get('client_id')).toBe('my-client');
  });

  it('interpolates unencoded braces in a string body', () => {
    const request = {
      url: 'https://example.com/token',
      headers: { ...formUrlEncodedHeaders },
      data: 'client_secret={{ClientSecret}}'
    };

    const result = interpolateVars(request, {
      runtimeVariables: { ClientSecret: 'runtime-value' }
    });

    const params = new URLSearchParams(result.data as string);
    expect(params.get('client_secret')).toBe('runtime-value');
  });

  it('resolves process.env variables in a string body', () => {
    const request = {
      url: 'https://example.com/token',
      headers: { ...formUrlEncodedHeaders },
      data: 'client_secret=%7B%7Bprocess.env.CLIENT_SECRET%7D%7D'
    };

    const result = interpolateVars(request, {
      processEnvVars: { CLIENT_SECRET: 'env-file-value' }
    });

    const params = new URLSearchParams(result.data as string);
    expect(params.get('client_secret')).toBe('env-file-value');
  });

  it('leaves a string body without variables untouched', () => {
    const data = 'grant_type=client_credentials&client_secret=plain-value';
    const request = {
      url: 'https://example.com/token',
      headers: { ...formUrlEncodedHeaders },
      data
    };

    const result = interpolateVars(request, { envVars: {} });

    expect(result.data).toBe(data);
  });
});
