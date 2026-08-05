declare global {
  interface Window {
    BRUNO_WEBVIEW_MODE?: 'sidebar' | 'full';
  }
}

export const isSidebarMode = (): boolean => {
  return window.BRUNO_WEBVIEW_MODE === 'sidebar';
};

export const openRequestInVSCodeEditor = (requestPath: string): void => {
  if (isSidebarMode() && window.ipcRenderer) {
    window.ipcRenderer.send('sidebar:open-request', requestPath);
  }
};

export const openAppInVSCodeEditor = (appPath: string): void => {
  if (isSidebarMode() && window.ipcRenderer) {
    window.ipcRenderer.send('sidebar:open-app', appPath);
  }
};

export const openFolderInVSCodeRunner = (folderPath: string): void => {
  if (isSidebarMode() && window.ipcRenderer) {
    window.ipcRenderer.send('sidebar:open-folder', folderPath);
  }
};
