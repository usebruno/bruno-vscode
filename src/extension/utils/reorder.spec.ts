import { describe, expect, it } from 'vitest';
import { Uri } from 'vscode';
import { placeInOrder } from './reorder';

const item = (name: string) => ({ uri: Uri.file(`/c/${name}`), name });
const names = (items: { name: string }[]) => items.map((i) => i.name);

describe('placeInOrder', () => {
  const items = [item('a'), item('b'), item('c'), item('d')];

  it('moves an item in front of another', () => {
    expect(names(placeInOrder(items, items[3].uri, items[1].uri))).toEqual(['a', 'd', 'b', 'c']);
  });

  it('moves an item down in front of a later one', () => {
    expect(names(placeInOrder(items, items[0].uri, items[2].uri))).toEqual(['b', 'a', 'c', 'd']);
  });

  it('moves an item to the end when nothing is given to go before', () => {
    expect(names(placeInOrder(items, items[1].uri))).toEqual(['a', 'c', 'd', 'b']);
  });

  it('moves an item to the end when the item to go before is not among the items', () => {
    expect(names(placeInOrder(items, items[1].uri, Uri.file('/elsewhere')))).toEqual(['a', 'c', 'd', 'b']);
  });

  it('keeps the order when the moved item is not among the items', () => {
    expect(names(placeInOrder(items, Uri.file('/elsewhere'), items[1].uri))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('leaves an item in front of itself where it is', () => {
    expect(names(placeInOrder(items, items[2].uri, items[2].uri))).toEqual(['a', 'b', 'c', 'd']);
  });
});
