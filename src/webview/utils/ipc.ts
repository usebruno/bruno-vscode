interface VsCodeApi {
  postMessage(message: any): void;
  getState(): unknown;
  setState(state: any): void;
}

interface IpcMessage {
  type: 'invoke' | 'send' | 'response' | 'event';
  channel: string;
  args?: unknown[];
  requestId?: string;
  result?: unknown;
  error?: string;
}

declare function acquireVsCodeApi(): VsCodeApi;

type EventCallback = (...args: unknown[]) => void;

const pendingRequests = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
const eventListeners = new Map<string, Set<EventCallback>>();

// This handles the case where extension sends events before React mounts
const eventQueue = new Map<string, Array<unknown[]>>();

let vscode: VsCodeApi | null = null;

function getVsCodeApi(): VsCodeApi {
  if (!vscode) {
    if (typeof acquireVsCodeApi === 'function') {
      try {
        vscode = acquireVsCodeApi();
      } catch (err) {
        console.error('[Bruno IPC] Error acquiring VS Code API:', err);
        throw err;
      }
    } else {
      console.error('[Bruno IPC] acquireVsCodeApi is not available');
      throw new Error('VS Code API not available');
    }
  }
  return vscode;
}

function initializeMessageHandler(): void {
  window.addEventListener('message', (event: MessageEvent<IpcMessage>) => {
    const message = event.data;

    // Guard against non-Bruno messages (VS Code sends various system messages)
    if (!message || typeof message !== 'object' || !message.type) {
      return;
    }

    if (message.type === 'response' && message.requestId) {
      const pending = pendingRequests.get(message.requestId);
      if (pending) {
        pendingRequests.delete(message.requestId);
        if (message.error) {
          pending.reject(new Error(message.error));
        } else {
          pending.resolve(message.result);
        }
      }
    }

    if (message.type === 'event' && message.channel) {
      const listeners = eventListeners.get(message.channel);
      const args = message.args || [];

      if (listeners && listeners.size > 0) {
        listeners.forEach(callback => {
          try {
            callback(...args);
          } catch (err) {
            console.error(`Error in IPC listener for channel ${message.channel}:`, err);
          }
        });
      } else {
        // No listeners yet - queue the event for later replay
        if (!eventQueue.has(message.channel)) {
          eventQueue.set(message.channel, []);
        }
        eventQueue.get(message.channel)!.push(args);
      }
    }
  });
}

try {
  initializeMessageHandler();
} catch (err) {
  console.error('[Bruno IPC] Failed to initialize message handler:', err);
}

export const ipcRenderer = {
  invoke: async <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject
      });

      try {
        getVsCodeApi().postMessage({
          type: 'invoke',
          channel,
          args,
          requestId
        } as IpcMessage);
      } catch (err) {
        pendingRequests.delete(requestId);
        reject(err);
      }

      setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          reject(new Error(`IPC invoke timeout for channel: ${channel}`));
        }
      }, 30000);
    });
  },

  on: (channel: string, callback: EventCallback): (() => void) => {
    if (!eventListeners.has(channel)) {
      eventListeners.set(channel, new Set());
    }
    eventListeners.get(channel)!.add(callback);

    // Replay any queued events for this channel
    const queuedEvents = eventQueue.get(channel);
    if (queuedEvents && queuedEvents.length > 0) {
      setTimeout(() => {
        queuedEvents.forEach(args => {
          try {
            callback(...args);
          } catch (err) {
            console.error(`Error replaying queued event for channel ${channel}:`, err);
          }
        });
        eventQueue.delete(channel);
      }, 0);
    }

    return () => {
      const listeners = eventListeners.get(channel);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          eventListeners.delete(channel);
        }
      }
    };
  },

  once: (channel: string, callback: EventCallback): (() => void) => {
    const wrappedCallback: EventCallback = (...args) => {
      unsubscribe();
      callback(...args);
    };
    const unsubscribe = ipcRenderer.on(channel, wrappedCallback);
    return unsubscribe;
  },

  send: (channel: string, ...args: unknown[]): void => {
    try {
      getVsCodeApi().postMessage({
        type: 'send',
        channel,
        args
      } as IpcMessage);
    } catch (err) {
      console.error(`Error sending IPC message to channel ${channel}:`, err);
    }
  },

  removeListener: (channel: string, callback: EventCallback): void => {
    const listeners = eventListeners.get(channel);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        eventListeners.delete(channel);
      }
    }
  },

  removeAllListeners: (channel?: string): void => {
    if (channel) {
      eventListeners.delete(channel);
    } else {
      eventListeners.clear();
    }
  },

  getFilePath: (file: File): string => {
    return (file as File & { path?: string }).path || file.name;
  },

  openExternal: (url: string): void => {
    ipcRenderer.send('open-external', url);
  }
};

(window as unknown as Window & { ipcRenderer?: typeof ipcRenderer }).ipcRenderer = ipcRenderer;

export const callIpc = <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => {
  return ipcRenderer.invoke<T>(channel, ...args);
};

export default ipcRenderer;
