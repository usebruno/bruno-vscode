// tableState.spec.ts
import { describe, test, expect } from 'vitest';
import {
  applyFilter,
  applySort,
  paginate,
  nextSortState,
  type SortState
} from './tableState';
import type { Cell } from './flatten';

const arrayShape = {
  kind: 'array' as const,
  columns: ['id', 'name'],
  rows: [
    [1, 'Alice'],
    [2, 'Bob'],
    [3, 'Charlie']
  ] as Cell[][]
};

describe('applyFilter', () => {
  test('returns all rows when query is empty', () => {
    expect(applyFilter(arrayShape.rows, '')).toEqual(arrayShape.rows);
  });

  test('matches substring case-insensitively across any column', () => {
    expect(applyFilter(arrayShape.rows, 'ali')).toEqual([[1, 'Alice']]);
    expect(applyFilter(arrayShape.rows, 'BOB')).toEqual([[2, 'Bob']]);
    expect(applyFilter(arrayShape.rows, '3')).toEqual([[3, 'Charlie']]);
  });

  test('matches nested cells via their preview', () => {
    const rows: Cell[][] = [
      [1, { __nested: true, preview: '{ a, b }', raw: { a: 1, b: 2 } }],
      [2, 'plain']
    ];
    expect(applyFilter(rows, 'a, b')).toEqual([rows[0]]);
  });
});

describe('applySort', () => {
  test('numeric column sorts numerically ascending', () => {
    const rows: Cell[][] = [[10], [2], [30]];
    expect(applySort(rows, { columnIndex: 0, direction: 'asc' })).toEqual([[2], [10], [30]]);
  });

  test('numeric column sorts numerically descending', () => {
    const rows: Cell[][] = [[10], [2], [30]];
    expect(applySort(rows, { columnIndex: 0, direction: 'desc' })).toEqual([[30], [10], [2]]);
  });

  test('string column sorts via localeCompare', () => {
    const rows: Cell[][] = [['c'], ['a'], ['b']];
    expect(applySort(rows, { columnIndex: 0, direction: 'asc' })).toEqual([['a'], ['b'], ['c']]);
  });

  test('null values always sort last', () => {
    const rows: Cell[][] = [[1], [null], [2]];
    expect(applySort(rows, { columnIndex: 0, direction: 'asc' })).toEqual([[1], [2], [null]]);
    expect(applySort(rows, { columnIndex: 0, direction: 'desc' })).toEqual([[2], [1], [null]]);
  });

  test('nested cells sort by preview string', () => {
    const rows: Cell[][] = [
      [{ __nested: true, preview: '{ z }', raw: null }],
      [{ __nested: true, preview: '{ a }', raw: null }]
    ];
    expect(applySort(rows, { columnIndex: 0, direction: 'asc' })).toEqual([rows[1], rows[0]]);
  });

  test('null sort direction returns input unchanged (stable)', () => {
    const rows: Cell[][] = [[2], [1]];
    expect(applySort(rows, null)).toEqual([[2], [1]]);
  });

  test('mixed types fall back to string comparison', () => {
    const rows: Cell[][] = [['10'], [2], ['1']];
    const result = applySort(rows, { columnIndex: 0, direction: 'asc' });
    expect(result).toEqual([['1'], ['10'], [2]]);
  });

  test('boolean column sorts false before true ascending', () => {
    const rows: Cell[][] = [[true], [false], [true]];
    expect(applySort(rows, { columnIndex: 0, direction: 'asc' })).toEqual([[false], [true], [true]]);
    expect(applySort(rows, { columnIndex: 0, direction: 'desc' })).toEqual([[true], [true], [false]]);
  });
});

describe('nextSortState', () => {
  test('cycles none → asc → desc → none for the same column', () => {
    const c = 0;
    expect(nextSortState(null, c)).toEqual({ columnIndex: c, direction: 'asc' });
    expect(nextSortState({ columnIndex: c, direction: 'asc' }, c)).toEqual({ columnIndex: c, direction: 'desc' });
    expect(nextSortState({ columnIndex: c, direction: 'desc' }, c)).toBeNull();
  });

  test('clicking a different column starts at asc', () => {
    expect(nextSortState({ columnIndex: 0, direction: 'desc' }, 1)).toEqual({
      columnIndex: 1,
      direction: 'asc'
    });
  });
});

describe('paginate', () => {
  const rows: Cell[][] = Array.from({ length: 250 }, (_, i) => [i]);

  test('returns the correct slice and totals for page 1', () => {
    const r = paginate(rows, { page: 1, pageSize: 100 });
    expect(r.rows.length).toBe(100);
    expect(r.rows[0]).toEqual([0]);
    expect(r.rows[99]).toEqual([99]);
    expect(r.totalRows).toBe(250);
    expect(r.totalPages).toBe(3);
    expect(r.hasPrev).toBe(false);
    expect(r.hasNext).toBe(true);
    expect(r.start).toBe(1);
    expect(r.end).toBe(100);
  });

  test('last page may be partial; hasNext is false', () => {
    const r = paginate(rows, { page: 3, pageSize: 100 });
    expect(r.rows.length).toBe(50);
    expect(r.hasPrev).toBe(true);
    expect(r.hasNext).toBe(false);
    expect(r.start).toBe(201);
    expect(r.end).toBe(250);
  });

  test('empty rows → totals zero, no prev/next', () => {
    const r = paginate([], { page: 1, pageSize: 100 });
    expect(r).toEqual({
      rows: [],
      totalRows: 0,
      totalPages: 0,
      hasPrev: false,
      hasNext: false,
      start: 0,
      end: 0
    });
  });

  test('clamps page above totalPages to totalPages', () => {
    const r = paginate(rows, { page: 999, pageSize: 100 });
    expect(r.rows.length).toBe(50);
    expect(r.hasNext).toBe(false);
  });
});

describe('composition (filter → sort → paginate)', () => {
  test('filter narrows then sort orders then paginate slices', () => {
    const rows: Cell[][] = [
      [3, 'apple'],
      [1, 'banana'],
      [2, 'apricot'],
      [4, 'cherry']
    ];
    const filtered = applyFilter(rows, 'ap');
    const sorted = applySort(filtered, { columnIndex: 0, direction: 'asc' });
    const page = paginate(sorted, { page: 1, pageSize: 100 });
    expect(page.rows).toEqual([
      [2, 'apricot'],
      [3, 'apple']
    ]);
  });
});
