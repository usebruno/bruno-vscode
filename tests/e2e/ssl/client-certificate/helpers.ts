import * as fs from 'fs';
import * as path from 'path';
import type { Frame, Page } from '@playwright/test';
import { expect } from '../../utils/fixtures';
import {
  openCollectionSettings,
  openRequestPaneTab,
  mockBrowseFiles,
  setCodeMirrorValue,
  findCollectionDir
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';


const DOMAIN = 'localhost';

// Node surfaces an mTLS rejection as an OpenSSL handshake alert.
export const TLS_HANDSHAKE_FAILURE =
  /certificate required|handshake failure|bad certificate|tlsv1.*alert|sslv3 alert|SSL alert number|SSL routines|socket hang up|EPROTO/i;

async function pickFile(settings: Frame, field: 'cert' | 'key' | 'pfx', filePath: string): Promise<void> {
  const certs = buildCommonLocators(settings).clientCerts;

  await mockBrowseFiles(settings, [filePath]);
  await certs.filePicker(field).click();
  await expect(certs.pickedFile(field)).toHaveText(path.basename(filePath));
}

export async function addCertificate(
  page: Page,
  settings: Frame,
  cert: { certPath: string; keyPath: string } | { pfxPath: string; passphrase: string }
): Promise<void> {
  const certs = buildCommonLocators(settings).clientCerts;

  await certs.domainInput().fill(DOMAIN);

  if ('pfxPath' in cert) {
    await certs.pfxRadio().check();
    await pickFile(settings, 'pfx', cert.pfxPath);
    await setCodeMirrorValue(page, certs.passphraseEditor(), cert.passphrase);
  } else {
    await pickFile(settings, 'cert', cert.certPath);
    await pickFile(settings, 'key', cert.keyPath);
  }

  await certs.addButton().click();
  await expect(certs.rows()).toHaveCount(1);
  await certs.saveButton().click();
}

/** Cert paths recorded in the collection config, resolved against the collection dir. */
export function storedCertPaths(tmpDir: string): string[] {
  const collectionDir = findCollectionDir(tmpDir, 'opencollection.yml');
  const config = fs.readFileSync(path.join(collectionDir, 'opencollection.yml'), 'utf8');

  return [...config.matchAll(/(?:certificateFilePath|privateKeyFilePath|pkcs12FilePath):\s*(\S+)/g)]
    .map((match) => path.resolve(collectionDir, match[1]));
}

export async function openClientCertsTab(page: Page, sidebar: Frame, collectionName: string): Promise<Frame> {
  const settings = await openCollectionSettings(page, sidebar, collectionName);
  await openRequestPaneTab(settings, 'Client Certificates');
  return settings;
}
