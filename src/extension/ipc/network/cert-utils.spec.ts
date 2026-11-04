import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCertsAndProxyConfig } from './cert-utils';

const preferences = vi.hoisted(() => ({
  verifyTls: true,
  useCustomCa: false,
  customCaPath: null as string | null
}));

vi.mock('../../store/preferences', () => ({
  preferencesUtil: {
    shouldVerifyTls: () => preferences.verifyTls,
    shouldUseCustomCaCertificate: () => preferences.useCustomCa,
    getCustomCaCertificateFilePath: () => preferences.customCaPath,
    shouldKeepDefaultCaCertificates: () => true,
    getGlobalProxyConfig: () => ({ disabled: true })
  }
}));

vi.mock('../../store/bruno-config', () => ({
  getBrunoConfig: () => ({})
}));

const certsAndProxyConfig = () => getCertsAndProxyConfig({
  collectionUid: 'collection',
  collection: {},
  request: { url: 'https://example.com' },
  envVars: {},
  runtimeVariables: {},
  processEnvVars: {},
  collectionPath: '/collection',
  globalEnvironmentVariables: {}
});

describe('getCertsAndProxyConfig TLS settings', () => {
  beforeEach(() => {
    preferences.verifyTls = true;
    preferences.useCustomCa = false;
    preferences.customCaPath = null;
  });

  it('loads CA certificates when verification is on', async () => {
    const { httpsAgentRequestFields } = await certsAndProxyConfig();

    expect(httpsAgentRequestFields.rejectUnauthorized).toBeUndefined();
    expect(httpsAgentRequestFields.ca).toBeTruthy();
  });

  it('fails on a missing custom CA file when verification is on', async () => {
    preferences.useCustomCa = true;
    preferences.customCaPath = '/does/not/exist/ca.pem';

    await expect(certsAndProxyConfig()).rejects.toThrow('Invalid custom CA certificate path');
  });

  it('skips CA certificates when verification is off, so a missing custom CA file does not break requests', async () => {
    preferences.verifyTls = false;
    preferences.useCustomCa = true;
    preferences.customCaPath = '/does/not/exist/ca.pem';

    const { httpsAgentRequestFields } = await certsAndProxyConfig();

    expect(httpsAgentRequestFields.rejectUnauthorized).toBe(false);
    expect(httpsAgentRequestFields.ca).toBeUndefined();
  });
});
