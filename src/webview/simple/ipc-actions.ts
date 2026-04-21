import { ipcRenderer } from 'utils/ipc';

export const browseDirectory = (): Promise<string | null> =>
  ipcRenderer.invoke('renderer:browse-directory');

export const browseCloneLocation = (): Promise<string | null> =>
  ipcRenderer.invoke('clone-collection:browse-location', {});

export const createCollection = (
  name: string,
  folderName: string,
  location: string,
  options: { format?: string } = {}
): Promise<{ uid: string; brunoConfig: any; collectionPath: string }> =>
  ipcRenderer.invoke('renderer:create-collection', name, folderName, location, options);

export const cloneCollection = (
  name: string,
  folderName: string,
  location: string,
  previousPath: string
): Promise<unknown> =>
  ipcRenderer.invoke('renderer:clone-collection', name, folderName, location, previousPath);

export const importCollection = (
  collection: unknown,
  location: string,
  format: string
): Promise<string> =>
  ipcRenderer.invoke('renderer:import-collection', collection, location, format);

export const importCollectionFromZip = (
  zipFilePath: string,
  location: string
): Promise<string> =>
  ipcRenderer.invoke('renderer:import-collection-zip', zipFilePath, location);

export const addCollectionToWorkspace = (
  workspacePath: string,
  workspaceCollection: { name: string; path: string }
): Promise<unknown> =>
  ipcRenderer.invoke('renderer:add-collection-to-workspace', workspacePath, workspaceCollection);

export const validateAndSaveZip = (
  base64Data: string,
  fileName: string
): Promise<{ valid: boolean; tempZipPath: string }> =>
  ipcRenderer.invoke('renderer:validate-and-save-zip', base64Data, fileName);
