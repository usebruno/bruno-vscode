import * as vscode from 'vscode';
import AdmZip from 'adm-zip';
import type { CollectionFormat } from '../../utils/collection';
import { sanitizeName, uniqueFolderName } from './filesystem';
import { parseCollection } from './parse';

/**
 * A Bruno collection packed as a zip archive, as the Bruno app exports it:
 * the collection's files as they are on disk, either at the archive's root or
 * under one folder.
 */
export interface CollectionZip {
  /** From the config inside the archive, else the archive's own name. */
  name: string;
  format: CollectionFormat;
  /** Folder paths relative to the collection root, so empty folders survive. */
  directories: string[];
  files: ZipFile[];
}

export interface ZipFile {
  /** Relative to the collection root, with forward slashes. */
  path: string;
  data(): Uint8Array;
}

/** The config files that mark a collection root, in the order the sidebar prefers them. */
const CONFIG_FILES: ReadonlyArray<readonly [name: string, format: CollectionFormat]> = [
  ['opencollection.yml', 'yml'],
  ['opencollection.yaml', 'yml'],
  ['bruno.json', 'bru']
];

/** Read and check the archive: one collection, with every entry inside it. */
export function readCollectionZip(data: Uint8Array, fileName: string): CollectionZip {
  let entries: AdmZip.IZipEntry[];
  try {
    entries = new AdmZip(Buffer.from(data)).getEntries();
  } catch {
    throw new Error(`"${fileName}" is not a zip archive`);
  }

  const root = findCollectionRoot(entries, fileName);
  const directories: string[] = [];
  const files: ZipFile[] = [];

  for (const entry of entries) {
    // Anything outside the collection's folder, like macOS's __MACOSX metadata, is not part of it.
    if (!entry.entryName.startsWith(root.prefix)) {
      continue;
    }

    const relative = entry.entryName.slice(root.prefix.length).replace(/\/$/, '');

    if (!relative) {
      continue;
    }

    if (isPathTraversal(relative)) {
      throw new Error(`"${fileName}" cannot be imported: entry "${relative}" points outside the collection`);
    }

    if (isSymlink(entry)) {
      throw new Error(`"${fileName}" cannot be imported: "${relative}" is a symbolic link`);
    }

    if (entry.isDirectory) {
      directories.push(relative);
    } else {
      files.push({ path: relative, data: () => entry.getData() });
    }
  }

  return {
    name: readCollectionName(files, root.config, root.format) ?? fileName.replace(/\.zip$/i, ''),
    format: root.format,
    directories,
    files
  };
}

/** Unpack the collection into a new folder under `location`, named after it. */
export async function writeCollectionZip(zip: CollectionZip, location: vscode.Uri): Promise<vscode.Uri> {
  const dir = vscode.Uri.joinPath(location, sanitizeName(await uniqueFolderName(zip.name, location)));

  await vscode.workspace.fs.createDirectory(dir);
  for (const directory of zip.directories) {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(dir, directory));
  }
  for (const file of zip.files) {
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir, file.path), file.data());
  }

  return dir;
}

/**
 * The config sits at the archive's root, or one folder down when the
 * collection was zipped as a folder. Exactly one collection is expected.
 */
function findCollectionRoot(
  entries: AdmZip.IZipEntry[],
  fileName: string
): { prefix: string; config: string; format: CollectionFormat } {
  const names = new Set(
    entries
      .filter((entry) => !entry.isDirectory)
      .map((entry) => entry.entryName)
  );

  // Where a root could be: "" for files at the top ("bruno.json"), or "dir/" for
  // files one folder down ("dir/bruno.json"). The regex matches a name with at
  // most one folder in it and captures that folder; deeper files don't match.
  const prefixes = new Set(
    [...names]
      .map((name) => /^(?:([^/]+)\/)?[^/]+$/.exec(name))
      .filter(Boolean)
      .map((match) => (match[1] ? `${match[1]}/` : ''))
  );

  const roots: { prefix: string; config: string; format: CollectionFormat }[] = [];

  for (const prefix of prefixes) {
    const found = CONFIG_FILES.find(([config]) => names.has(`${prefix}${config}`));
    if (found) {
      roots.push({ prefix, config: found[0], format: found[1] });
    }
  }

  if (!roots.length) {
    throw new Error(`"${fileName}" holds no Bruno collection: no opencollection.yml or bruno.json at its root`);
  }

  if (roots.length > 1) {
    throw new Error(`"${fileName}" holds more than one collection`);
  }

  return roots[0];
}

function readCollectionName(files: ZipFile[], config: string, format: CollectionFormat): string | undefined {
  const text = new TextDecoder().decode(files.find((file) => file.path === config)?.data());

  try {
    const name: unknown = format === 'bru'
      ? JSON.parse(text).name
      : parseCollection(text, { format }).brunoConfig?.name;

    return typeof name === 'string' && name.trim() ? name.trim() : undefined;
  } catch {
    // An unreadable config still unpacks; the collection shows up as broken in the tree, where it can be fixed.
    return undefined;
  }
}

/**
 * True for an entry path that would land outside the destination folder once
 * written (a "zip slip"): absolute, climbing with "..", or using backslashes,
 * which some unpackers treat as separators.
 */
function isPathTraversal(relative: string): boolean {
  const segments = relative.split('/');
  return relative.startsWith('/') || relative.includes('\\') || segments.some((segment) => segment === '..' || segment === '');
}

/**
 * A zip entry can be a symbolic link rather than a file: its content is then
 * the link target, such as "../../.ssh/id_rsa". Unpacked as a link it would let
 * the collection reach files outside its folder, and unpacked as a plain file
 * it would be a broken request, so such archives are refused.
 *
 * Archives made on Unix store the file's mode in the upper 16 bits of the
 * entry's external attributes, the same bits `stat` reports. `>>> 16` brings
 * them down (unsigned, as the top bit may be set), `& 0o170000` keeps only the
 * file-type bits, and 0o120000 is the type for a symlink (a regular file is
 * 0o100000, a directory 0o040000). Archives made on Windows leave the upper
 * half zero, so nothing in them is taken for a link.
 */
function isSymlink(entry: AdmZip.IZipEntry): boolean {
  return ((entry.attr >>> 16) & 0o170000) === 0o120000;
}
