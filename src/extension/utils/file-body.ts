import fs from 'fs';
import path from 'path';

export interface FileBodyEntry {
  filePath?: string | null;
  contentType?: string | null;
  selected?: boolean;
}

export interface FileBody {
  data: Buffer;
  contentType: string;
}

export const DEFAULT_FILE_BODY_CONTENT_TYPE = 'application/octet-stream';

export const getSelectedFileBodyEntry = (files: FileBodyEntry[] | null | undefined): FileBodyEntry | undefined => {
  const candidates = (files || []).filter((file) => typeof file?.filePath === 'string' && file.filePath.trim().length > 0);
  if (!candidates.length) {
    return undefined;
  }
  return candidates.find((file) => file.selected);
};

/**
 * Reads the selected file as the raw request body.
 */
export const readFileBody = async (
  files: FileBodyEntry[] | null | undefined,
  collectionPath: string
): Promise<FileBody | null> => {
  const entry = getSelectedFileBodyEntry(files);
  if (!entry) {
    return null;
  }

  const filePath = (entry.filePath as string).trim();
  const resolvedPath = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(collectionPath, filePath);

  const stats = await fs.promises.stat(resolvedPath).catch((): null => null);
  if (!stats?.isFile()) {
    throw new Error(`File not found for request body: ${filePath}`);
  }

  return {
    data: await fs.promises.readFile(resolvedPath),
    contentType: (entry.contentType || '').trim() || DEFAULT_FILE_BODY_CONTENT_TYPE
  };
};
