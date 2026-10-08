import React from 'react';

interface ValueRendererProps {
  value: unknown;
  depth: number;
}

const MAX_DEPTH = 12;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isComplex = (v: unknown): boolean =>
  isPlainObject(v) || (Array.isArray(v) && v.length > 0);

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

const ValueRenderer: React.FC<ValueRendererProps> = ({ value, depth }) => {
  if (depth > MAX_DEPTH) {
    return <span className="json-table-nested" title="Max nesting depth reached">…</span>;
  }

  if (value === null || value === undefined) {
    return <span className="json-table-null">—</span>;
  }

  if (typeof value === 'boolean') {
    return <>{value ? 'true' : 'false'}</>;
  }

  if (typeof value === 'number' || typeof value === 'string') {
    return <>{String(value)}</>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="json-table-nested">[ ]</span>;
    }

    if (value.every(isPlainObject)) {
      const cols = collectColumns(value);
      return (
        <table className="json-sub-table json-sub-table-array">
          <thead>
            <tr>
              <th className="json-sub-idx" aria-hidden="true" />
              {cols.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {value.map((row, i) => (
              <tr key={i}>
                <th className="json-sub-idx">{i}</th>
                {cols.map((c) => {
                  const v = row[c];
                  const complex = isComplex(v);
                  return (
                    <td key={c} className={complex ? 'json-table-has-sub' : ''}>
                      <ValueRenderer value={v} depth={depth + 1} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    return (
      <table className="json-sub-table json-sub-table-primitives">
        <tbody>
          {value.map((v, i) => {
            const complex = isComplex(v);
            return (
              <tr key={i}>
                <th className="json-sub-idx">{i}</th>
                <td className={complex ? 'json-table-has-sub' : ''}>
                  <ValueRenderer value={v} depth={depth + 1} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return <span className="json-table-nested">{'{ }'}</span>;
    }
    return (
      <table className="json-sub-table json-sub-table-object">
        <tbody>
          {entries.map(([k, v]) => {
            const complex = isComplex(v);
            return (
              <tr key={k}>
                <th className="json-sub-key">{k}</th>
                <td className={complex ? 'json-table-has-sub' : ''}>
                  <ValueRenderer value={v} depth={depth + 1} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return <>{String(value)}</>;
};

export default ValueRenderer;
