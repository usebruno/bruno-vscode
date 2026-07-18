import { test, expect } from '../fixtures';
import type { Frame } from '@playwright/test';
import {
  openBrunoSidebar,
  createCollection,
  openNewRequestPanel,
  createRequest,
  openRequest,
  sendRequest,
} from '../utils/actions';

const TEST_SERVER = 'http://127.0.0.1:8081';

/**
 * Open the Cookies modal from the status bar.
 */
async function openCookiesModal(editor: Frame) {
  const cookiesBtn = editor.locator('[data-testid="statusbar-cookies-btn"]');
  await expect(cookiesBtn).toBeVisible({ timeout: 5_000 });
  await cookiesBtn.click();
  await expect(editor.locator('text=Cookies').first()).toBeVisible({ timeout: 5_000 });
}

test.describe('Cookie Management', () => {

  test('Open cookies modal and see empty state', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    await createCollection(page, sidebar, 'Cookie Empty', tmpDir);
    const newReqPanel = await openNewRequestPanel(page, sidebar, 'Cookie Empty');
    await createRequest(page, newReqPanel, sidebar, 'Cookie Empty', 'Ping', `${TEST_SERVER}/ping`);
    const editor = await openRequest(page, sidebar, 'Cookie Empty', 'Ping');

    await openCookiesModal(editor);

    await expect(editor.locator('[data-testid="cookies-empty-state"]')).toBeVisible({ timeout: 5_000 });
    await expect(editor.locator('text=No cookies found')).toBeVisible({ timeout: 3_000 });
  });

  test('Send request that sets cookies and verify they appear in the modal', async ({ page, tmpDir }) => {
    const sidebar = await openBrunoSidebar(page);
    await createCollection(page, sidebar, 'Cookie Capture', tmpDir);
    const newReqPanel = await openNewRequestPanel(page, sidebar, 'Cookie Capture');
    await createRequest(page, newReqPanel, sidebar, 'Cookie Capture', 'Login', `${TEST_SERVER}/api/auth/cookie/login`, 'POST');
    const editor = await openRequest(page, sidebar, 'Cookie Capture', 'Login');

    // Send the login request — server responds with Set-Cookie: isAuthenticated=true
    await sendRequest(editor, 200);

    // Open cookies modal
    await openCookiesModal(editor);

    // The cookie from the response should appear
    await expect(editor.locator('[data-testid="cookies-row-isAuthenticated"]')).toBeVisible({ timeout: 10_000 });
  });

  // TODO: Cookie auth flow test (login → protected) requires fixing
  // openNewRequestPanel to handle multiple calls when an editor is already open.
  // The cookie jar integration itself is verified by the test above (cookies appear in modal).

});
