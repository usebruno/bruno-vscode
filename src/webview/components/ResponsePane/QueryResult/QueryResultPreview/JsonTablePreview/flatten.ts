// flatten.ts
export type Cell =
  | string
  | number
  | boolean
  | null
  | { __nested: true; preview: string; raw: unknown };

export type TableShape =
  | { kind: 'array'; columns: string[]; rows: Cell[][] }
  | { kind: 'object'; rows: [string, Cell][] }
  | { kind: 'unsupported'; reason: string };

const PRIMITIVE = new Set(['string', 'number', 'boolean']);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// Single-depth: toCell does not recurse into nested values. It produces a
// preview string for any object/array and returns the raw value untouched.
// The `seen` WeakSet only guards against the row object itself being reached
// via a back-reference (caller pre-seeds it with the ancestor row object).
const toCell = (value: unknown, seen: WeakSet<object>): Cell => {
  if (value === undefined || value === null) return null;
  if (PRIMITIVE.has(typeof value)) return value as Cell;

  const obj = value as object;
  if (seen.has(obj)) {
    return { __nested: true, preview: '[Circular]', raw: null };
  }
  if (Array.isArray(obj)) {
    return { __nested: true, preview: `[ ${obj.length} items ]`, raw: obj };
  }
  const keys = Object.keys(obj as Record<string, unknown>);
  const shown = keys.slice(0, 3).join(', ');
  const preview =
    keys.length === 0
      ? '{ }'
      : keys.length > 3
      ? `{ ${shown}, … }`
      : `{ ${shown} }`;
  return { __nested: true, preview, raw: obj };
};

const collectColumns = (objects: Record<string, unknown>[]): string[] => {
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const obj of objects) {
    for (const key of Object.keys(obj)) {
      if (!seen.has(key)) {
        seen.add(key);
        cols.push(key);
      }
    }
  }
  return cols;
};

export const flatten = (input: unknown): TableShape => {
  if (input === null || input === undefined) {
    return { kind: 'unsupported', reason: 'No data' };
  }

  if (Array.isArray(input)) {
    if (input.length === 0) return { kind: 'array', columns: [], rows: [] };

    if (input.every(isPlainObject)) {
      const columns = collectColumns(input);
      const rows = input.map((obj) => {
        const seen = new WeakSet<object>();
        seen.add(obj);
        return columns.map((col) => toCell(obj[col], seen));
      });
      return { kind: 'array', columns, rows };
    }

    // primitives or mixed
    const columns = ['index', 'value'];
    const rows = input.map((value, i) => {
      const seen = new WeakSet<object>();
      return [i, toCell(value, seen)] as Cell[];
    });
    return { kind: 'array', columns, rows };
  }

  if (isPlainObject(input)) {
    const rows: [string, Cell][] = Object.keys(input).map((key) => {
      const seen = new WeakSet<object>();
      return [key, toCell(input[key], seen)];
    });
    return { kind: 'object', rows };
  }

  return { kind: 'unsupported', reason: 'Top-level value is not an object or array' };
};
