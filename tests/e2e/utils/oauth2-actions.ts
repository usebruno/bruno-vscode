import { Page, Frame, expect } from '@playwright/test';

/**
 * Type a value into a SingleLineEditor (CodeMirror) field identified by its
 * data-testid (e.g. "oauth2-field-clientId") or label text as fallback.
 *
 * Waits for focus before typing, presses Tab to blur and commit the onChange,
 * then waits for the focus class to disappear. Includes a 500ms settle time
 * for CodeMirror→Redux propagation (no DOM signal available for this).
 */
export async function fillOAuth2Field(page: Page, editor: Frame, fieldKey: string, value: string) {
  // Try data-testid first, fall back to label text
  let row = editor.locator(`[data-testid="oauth2-field-${fieldKey}"]`);
  if (await row.count() === 0) {
    row = editor.locator(`label:has-text("${fieldKey}")`).locator('..');
  }

  const cmEditor = row.locator('.CodeMirror');
  await expect(cmEditor).toBeVisible({ timeout: 5_000 });
  await cmEditor.click();
  await expect(row.locator('.CodeMirror-focused')).toBeVisible({ timeout: 2_000 });

  // Clear existing content: triple-click to select all (works reliably in CodeMirror)
  await cmEditor.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');

  // Type new value
  await page.keyboard.type(value, { delay: 15 });

  // Blur by pressing Tab — triggers CodeMirror onChange
  await page.keyboard.press('Tab');
  await expect(row.locator('.CodeMirror-focused')).not.toBeVisible({ timeout: 2_000 });

  // Allow Redux to process the onChange dispatch
  await page.waitForTimeout(500);
}

/**
 * Click a dropdown trigger and select an item by text.
 * Accepts either a data-testid or CSS selector for the trigger.
 * Waits for the dropdown item to appear, clicks it, waits for it to disappear.
 */
export async function selectDropdownItem(editor: Frame, triggerSelector: string, itemText: string) {
  await editor.locator(triggerSelector).click();
  const item = editor.locator('.dropdown-item').filter({ hasText: itemText });
  await expect(item).toBeVisible({ timeout: 5_000 });
  await item.click();
  await expect(item).not.toBeVisible({ timeout: 2_000 });
}

/**
 * Re-acquire the editor frame (VS Code may detach/recreate webview frames).
 * Falls back to the provided frame if no active editor is found.
 */
export async function getActiveEditorFrame(page: Page, fallback: Frame): Promise<Frame> {
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    try {
      if (await frame.locator('#send-request').count() > 0) return frame;
    } catch { /* skip detached */ }
  }
  return fallback;
}
