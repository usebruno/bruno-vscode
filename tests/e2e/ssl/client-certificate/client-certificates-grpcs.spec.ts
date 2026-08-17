import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '../../utils/fixtures';
import { CLIENT_CERT, CLIENT_KEY, MTLS_GRPC_URL } from './server/mtls-certs';
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
import { addCertificate, storedCertPaths, openClientCertsTab } from './helpers'; 

const GRPC_REQUEST = 'grpc-request';

test.describe('Collection client certificates - grpcs', () => {
  test('a PEM cert/key is attached on grpcs', async ({ page, tmpDir }) => {
    const collectionName = 'Certs Grpc';
    const sidebar = await openBrunoSidebar(page);
    await createCollection(page, sidebar, collectionName, tmpDir);

    // gRPC loads its methods from a proto file rather than server reflection.
    const protoInCollection = path.join(findCollectionDir(tmpDir, 'opencollection.yml'), 'echo.proto');
    fs.copyFileSync(path.resolve(__dirname, '../../utils/fixtures/echo.proto'), protoInCollection);

    await createRequestByType(page, sidebar, collectionName, {
      name: GRPC_REQUEST,
      url: MTLS_GRPC_URL,
      type: 'gRPC'
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
      await loadGrpcProtoFile(editor, protoInCollection);
      await selectGrpcMethod(editor, 'Echo');
      await setGrpcMessage(page, editor, '{"message":"hi"}');
      await grpc.sendRequestButton().click();
      await expect(grpc.responseContent()).toContainText('mTLS ok');
    });
  });
});
