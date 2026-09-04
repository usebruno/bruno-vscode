import * as fs from 'fs';
import * as path from 'path';
import type { Frame, Page } from '@playwright/test';
import { test, expect } from '../../utils/fixtures';
import {
  CLIENT_CERT,
  CLIENT_KEY,
  CLIENT_PFX,
  MTLS_GRPC_URL,
  PFX_PASSPHRASE
} from './server/mtls-certs';
import {
  openBrunoSidebar,
  createCollection,
  createRequestByType,
  openGrpcRequest,
  loadGrpcProtoFile,
  selectGrpcMethod,
  setGrpcMessage,
  findCollectionDir
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';
import { GRPC_HANDSHAKE_FAILURE, addCertificate, storedCertPaths, openClientCertsTab } from './helpers';

const GRPC_REQUEST = 'grpc-request';

async function setupGrpcCollection(
  page: Page,
  tmpDir: string,
  collectionName: string
): Promise<{ sidebar: Frame; protoPath: string }> {
  const sidebar = await openBrunoSidebar(page);
  await createCollection(page, sidebar, collectionName, tmpDir);

  const protoPath = path.join(findCollectionDir(tmpDir, 'opencollection.yml'), 'echo.proto');
  fs.copyFileSync(path.resolve(__dirname, '../../utils/fixtures/echo.proto'), protoPath);

  await createRequestByType(page, sidebar, collectionName, {
    name: GRPC_REQUEST,
    url: MTLS_GRPC_URL,
    type: 'gRPC'
  });

  return { sidebar, protoPath };
}

async function sendEcho(page: Page, editor: Frame, protoPath: string): Promise<void> {
  const grpc = buildCommonLocators(editor).grpc;

  if (!(await grpc.selectedMethodName().isVisible().catch(() => false))) {
    await loadGrpcProtoFile(editor, protoPath);
    await selectGrpcMethod(editor, 'Echo');
  }

  await setGrpcMessage(page, editor, '{"message":"hi"}');
  await grpc.sendRequestButton().click();
}

test.describe('Collection client certificates - grpcs', () => {
  test('a PEM cert/key is attached on grpcs', async ({ page, tmpDir }) => {
    const collectionName = 'Certs Grpc';
    const { sidebar, protoPath } = await setupGrpcCollection(page, tmpDir, collectionName);

    await test.step('without a certificate the server rejects the request', async () => {
      const editor = await openGrpcRequest(page, sidebar, collectionName, GRPC_REQUEST);
      const grpc = buildCommonLocators(editor).grpc;
      await sendEcho(page, editor, protoPath);
      const error = grpc.errorMessage();
      await expect(error).toBeVisible();
      await expect(error).toHaveText(GRPC_HANDSHAKE_FAILURE);
    });

    await test.step('adding the certificate records it in the collection config', async () => {
      const settings = await openClientCertsTab(page, sidebar, collectionName);
      const locators = buildCommonLocators(settings);
      await expect(locators.clientCerts.emptyMessage()).toBeVisible();
      await addCertificate(page, settings, { certPath: CLIENT_CERT, keyPath: CLIENT_KEY });
      await expect.poll(() => storedCertPaths(tmpDir)).toHaveLength(2);
    });

    await test.step('grpcs carries the certificate', async () => {
      const editor = await openGrpcRequest(page, sidebar, collectionName, GRPC_REQUEST);
      const grpc = buildCommonLocators(editor).grpc;
      await sendEcho(page, editor, protoPath);
      await expect(grpc.responseContent()).toContainText('mTLS ok');
    });
  });

  test('a PFX bundle is attached on grpcs', async ({ page, tmpDir }) => {
    const collectionName = 'Certs Grpc Pfx';
    const { sidebar, protoPath } = await setupGrpcCollection(page, tmpDir, collectionName);

    const settings = await openClientCertsTab(page, sidebar, collectionName);
    await addCertificate(page, settings, { pfxPath: CLIENT_PFX, passphrase: PFX_PASSPHRASE });
    await expect.poll(() => storedCertPaths(tmpDir)).toHaveLength(1);

    const editor = await openGrpcRequest(page, sidebar, collectionName, GRPC_REQUEST);
    const grpc = buildCommonLocators(editor).grpc;
    await sendEcho(page, editor, protoPath);
    await expect(grpc.responseContent()).toContainText('mTLS ok');
  });
});
