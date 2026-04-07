import * as vscode from 'vscode';

interface IpcResponse {
  type: 'response' | 'event';
  channel?: string;
  requestId?: string;
  result?: unknown;
  error?: string;
  args?: unknown[];
}

export class WebviewStateManager {
  private webviews: Set<vscode.Webview> = new Set();

  addWebview(webview: vscode.Webview): void {
    this.webviews.add(webview);
  }

  removeWebview(webview: vscode.Webview): void {
    this.webviews.delete(webview);
  }

  broadcast(channel: string, ...args: unknown[]): void {
    const message: IpcResponse = {
      type: 'event',
      channel,
      args
    };
    for (const webview of this.webviews) {
      webview.postMessage(message);
    }
  }

  sendTo(webview: vscode.Webview, channel: string, ...args: unknown[]): void {
    const message: IpcResponse = {
      type: 'event',
      channel,
      args
    };
    webview.postMessage(message);
  }

  dispose(): void {
    this.webviews.clear();
  }
}

export const stateManager = new WebviewStateManager();
