import { test, expect } from '../../utils/fixtures';
import {
  openBrunoSidebar,
  createCollection,
  createGrpcRequestWithProto
} from '../../utils/page/actions';
import { buildCommonLocators } from '../../utils/page/locators';

test.describe('gRPC method search', () => {
  test('the dropdown stays open and filters while typing in the search input', async ({ page, tmpDir }) => {
    const collectionName = 'gRPC Method Search';
    const sidebar = await openBrunoSidebar(page);
    await createCollection(page, sidebar, collectionName, tmpDir);

    const editor = await createGrpcRequestWithProto(page, sidebar, collectionName, {
      name: 'MethodSearch',
      protoFixture: 'streaming.proto',
      targetDir: tmpDir
    });
    const grpc = buildCommonLocators(editor).grpc;

    await grpc.methodDropdownTrigger().click();
    await expect(grpc.methodsList()).toBeVisible();
    await expect(grpc.methodItems()).toHaveCount(4);

    const searchInput = grpc.methodsSearchInput();
    await expect(searchInput).toBeFocused();

    await searchInput.pressSequentially('Sub', { delay: 50 });
    await expect(grpc.methodsList()).toBeVisible();
    await expect(searchInput).toHaveValue('Sub');
    await expect(grpc.methodItems()).toHaveCount(1);
    await expect(grpc.methodItem('Subscribe')).toBeVisible();

    await searchInput.fill('');
    await expect(grpc.methodsList()).toBeVisible();
    await expect(grpc.methodItems()).toHaveCount(4);

    await searchInput.pressSequentially('zzz', { delay: 50 });
    await expect(grpc.methodsList()).toBeVisible();
    await expect(grpc.methodItems()).toHaveCount(0);
    await expect(editor.locator('.method-dropdown-empty-state')).toBeVisible();

    await searchInput.fill('');
    await searchInput.pressSequentially('Chat', { delay: 50 });
    await grpc.methodItem('Chat').click();
    await expect(grpc.selectedMethodName()).toContainText('Chat');
  });
});
