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

// Ordered queue of events that arrived before React listeners registered.
// Preserves cross-channel ordering so main:collection-opened is always
// processed before main:collection-tree-updated regardless of when
// individual listeners register.
const pendingEventQueue: Array<{ channel: string; args: unknown[] }> = [];

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

/**
 * Core message handler — used by both the live event listener and the
 * early-buffer drain so that every message follows the same code path.
 */
function handleMessage(message: IpcMessage): void {
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
      // No listeners yet — push into ordered queue for later replay
      pendingEventQueue.push({ channel: message.channel, args });
    }
  }
}

/**
 * Drain any events from the ordered queue that now have a listener.
 * Called synchronously when a new listener registers, ensuring that
 * events replay in the exact order the extension sent them.
 */
function flushPendingEvents(): void {
  let i = 0;
  while (i < pendingEventQueue.length) {
    const { channel, args } = pendingEventQueue[i];
    const listeners = eventListeners.get(channel);
    if (listeners && listeners.size > 0) {
      pendingEventQueue.splice(i, 1);
      listeners.forEach(callback => {
        try {
          callback(...args);
        } catch (err) {
          console.error(`Error replaying event for channel ${channel}:`, err);
        }
      });
    } else {
      i++;
    }
  }
}

function initializeMessageHandler(): void {
  // Register the live message handler
  window.addEventListener('message', (event: MessageEvent<IpcMessage>) => {
    handleMessage(event.data);
  });

  // Drain the early message buffer that the inline HTML script captured
  // before this deferred script loaded. Set it to null so the inline
  // handler stops buffering (all future messages go through our listener).
  const earlyMessages = (window as unknown as { __brunoMessageBuffer?: IpcMessage[] | null }).__brunoMessageBuffer;
  (window as unknown as { __brunoMessageBuffer?: null }).__brunoMessageBuffer = null;

  if (earlyMessages && earlyMessages.length > 0) {
    for (const message of earlyMessages) {
      handleMessage(message);
    }
  }
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

    // Synchronously flush any pending events that now have listeners.
    // This preserves cross-channel ordering: if collection-opened was
    // queued before tree-updated, it replays first regardless of which
    // listener registers first.
    flushPendingEvents();

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
