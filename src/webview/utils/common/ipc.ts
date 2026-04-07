export const callIpc = <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => {
  const { ipcRenderer } = window;
  if (!ipcRenderer) {
    return Promise.reject(new Error('IPC Renderer not available'));
  }

  return ipcRenderer.invoke<T>(channel, ...args);
};
