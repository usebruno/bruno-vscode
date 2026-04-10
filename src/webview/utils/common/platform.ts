import trim from 'lodash/trim';
import platform from 'platform';
import path from './path';

export const isElectron = (): boolean => {
  return false;
};

export const isVsCode = (): boolean => {
  return true;
};

export const hasPlatformSupport = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.ipcRenderer !== undefined;
};

export const resolveRequestFilename = (name: string, extension: string = 'bru'): string => {
  return `${trim(name)}.${extension}`;
};

export const getSubdirectoriesFromRoot = (rootPath: string, pathname: string): string[] => {
  const relativePath = path.relative(rootPath, pathname);
  return relativePath ? relativePath.split('/').filter(Boolean) : [];
};

export const isWindowsOS = (): boolean => {
  const os = platform.os;
  if (!os || !os.family) return false;
  const osFamily = os.family.toLowerCase();
  return osFamily.includes('windows');
};

export const isMacOS = (): boolean => {
  const os = platform.os;
  if (!os || !os.family) return false;
  const osFamily = os.family.toLowerCase();
  return osFamily.includes('os x');
};

export const isLinuxOS = (): boolean => {
  const os = platform.os;
  if (!os || !os.family) return false;
  const osFamily = os.family.toLowerCase();
  return (
    osFamily.includes('linux') ||
    osFamily.includes('ubuntu') ||
    osFamily.includes('debian') ||
    osFamily.includes('fedora') ||
    osFamily.includes('centos') ||
    osFamily.includes('arch')
  );
};

export const getRevealInFolderLabel = (): string => {
  if (isMacOS()) return 'Reveal in Finder';
  if (isWindowsOS()) return 'Reveal in File Explorer';
  return 'Reveal in File Manager';
};

export const getAppInstallDate = (): Date => {
  let dateString = localStorage.getItem('bruno.installedOn');

  if (!dateString) {
    dateString = new Date().toISOString();
    localStorage.setItem('bruno.installedOn', dateString);
  }

  const date = new Date(dateString);
  return date;
};
