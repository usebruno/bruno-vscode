import React, { useState } from 'react';
import toast from 'react-hot-toast';
import type { Cell, TableShape } from './flatten';
import {
  applyFilter,
  applySort,
  nextSortState,
  paginate,
  type SortState
} from './tableState';
import ValueRenderer from './ValueRenderer';

const PAGE_SIZE = 100;

const cellToCopyString = (cell: Cell): string => {
  if (cell === null) return 'null';
  if (typeof cell === 'object' && cell !== null && '__nested' in cell) {
    try {
      return JSON.stringify(cell.raw, null, 2);
    } catch {
      return cell.preview;
    }
  }
  return String(cell);
};

const isNested = (cell: Cell): cell is { __nested: true; preview: string; raw: unknown } =>
  cell !== null && typeof cell === 'object' && '__nested' in cell;

const renderCell = (cell: Cell): React.ReactNode => {
  if (cell === null) return <span className="json-table-null">—</span>;
  if (isNested(cell)) {
    return <ValueRenderer value={cell.raw} depth={1} />;
  }
  if (typeof cell === 'boolean') return cell ? 'true' : 'false';
  return String(cell);
};

interface ArrayTableProps {
  columns: string[];
  rows: Cell[][];
  filter: string;
  resetToken?: number;
}

const ArrayTable: React.FC<ArrayTableProps> = ({ columns, rows, filter, resetToken }) => {
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(1);

  const filtered = React.useMemo(() => applyFilter(rows, filter), [rows, filter]);
  const sorted = React.useMemo(() => applySort(filtered, sort), [filtered, sort]);
  const paged = React.useMemo(() => paginate(sorted, { page, pageSize: PAGE_SIZE }), [sorted, page]);

  // reset page when filter or sort changes
  React.useEffect(() => {
    setPage(1);
  }, [filter, sort]);

  // reset sort/page when the underlying data changes (per spec section 6/12)
  React.useEffect(() => {
    if (resetToken === undefined) return;
    setSort(null);
    setPage(1);
  }, [resetToken]);

  const handleHeaderClick = (columnIndex: number) => {
    setSort((curr) => nextSortState(curr, columnIndex));
  };

  const handleCellContextMenu = (e: React.MouseEvent, cell: Cell) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard
      .writeText(cellToCopyString(cell))
      .then(() => toast.success('Copied to clipboard'))
      .catch(() => toast.error('Failed to copy'));
  };

  const sortIndicator = (i: number) => {
    if (!sort || sort.columnIndex !== i) return '';
    return sort.direction === 'asc' ? ' ▲' : ' ▼';
  };

  if (filtered.length === 0) {
    return (
      <div className="json-table-empty">
        {filter ? `No rows match "${filter}"` : 'No rows'}
      </div>
    );
  }

  return (
    <>
      <div className="json-table-scroll">
        <table className="json-table">
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th
                  key={i}
                  onClick={() => handleHeaderClick(i)}
                  title={`Sort by ${col}`}
                >
                  {col}{sortIndicator(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {row.map((cell, ci) => {
                  const hasSub = isNested(cell);
                  return (
                    <td
                      key={ci}
                      className={hasSub ? 'json-table-has-sub' : ''}
                      onContextMenu={(e) => handleCellContextMenu(e, cell)}
                      title={typeof cell === 'string' ? cell : undefined}
                    >
                      {renderCell(cell)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paged.totalPages > 1 && (
        <div className="json-table-pager">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={!paged.hasPrev}
            aria-label="Previous page"
          >
            ← Prev
          </button>
          <span>Showing {paged.start}–{paged.end} of {paged.totalRows}</span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={!paged.hasNext}
            aria-label="Next page"
          >
            Next →
          </button>
        </div>
      )}
    </>
  );
};

interface ObjectTableProps {
  rows: [string, Cell][];
  filter: string;
  resetToken?: number;
}

const ObjectTable: React.FC<ObjectTableProps> = ({ rows, filter, resetToken }) => {
  // Reuse the array-table pipeline by treating rows as Cell[][]
  const cellRows: Cell[][] = rows.map(([k, v]) => [k, v]);
  return <ArrayTable columns={['key', 'value']} rows={cellRows} filter={filter} resetToken={resetToken} />;
};

interface TableViewProps {
  shape: TableShape;
  filter: string;
  resetToken?: number;
}

const TableView: React.FC<TableViewProps> = ({ shape, filter, resetToken }) => {
  if (shape.kind === 'array') {
    if (shape.rows.length === 0) {
      return <div className="json-table-empty">No rows</div>;
    }
    return <ArrayTable columns={shape.columns} rows={shape.rows} filter={filter} resetToken={resetToken} />;
  }
  if (shape.kind === 'object') {
    if (shape.rows.length === 0) {
      return <div className="json-table-empty">No fields</div>;
    }
    return <ObjectTable rows={shape.rows} filter={filter} resetToken={resetToken} />;
  }
  return null;
};

export default TableView;
