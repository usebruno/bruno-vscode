// flatten.spec.ts
import { describe, test, expect } from 'vitest';
import { flatten } from './flatten';

describe('flatten', () => {
  test('array of homogeneous objects → array shape with union columns', () => {
    const input = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' }
    ];
    const result = flatten(input);
    expect(result.kind).toBe('array');
    if (result.kind !== 'array') return;
    expect(result.columns).toEqual(['id', 'name']);
    expect(result.rows).toEqual([
      [1, 'Alice'],
      [2, 'Bob']
    ]);
  });

  test('array with missing keys → null fill', () => {
    const r = flatten([{ a: 1 }, { b: 2 }]);
    expect(r.kind).toBe('array');
    if (r.kind !== 'array') return;
    expect(r.columns).toEqual(['a', 'b']);
    expect(r.rows).toEqual([
      [1, null],
      [null, 2]
    ]);
  });

  test('array of primitives → [index, value] columns', () => {
    const r = flatten(['x', 'y', 'z']);
    expect(r.kind).toBe('array');
    if (r.kind !== 'array') return;
    expect(r.columns).toEqual(['index', 'value']);
    expect(r.rows).toEqual([[0, 'x'], [1, 'y'], [2, 'z']]);
  });

  test('array of mixed types → [index, value] with nested cells for objects/arrays', () => {
    const r = flatten([1, 'x', { a: 1 }]);
    expect(r.kind).toBe('array');
    if (r.kind !== 'array') return;
    expect(r.columns).toEqual(['index', 'value']);
    expect(r.rows[0]).toEqual([0, 1]);
    expect(r.rows[1]).toEqual([1, 'x']);
    const nested = r.rows[2][1] as { __nested: true; preview: string; raw: unknown };
    expect(nested.__nested).toBe(true);
    expect(nested.preview).toBe('{ a }');
    expect(nested.raw).toEqual({ a: 1 });
  });

  test('single object → object shape with key/value rows in source order', () => {
    const r = flatten({ z: 1, a: 2 });
    expect(r.kind).toBe('object');
    if (r.kind !== 'object') return;
    expect(r.rows).toEqual([['z', 1], ['a', 2]]);
  });

  test('empty array → array shape with no columns/rows', () => {
    const r = flatten([]);
    expect(r).toEqual({ kind: 'array', columns: [], rows: [] });
  });

  test('empty object → object shape with no rows', () => {
    const r = flatten({});
    expect(r).toEqual({ kind: 'object', rows: [] });
  });

  test('primitive at root → unsupported', () => {
    expect(flatten(42)).toEqual({
      kind: 'unsupported',
      reason: 'Top-level value is not an object or array'
    });
    expect(flatten('hello')).toEqual({
      kind: 'unsupported',
      reason: 'Top-level value is not an object or array'
    });
  });

  test('null / undefined at root → unsupported "No data"', () => {
    expect(flatten(null)).toEqual({ kind: 'unsupported', reason: 'No data' });
    expect(flatten(undefined)).toEqual({ kind: 'unsupported', reason: 'No data' });
  });

  test('nested object cell preview shows up to 3 keys then ellipsis', () => {
    const r = flatten([{ a: { x: 1, y: 2, z: 3, w: 4 } }]);
    if (r.kind !== 'array') throw new Error('expected array');
    const cell = r.rows[0][0] as { preview: string };
    expect(cell.preview).toBe('{ x, y, z, … }');
  });

  test('nested array cell preview shows item count', () => {
    const r = flatten([{ items: [1, 2, 3, 4, 5] }]);
    if (r.kind !== 'array') throw new Error('expected array');
    const cell = r.rows[0][0] as { preview: string };
    expect(cell.preview).toBe('[ 5 items ]');
  });

  test('circular reference → [Circular] preview without throwing', () => {
    const obj: Record<string, unknown> = { id: 1 };
    obj.self = obj;
    const r = flatten([obj]);
    if (r.kind !== 'array') throw new Error('expected array');
    const cell = r.rows[0][1] as { preview: string };
    expect(cell.preview).toBe('[Circular]');
  });

  test('undefined inside object becomes null cell', () => {
    const r = flatten([{ a: undefined, b: 1 }]);
    if (r.kind !== 'array') throw new Error('expected array');
    expect(r.rows[0]).toEqual([null, 1]);
  });
});
