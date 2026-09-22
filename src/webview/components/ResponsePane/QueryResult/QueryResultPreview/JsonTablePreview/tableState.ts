// tableState.ts
import type { Cell } from './flatten';

export type SortDirection = 'asc' | 'desc';
export type SortState = { columnIndex: number; direction: SortDirection } | null;
export type PaginateInput = { page: number; pageSize: number };

export type PaginateResult = {
  rows: Cell[][];
  totalRows: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  start: number; // 1-indexed inclusive
  end: number;   // 1-indexed inclusive
};

const cellToString = (cell: Cell): string => {
  if (cell === null) return '';
  if (typeof cell === 'object' && '__nested' in cell) return cell.preview;
  return String(cell);
};

export const applyFilter = (rows: Cell[][], query: string): Cell[][] => {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    row.some((cell) => cellToString(cell).toLowerCase().includes(q))
  );
};

const allNonNullAreType = (rows: Cell[][], columnIndex: number, type: 'number' | 'boolean'): boolean => {
  let sawAny = false;
  for (const row of rows) {
    const v = row[columnIndex];
    if (v === null) continue;
    if (typeof v === 'object' && v !== null && '__nested' in v) return false;
    if (typeof v !== type) return false;
    sawAny = true;
  }
  return sawAny;
};

export const applySort = (rows: Cell[][], state: SortState): Cell[][] => {
  if (state === null) return rows;
  const { columnIndex, direction } = state;
  const dir = direction === 'asc' ? 1 : -1;

  const isNumeric = allNonNullAreType(rows, columnIndex, 'number');
  const isBoolean = !isNumeric && allNonNullAreType(rows, columnIndex, 'boolean');

  const copy = rows.slice();
  copy.sort((a, b) => {
    const av = a[columnIndex];
    const bv = b[columnIndex];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;  // nulls always last
    if (bv === null) return -1;

    if (isNumeric) return ((av as number) - (bv as number)) * dir;
    if (isBoolean) return ((av === true ? 1 : 0) - (bv === true ? 1 : 0)) * dir;

    return cellToString(av).localeCompare(cellToString(bv)) * dir;
  });
  return copy;
};

export const nextSortState = (current: SortState, columnIndex: number): SortState => {
  if (!current || current.columnIndex !== columnIndex) {
    return { columnIndex, direction: 'asc' };
  }
  if (current.direction === 'asc') return { columnIndex, direction: 'desc' };
  return null;
};

export const paginate = (rows: Cell[][], { page, pageSize }: PaginateInput): PaginateResult => {
  const totalRows = rows.length;
  if (totalRows === 0) {
    return { rows: [], totalRows: 0, totalPages: 0, hasPrev: false, hasNext: false, start: 0, end: 0 };
  }
  const totalPages = Math.ceil(totalRows / pageSize);
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (clampedPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalRows);
  return {
    rows: rows.slice(startIdx, endIdx),
    totalRows,
    totalPages,
    hasPrev: clampedPage > 1,
    hasNext: clampedPage < totalPages,
    start: startIdx + 1,
    end: endIdx
  };
};
