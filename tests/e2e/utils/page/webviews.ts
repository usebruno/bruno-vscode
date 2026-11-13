import { Frame, FrameLocator, Locator, Page, expect } from '@playwright/test';

/**
 * Finding and talking to Bruno's webview panels (request editor, settings,
 * import, clone, …). The sidebar driver and the shared actions both use it.
 */

// The editor pane currently in focus (request, folder settings or collection settings).
export const activeEditor = (page: Page): FrameLocator =>
  page.frameLocator('iframe.webview.ready:visible:right-of(.part.sidebar)').last().frameLocator('#active-frame');

// Find the webview Frame that contains the given marker selector, skipping `existingFrame`.
export async function getWebviewFrame(
  page: Page,
  markerSelector: (frame: Frame) => Locator,
  existingFrame?: Frame,
  timeout = 20_000
): Promise<Frame> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame() || frame === existingFrame) continue;
      try {
        if (await markerSelector(frame).count() > 0) return frame;
      } catch {
        // frame may have been detached, skip
      }
    }
    await page.waitForTimeout(500);
  }

  throw new Error(`Could not find a webview frame within ${timeout}ms`);
}

/**
 * Get a FrameLocator for a webview by its panel title.
 *
 * VS Code nests each webview as `iframe.webview[name=<uuid>]` > `iframe#active-frame[title=...]`.
 * Only the inner iframe carries the title and the outer one has nothing but a random
 * uuid, so a plain locator chain can't target a panel. We look up the outer iframe's
 * name once, then return a regular (lazy, auto-waiting) locator chain pinned to it.
 */
export async function getWebviewByTitle(page: Page, title: string, timeout = 20_000): Promise<FrameLocator> {
  let outerName: string | undefined;
  await expect.poll(async () => {
    for (const frame of page.frames()) {
      const outer = frame.parentFrame();
      // Only inner `#active-frame`s carry the title; skip top-level and outer frames.
      if (!outer || outer === page.mainFrame()) {
        continue;
      };

      const el = await frame.frameElement().catch(() => null);
      if (el && await el.getAttribute('title').catch(() => null) === title) {
        outerName = outer.name();
        return true;
      }
    }
    return false;
  }, { timeout, message: `Webview "${title}" not found` }).toBe(true);

  return page.locator(`iframe.webview[name="${outerName}"]`).contentFrame()
    .locator(`iframe#active-frame[title="${title}"]`).contentFrame();
}

/**
 * Mock the next `channelName` IPC call made from `frame` to return `value`.
 *
 * The webview shim assigns `ipcRenderer` to `window`, and Redux actions read
 * from `window.ipcRenderer.invoke`. We intercept that single call so a native
 * dialog is bypassed and the value flows into the form.
 */
export async function mockIpcInvoke(frame: Frame, channelName: string, value: unknown): Promise<void> {
  await frame.evaluate(({ channelName, value }) => {
    const ipc = (window as any).ipcRenderer;
    // Reuse the real invoke if a mock is still pending, so mocking again replaces it rather than stacking.
    const originalInvoke = ipc.__originalInvoke ?? ipc.invoke.bind(ipc);
    ipc.__originalInvoke = originalInvoke;
    ipc.invoke = async (channel: string, ...args: any[]) => {
      if (channel === channelName) {
        ipc.invoke = originalInvoke;
        delete ipc.__originalInvoke;
        return value;
      }
      return originalInvoke(channel, ...args);
    };
  }, { channelName, value });
}

/** Mock the next `renderer:browse-files` call to return `filePaths`. */
export async function mockBrowseFiles(frame: Frame, filePaths: string[]): Promise<void> {
  await mockIpcInvoke(frame, 'renderer:browse-files', filePaths);
}
