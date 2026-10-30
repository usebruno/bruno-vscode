import { describe, test, expect, vi } from 'vitest';
import vm from 'node:vm';
import * as vscode from 'vscode';
import { LogsViewProvider } from './LogsViewProvider';

const { storedLogs } = vi.hoisted(() => ({
  storedLogs: [{ id: '1', timestamp: 0, type: 'log', args: ['hello'] }]
}));

vi.mock('../store/logs', () => ({
  default: {
    getLogs: () => storedLogs,
    onLogsChanged: () => ({ dispose: vi.fn() })
  }
}));

const resolveView = () => {
  let onMessage: (message: { command: string }) => void = () => {};
  const webview = {
    options: {},
    html: '',
    postMessage: vi.fn(),
    onDidReceiveMessage: (listener: typeof onMessage) => {
      onMessage = listener;
      return { dispose: vi.fn() };
    }
  };
  const provider = new LogsViewProvider(vscode.Uri.file('/ext') as never);
  provider.resolveWebviewView({ webview, title: '' } as never, {} as never, {} as never);
  return { webview, send: (command: string) => onMessage({ command }) };
};

// Runs the view's inline script against a minimal DOM and returns what it posts to the extension.
const runInlineScript = (html: string): unknown[] => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  const posted: unknown[] = [];
  const element = () => ({ addEventListener: vi.fn(), appendChild: vi.fn(), style: {} });
  vm.runInNewContext(script, {
    acquireVsCodeApi: () => ({ postMessage: (message: unknown) => posted.push(message) }),
    document: { getElementById: element, querySelectorAll: (): unknown[] => [] },
    window: { addEventListener: vi.fn() }
  });
  return posted;
};

describe('LogsViewProvider', () => {
  test('the webview asks for the logs every time its document loads', () => {
    const { webview } = resolveView();
    expect(runInlineScript(webview.html)).toEqual([{ command: 'ready' }]);
  });

  test('answers each ready message with all stored logs', () => {
    const { webview, send } = resolveView();

    send('ready');
    // Second load: the view was hidden and shown again, so its document was recreated.
    send('ready');

    expect(webview.postMessage).toHaveBeenCalledTimes(2);
    expect(webview.postMessage).toHaveBeenLastCalledWith({ command: 'updateLogs', logs: storedLogs });
  });
});
