
import * as vscode from 'vscode';

type IpcHandler = (args: unknown[]) => Promise<unknown>;

type IpcEventListener = (...args: unknown[]) => void;

// Message sender for sending messages to webview (variadic args)
type MessageSender = (channel: string, ...args: unknown[]) => void;

type WebviewSender = (webview: vscode.Webview, channel: string, ...args: unknown[]) => void;

const handlers: Map<string, IpcHandler> = new Map();
const eventListeners: Map<string, Set<IpcEventListener>> = new Map();

let messageSender: MessageSender | null = null;
let webviewSender: WebviewSender | null = null;

// Current webview context - set before handling a request, cleared after
// This allows handlers to send events only to the originating webview
let currentWebview: vscode.Webview | null = null;

export function setCurrentWebview(webview: vscode.Webview): void {
  currentWebview = webview;
}

export function clearCurrentWebview(): void {
  currentWebview = null;
}

export function getCurrentWebview(): vscode.Webview | null {
  return currentWebview;
}

export function setMessageSender(sender: MessageSender): void {
  messageSender = sender;
}

export function setWebviewSender(sender: WebviewSender): void {
  webviewSender = sender;
}

export function getMessageSender(): MessageSender | null {
  return messageSender;
}

/**
 * Send message to the current webview context (or broadcast if no context)
 * This is the primary function handlers should use - it automatically
 * routes to the correct webview based on which webview initiated the request
 */
export function sendToWebview(channel: string, ...args: unknown[]): void {
  // If we have a current webview context, send only to that webview
  if (currentWebview && webviewSender) {
    webviewSender(currentWebview, channel, ...args);
  } else if (messageSender) {
    messageSender(channel, ...args);
  }
}

/**
 * Broadcast message to ALL webviews (use for global events like collection changes)
 */
export function broadcastToAllWebviews(channel: string, ...args: unknown[]): void {
  if (messageSender) {
    messageSender(channel, ...args);
  }
}

export function registerHandler(channel: string, handler: IpcHandler): void {
  handlers.set(channel, handler);
}

export function registerEventListener(channel: string, listener: IpcEventListener): void {
  if (!eventListeners.has(channel)) {
    eventListeners.set(channel, new Set());
  }
  eventListeners.get(channel)!.add(listener);
}

export function removeEventListener(channel: string, listener: IpcEventListener): void {
  if (eventListeners.has(channel)) {
    eventListeners.get(channel)!.delete(listener);
  }
}

export function emit(channel: string, ...args: unknown[]): void {
  if (eventListeners.has(channel)) {
    for (const listener of eventListeners.get(channel)!) {
      try {
        listener(...args);
      } catch (error) {
        console.error(`Error in event listener for ${channel}:`, error);
      }
    }
  }
}

export async function handleInvoke(channel: string, args: unknown[]): Promise<unknown> {
  const handler = handlers.get(channel);
  if (handler) {
    try {
      return await handler(args);
    } catch (error) {
      console.error(`Error handling ${channel}:`, error);
      throw error;
    }
  } else {
    console.warn(`No handler registered for channel: ${channel}`);
    throw new Error(`No handler for channel: ${channel}`);
  }
}

export function hasHandler(channel: string): boolean {
  return handlers.has(channel);
}

export function getRegisteredChannels(): string[] {
  return Array.from(handlers.keys());
}

export function clearHandlers(): void {
  handlers.clear();
  eventListeners.clear();
  messageSender = null;
}

export function registerCoreHandlers(): void {
  // Handler for getting initial view data
  // Returns null since view data is sent via 'main:set-view' event after collection loads
  registerHandler('renderer:get-initial-view', async () => {
    return null;
  });
}

export {
  IpcHandler,
  IpcEventListener,
  MessageSender,
  WebviewSender
};
