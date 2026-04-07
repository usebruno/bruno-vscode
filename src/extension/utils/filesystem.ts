import path from 'path';
import fs from 'fs-extra';
import fsPromises from 'fs/promises';
import isValidPathname from 'is-valid-path';
import os from 'os';
import * as vscode from 'vscode';

type CollectionFormat = 'bru' | 'yml';

interface CollectionStats {
  size: number;
  filesCount: number;
  maxFileSize: number;
}

export const exists = async (p: string): Promise<boolean> => {
  try {
    await fsPromises.access(p);
    return true;
  } catch {
    return false;
  }
};

export const isSymbolicLink = (filepath: string): boolean => {
  try {
    return fs.existsSync(filepath) && fs.lstatSync(filepath).isSymbolicLink();
  } catch {
    return false;
  }
};

export const isFile = (filepath: string): boolean => {
  try {
    return fs.existsSync(filepath) && fs.lstatSync(filepath).isFile();
  } catch {
    return false;
  }
};

export const isDirectory = (dirPath: string): boolean => {
  try {
    return fs.existsSync(dirPath) && fs.lstatSync(dirPath).isDirectory();
  } catch {
    return false;
  }
};

export const isValidCollectionDirectory = (dirPath: string): boolean => {
  if (!isDirectory(dirPath)) {
    return false;
  }
  const brunoJsonPath = path.join(dirPath, 'bruno.json');
  const opencollectionYmlPath = path.join(dirPath, 'opencollection.yml');
  return fs.existsSync(brunoJsonPath) || fs.existsSync(opencollectionYmlPath);
};

export const hasSubDirectories = (dir: string): boolean => {
  const files = fs.readdirSync(dir);
  return files.some((file) => fs.statSync(path.join(dir, file)).isDirectory());
};

export function isWSLPath(pathname: string): boolean {
  return pathname.startsWith('\\\\') || pathname.startsWith('//') ||
         pathname.startsWith('/wsl.localhost/') || pathname.startsWith('\\wsl.localhost');
}

export function normalizeWSLPath(pathname: string): string {
  return pathname.replace(/^\/wsl.localhost/, '\\\\wsl.localhost').replace(/\//g, '\\');
}

export const normalizeAndResolvePath = (pathname: string): string => {
  if (isWSLPath(pathname)) {
    return normalizeWSLPath(pathname);
  }

  if (isSymbolicLink(pathname)) {
    const absPath = path.dirname(pathname);
    const targetPath = path.resolve(absPath, fs.readlinkSync(pathname));
    if (isFile(targetPath) || isDirectory(targetPath)) {
      return path.resolve(targetPath);
    }
    console.error(`Cannot resolve link target "${pathname}" (${targetPath}).`);
    return '';
  }
  return path.resolve(pathname);
};

export const getSafePathToWrite = (filePath: string): string => {
  const MAX_FILENAME_LENGTH = 255;
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  let base = path.basename(filePath, ext);
  if (base.length + ext.length > MAX_FILENAME_LENGTH) {
    base = sanitizeName(base);
    base = base.slice(0, MAX_FILENAME_LENGTH - ext.length);
  }
  return path.join(dir, base + ext);
};

export async function safeWriteFile(filePath: string, data: string | Buffer, options?: { encoding?: BufferEncoding | null }): Promise<void> {
  const safePath = getSafePathToWrite(filePath);
  try {
    fs.outputFileSync(safePath, data, options);
  } catch (err) {
    console.error(`Error writing file at ${safePath}:`, err);
    throw err;
  }
}

export function safeWriteFileSync(filePath: string, data: string | Buffer): void {
  const safePath = getSafePathToWrite(filePath);
  fs.writeFileSync(safePath, data);
}

export const writeFile = async (pathname: string, content: string | Buffer, isBinary = false): Promise<void> => {
  try {
    await safeWriteFile(pathname, content, {
      encoding: !isBinary ? 'utf-8' : null
    });
  } catch (err) {
    console.error(`Error writing file at ${pathname}:`, err);
    throw err;
  }
};

export const hasJsonExtension = (filename: string): boolean => {
  if (!filename || typeof filename !== 'string') return false;
  return filename.toLowerCase().endsWith('.json');
};

export const hasBruExtension = (filename: string): boolean => {
  if (!filename || typeof filename !== 'string') return false;
  return filename.toLowerCase().endsWith('.bru');
};

export const hasRequestExtension = (filename: string, format: string | null = null): boolean => {
  if (!filename || typeof filename !== 'string') return false;

  if (format) {
    const ext = format === 'yml' ? 'yml' : 'bru';
    return filename.toLowerCase().endsWith(`.${ext}`);
  }

  return ['bru', 'yml'].some((ext) => filename.toLowerCase().endsWith(`.${ext}`));
};

export const createDirectory = async (dir: string): Promise<void> => {
  if (!dir) {
    throw new Error(`directory: path is null`);
  }

  if (fs.existsSync(dir)) {
    throw new Error(`directory: ${dir} already exists`);
  }

  fs.mkdirSync(dir);
};

export const browseDirectory = async (): Promise<string | false> => {
  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Select Folder'
  });

  if (!uris || !uris[0]) {
    return false;
  }

  const resolvedPath = uris[0].fsPath;
  return isDirectory(resolvedPath) ? resolvedPath : false;
};

export const browseFiles = async (filters?: { name: string; extensions: string[] }[]): Promise<string[]> => {
  const vscodeFilters: { [key: string]: string[] } = {};
  if (filters) {
    for (const filter of filters) {
      vscodeFilters[filter.name] = filter.extensions;
    }
  }

  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: true,
    filters: vscodeFilters
  });

  if (!uris) {
    return [];
  }

  return uris.map((uri) => uri.fsPath).filter((filePath) => isFile(filePath));
};

export const chooseFileToSave = async (preferredFileName = ''): Promise<string | undefined> => {
  const uri = await vscode.window.showSaveDialog({
    defaultUri: preferredFileName ? vscode.Uri.file(preferredFileName) : undefined
  });

  return uri?.fsPath;
};

export const searchForFiles = (dir: string, extension: string): string[] => {
  let results: string[] = [];
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      results = results.concat(searchForFiles(filePath, extension));
    } else if (path.extname(file) === extension) {
      results.push(filePath);
    }
  }
  return results;
};

export const getCollectionFormat = (collectionPath: string): CollectionFormat => {
  const ocYmlPath = path.join(collectionPath, 'opencollection.yml');
  if (fs.existsSync(ocYmlPath)) {
    return 'yml';
  }

  const brunoJsonPath = path.join(collectionPath, 'bruno.json');
  if (fs.existsSync(brunoJsonPath)) {
    return 'bru';
  }

  throw new Error(`No collection configuration found at: ${collectionPath}`);
};

export const searchForRequestFiles = (dir: string, collectionPath: string | null = null): string[] => {
  const format = getCollectionFormat(collectionPath || dir);
  if (format === 'yml') {
    return searchForFiles(dir, '.yml');
  } else if (format === 'bru') {
    return searchForFiles(dir, '.bru');
  } else {
    throw new Error(`Invalid format: ${format}`);
  }
};

export const sanitizeName = (name: string): string => {
  const invalidCharacters = /[<>:"/\\|?*\x00-\x1F]/g;
  name = name
    .replace(invalidCharacters, '-')
    .replace(/^[\s\-]+/, '')
    .replace(/[.\s]+$/, '');
  return name;
};

export const isWindowsOS = (): boolean => {
  return os.platform() === 'win32';
};

export const generateUniqueName = (baseName: string, checkExists: (name: string) => boolean): string => {
  if (!checkExists(baseName)) {
    return baseName;
  }

  let counter = 1;
  let uniqueName = `${baseName} copy`;

  while (checkExists(uniqueName)) {
    counter++;
    uniqueName = `${baseName} copy ${counter}`;
  }
  return uniqueName;
};

export const validateName = (name: string): boolean => {
  const reservedDeviceNames = /^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])$/i;
  const firstCharacter = /^[^\s\-<>:"/\\|?*\x00-\x1F]/;
  const middleCharacters = /^[^<>:"/\\|?*\x00-\x1F]*$/;
  const lastCharacter = /[^.\s<>:"/\\|?*\x00-\x1F]$/;

  if (name.length > 255) return false;
  if (reservedDeviceNames.test(name)) return false;

  return (
    firstCharacter.test(name) &&
    middleCharacters.test(name) &&
    lastCharacter.test(name)
  );
};

export const safeToRename = (oldPath: string, newPath: string): boolean => {
  try {
    if (!fs.existsSync(newPath)) {
      return true;
    }

    const oldStat = fs.statSync(oldPath);
    const newStat = fs.statSync(newPath);

    if (isWindowsOS()) {
      return oldStat.birthtimeMs === newStat.birthtimeMs && oldStat.size === newStat.size;
    }
    return oldStat.ino === newStat.ino;
  } catch (error) {
    console.error(`Error checking file rename safety for ${oldPath} and ${newPath}:`, error);
    return false;
  }
};

export const sizeInMB = (size: number): number => {
  return size / (1024 * 1024);
};

export const getCollectionStats = async (directoryPath: string): Promise<CollectionStats> => {
  let size = 0;
  let filesCount = 0;
  let maxFileSize = 0;

  let targetExt = '.bru';
  try {
    const format = getCollectionFormat(directoryPath);
    targetExt = format === 'yml' ? '.yml' : '.bru';
  } catch {
    // If format can't be determined, default to .bru
  }

  async function calculateStats(directory: string): Promise<void> {
    const entries = await fsPromises.readdir(directory, { withFileTypes: true });

    const tasks = entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        if (['node_modules', '.git'].includes(entry.name)) {
          return;
        }
        await calculateStats(fullPath);
      }

      if (path.extname(fullPath) === targetExt) {
        const stats = await fsPromises.stat(fullPath);
        size += stats.size;
        if (maxFileSize < stats.size) {
          maxFileSize = stats.size;
        }
        filesCount += 1;
      }
    });

    await Promise.all(tasks);
  }

  await calculateStats(directoryPath);

  return {
    size: sizeInMB(size),
    filesCount,
    maxFileSize: sizeInMB(maxFileSize)
  };
};

export const copyPath = async (source: string, destination: string): Promise<void> => {
  const targetPath = `${destination}/${path.basename(source)}`;

  const targetPathExists = await fsPromises.access(targetPath).then(() => true).catch(() => false);
  if (targetPathExists) {
    throw new Error(`Cannot copy, ${path.basename(source)} already exists in ${path.basename(destination)}`);
  }

  const copy = async (src: string, dest: string): Promise<void> => {
    const stat = await fsPromises.lstat(src);
    if (stat.isDirectory()) {
      await fsPromises.mkdir(dest, { recursive: true });
      const entries = await fsPromises.readdir(src);
      for (const entry of entries) {
        const srcPath = path.join(src, entry);
        const destPath = path.join(dest, entry);
        await copy(srcPath, destPath);
      }
    } else {
      await fsPromises.copyFile(src, dest);
    }
  };

  await copy(source, targetPath);
};

export const removePath = async (source: string): Promise<void> => {
  const stat = await fsPromises.lstat(source);
  if (stat.isDirectory()) {
    const entries = await fsPromises.readdir(source);
    for (const entry of entries) {
      const entryPath = path.join(source, entry);
      await removePath(entryPath);
    }
    await fsPromises.rmdir(source);
  } else {
    await fsPromises.unlink(source);
  }
};

export const getPaths = async (source: string): Promise<string[]> => {
  const paths: string[] = [];

  const _getPaths = async (src: string): Promise<void> => {
    const stat = await fsPromises.lstat(src);
    paths.push(src);
    if (stat.isDirectory()) {
      const entries = await fsPromises.readdir(src);
      for (const entry of entries) {
        const entryPath = path.join(src, entry);
        await _getPaths(entryPath);
      }
    }
  };

  await _getPaths(source);
  return paths;
};

export const isLargeFile = (filePath: string, threshold = 10 * 1024 * 1024): boolean => {
  if (!isFile(filePath)) {
    throw new Error(`File ${filePath} is not a file`);
  }
  const size = fs.statSync(filePath).size;
  return size > threshold;
};

export const isDotEnvFile = (pathname: string, collectionPath: string): boolean => {
  const dirname = path.dirname(pathname);
  const basename = path.basename(pathname);
  return dirname === collectionPath && basename === '.env';
};

export const isBrunoConfigFile = (pathname: string, collectionPath: string): boolean => {
  const dirname = path.dirname(pathname);
  const basename = path.basename(pathname);
  return dirname === collectionPath && (basename === 'bruno.json' || basename === 'opencollection.yml');
};

export const isBruEnvironmentConfig = (pathname: string, collectionPath: string): boolean => {
  const dirname = path.dirname(pathname);
  const envDirectory = path.join(collectionPath, 'environments');
  const basename = path.basename(pathname);
  return dirname === envDirectory && (hasBruExtension(basename) || basename.toLowerCase().endsWith('.yml'));
};

export const isCollectionRootBruFile = (pathname: string, collectionPath: string): boolean => {
  const dirname = path.dirname(pathname);
  const basename = path.basename(pathname);
  return dirname === collectionPath && (basename === 'collection.bru' || basename === 'opencollection.yml');
};

export { isValidPathname };
