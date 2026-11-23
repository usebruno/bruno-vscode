import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import { readCollectionZip } from './import-zip';

// The unix mode sits in the upper half of the field; a plain shift would overflow to a negative number.
const SYMLINK_ATTR = 0o120777 * 0x10000;

/**
 * Build an archive in memory from entry paths; a trailing slash makes a folder.
 * `tamper` edits entries after they are added, since addFile cleans names and
 * file types the way a hostile archive would not.
 */
function archive(entries: Record<string, string | null>, tamper?: (zip: AdmZip) => void): Uint8Array {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, content === null ? Buffer.alloc(0) : Buffer.from(content));
  }
  tamper?.(zip);
  return new Uint8Array(zip.toBuffer());
}

const paths = (zip: ReturnType<typeof readCollectionZip>) => zip.files.map((file) => file.path).sort();

describe('readCollectionZip', () => {
  it('reads a collection zipped from its root', () => {
    const zip = readCollectionZip(archive({
      'bruno.json': '{ "version": "1", "name": "Root Collection", "type": "collection" }',
      'ping.bru': 'meta { name: ping }'
    }), 'root.zip');

    expect(zip.name).toBe('Root Collection');
    expect(zip.format).toBe('bru');
    expect(paths(zip)).toEqual(['bruno.json', 'ping.bru']);
  });

  it('strips the folder a collection was zipped under and ignores files beside it', () => {
    const zip = readCollectionZip(archive({
      'my-collection/': null,
      'my-collection/opencollection.yml': 'opencollection: 1.0.0\ninfo:\n  name: Folder Collection\n',
      'my-collection/requests/': null,
      'my-collection/requests/ping.yml': 'http: {}',
      '__MACOSX/my-collection/._opencollection.yml': 'junk'
    }), 'my-collection.zip');

    expect(zip.name).toBe('Folder Collection');
    expect(zip.format).toBe('yml');
    expect(zip.directories).toEqual(['requests']);
    expect(paths(zip)).toEqual(['opencollection.yml', 'requests/ping.yml']);
  });

  it('names the collection after the archive when the config gives no name', () => {
    const zip = readCollectionZip(archive({ 'bruno.json': 'not json' }), 'Exported Collection.zip');

    expect(zip.name).toBe('Exported Collection');
  });

  it('prefers opencollection.yml when both config files are present', () => {
    const zip = readCollectionZip(archive({
      'opencollection.yml': 'opencollection: 1.0.0\ninfo:\n  name: Yml Name\n',
      'bruno.json': '{ "version": "1", "name": "Bru Name", "type": "collection" }'
    }), 'both.zip');

    expect(zip.format).toBe('yml');
    expect(zip.name).toBe('Yml Name');
  });

  it('refuses an archive without a collection config', () => {
    expect(() => readCollectionZip(archive({ 'readme.md': 'hello' }), 'notes.zip'))
      .toThrow('holds no Bruno collection');
  });

  it('refuses an archive holding more than one collection', () => {
    expect(() => readCollectionZip(archive({
      'one/bruno.json': '{}',
      'two/bruno.json': '{}'
    }), 'two.zip')).toThrow('more than one collection');
  });

  it('refuses an entry that would land outside the collection', () => {
    const slip = archive({ 'bruno.json': '{}', 'escape.bru': 'meta { name: escape }' }, (zip) => {
      zip.getEntry('escape.bru')!.entryName = '../escape.bru';
    });

    expect(() => readCollectionZip(slip, 'slip.zip')).toThrow('points outside the collection');
  });

  it('refuses symbolic links', () => {
    const links = archive({ 'bruno.json': '{}', 'link.bru': '/etc/passwd' }, (zip) => {
      zip.getEntry('link.bru')!.attr = SYMLINK_ATTR;
    });

    expect(() => readCollectionZip(links, 'links.zip')).toThrow('symbolic link');
  });

  it('refuses something that is not a zip', () => {
    expect(() => readCollectionZip(new TextEncoder().encode('{ "name": "json" }'), 'export.zip'))
      .toThrow('not a zip archive');
  });
});
