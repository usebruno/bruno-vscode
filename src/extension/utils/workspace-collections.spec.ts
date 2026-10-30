import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { findCollectionsInDirectory } from './workspace-collections';

let root: string;

const write = (relativePath: string, content = '') => {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

const names = () => findCollectionsInDirectory(root).map((c) => c.name).sort();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-workspace-collections-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('findCollectionsInDirectory', () => {
  test('finds bru and yml collections in nested folders', () => {
    write('collections/One/bruno.json', JSON.stringify({ name: 'First' }));
    write('collections/Two/opencollection.yml');
    write('collections/Three/notes.txt');

    const found = findCollectionsInDirectory(root).sort((a, b) => a.name.localeCompare(b.name));
    expect(found).toEqual([
      { name: 'First', path: path.join(root, 'collections/One') },
      { name: 'Two', path: path.join(root, 'collections/Two') }
    ]);
  });

  test('uses the folder name when bruno.json has no name', () => {
    write('Unnamed/bruno.json', '{}');
    expect(names()).toEqual(['Unnamed']);
  });

  test('does not look for collections inside a collection', () => {
    write('Outer/bruno.json', JSON.stringify({ name: 'Outer' }));
    write('Outer/Inner/bruno.json', JSON.stringify({ name: 'Inner' }));
    expect(names()).toEqual(['Outer']);
  });

  test('skips hidden folders and node_modules', () => {
    write('.hidden/bruno.json', JSON.stringify({ name: 'Hidden' }));
    write('node_modules/pkg/bruno.json', JSON.stringify({ name: 'Module' }));
    expect(names()).toEqual([]);
  });

  test('stops searching below 5 levels', () => {
    write('1/2/3/4/Shallow/bruno.json', JSON.stringify({ name: 'Shallow' }));
    write('1/2/3/4/5/Deep/bruno.json', JSON.stringify({ name: 'Deep' }));
    expect(names()).toEqual(['Shallow']);
  });

  test('returns nothing for a missing directory', () => {
    expect(findCollectionsInDirectory(path.join(root, 'missing'))).toEqual([]);
  });
});
