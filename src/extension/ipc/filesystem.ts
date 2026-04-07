
import fs from 'fs';
import path from 'path';
import { registerHandler } from './handlers';
import {
  browseDirectory,
  browseFiles,
  normalizeAndResolvePath,
  isFile,
  isDirectory,
  generateUniqueName
} from '../utils/filesystem';

interface FileFilter {
  name: string;
  extensions: string[];
}

const registerFilesystemIpc = (): void => {
  registerHandler('renderer:browse-directory', async () => {
    try {
      const result = await browseDirectory();
      return result;
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:browse-files', async (args) => {
    const [filters] = args as [FileFilter[]?];
    try {
      const result = await browseFiles(filters);
      return result;
    } catch (error) {
      throw error;
    }
  });

  registerHandler('renderer:exists-sync', async (args) => {
    const [filePath] = args as [string];
    try {
      const normalizedPath = normalizeAndResolvePath(filePath);
      return isFile(normalizedPath);
    } catch (error) {
      return false;
    }
  });

  registerHandler('renderer:resolve-path', async (args) => {
    const [relativePath, basePath] = args as [string, string];
    try {
      const resolvedPath = path.resolve(basePath, relativePath);
      return normalizeAndResolvePath(resolvedPath);
    } catch (error) {
      return relativePath;
    }
  });

  registerHandler('renderer:is-directory', async (args) => {
    const [pathname] = args as [string];
    return isDirectory(pathname);
  });

  registerHandler('renderer:export-environment', async (args) => {
    const [params] = args as [{ environments: any[]; environmentType: string; filePath: string; exportFormat?: string }];
    const { environments, environmentType, filePath, exportFormat = 'folder' } = params;

    const appVersion = '1.0.0';

    const environmentWithInfo = (environment: any) => ({
      name: environment.name,
      variables: environment.variables,
      info: {
        type: 'bruno-environment',
        exportedAt: new Date().toISOString(),
        exportedUsing: `Bruno/v${appVersion}`
      }
    });

    if (exportFormat === 'folder') {
      const baseFolderName = `bruno-${environmentType}-environments`;
      const uniqueFolderName = generateUniqueName(baseFolderName, (name) => fs.existsSync(path.join(filePath, name)));
      const exportPath = path.join(filePath, uniqueFolderName);

      fs.mkdirSync(exportPath, { recursive: true });

      for (const environment of environments) {
        const baseFileName = environment.name ? `${environment.name.replace(/[^a-zA-Z0-9-_]/g, '_')}` : 'environment';
        const uniqueFileName = generateUniqueName(baseFileName, (name) => fs.existsSync(path.join(exportPath, `${name}.json`)));
        const fullPath = path.join(exportPath, `${uniqueFileName}.json`);
        await fs.promises.writeFile(fullPath, JSON.stringify(environmentWithInfo(environment), null, 2), 'utf8');
      }
    } else if (exportFormat === 'single-file') {
      const baseFileName = `bruno-${environmentType}-environments`;
      const uniqueFileName = generateUniqueName(baseFileName, (name) => fs.existsSync(path.join(filePath, `${name}.json`)));
      const fullPath = path.join(filePath, `${uniqueFileName}.json`);

      const exportData = {
        info: {
          type: 'bruno-environment',
          exportedAt: new Date().toISOString(),
          exportedUsing: `Bruno/v${appVersion}`
        },
        environments
      };

      await fs.promises.writeFile(fullPath, JSON.stringify(exportData, null, 2), 'utf8');
    } else if (exportFormat === 'single-object') {
      if (environments.length !== 1) {
        throw new Error('Single object export requires exactly one environment');
      }

      const environment = environments[0];
      const baseFileName = environment.name ? `${environment.name.replace(/[^a-zA-Z0-9-_]/g, '_')}` : 'environment';
      const uniqueFileName = generateUniqueName(baseFileName, (name) => fs.existsSync(path.join(filePath, `${name}.json`)));
      const fullPath = path.join(filePath, `${uniqueFileName}.json`);
      await fs.promises.writeFile(fullPath, JSON.stringify(environmentWithInfo(environment), null, 2), 'utf8');
    } else {
      throw new Error(`Unsupported export format: ${exportFormat}`);
    }

    return { success: true };
  });
};

export default registerFilesystemIpc;
