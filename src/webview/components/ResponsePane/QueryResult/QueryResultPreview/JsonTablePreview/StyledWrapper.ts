import styled from 'styled-components';

const StyledWrapper = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  font-size: 12px;
  background: ${(props) => props.theme.background.base};

  .json-table-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 8px;
    background: ${(props) => props.theme.background.base};
    border-bottom: 1px solid ${(props) => props.theme.border.border1};
  }

  .json-table-filter input {
    width: 240px;
    padding: 3px 8px;
    border: 1px solid ${(props) => props.theme.border.border2};
    border-radius: ${(props) => props.theme.border.radius.sm};
    background: ${(props) => props.theme.background.surface1};
    color: ${(props) => props.theme.colors.text.white};
    font-size: 11px;

    &:focus {
      outline: none;
      border-color: ${(props) => props.theme.colors.text.yellow};
    }
  }

  /* ──── Main table ─────────────────────────────── */
  table.json-table {
    width: 100%;
    border-collapse: collapse;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    table-layout: auto;
  }

  table.json-table > thead > tr > th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: ${(props) => props.theme.background.crust};
    color: ${(props) => props.theme.colors.text.white};
    border-bottom: 1px solid ${(props) => props.theme.border.border1};
    border-right: 1px solid ${(props) => props.theme.border.border1};
    padding: 5px 10px;
    text-align: left;
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
    font-weight: 600;
  }

  table.json-table > thead > tr > th:last-child {
    border-right: 0;
  }

  table.json-table > thead > tr > th:hover {
    background: ${(props) => props.theme.background.surface0};
  }

  table.json-table > tbody > tr > td {
    padding: 4px 10px;
    border-bottom: 1px solid ${(props) => props.theme.border.border1};
    border-right: 1px solid ${(props) => props.theme.border.border1};
    vertical-align: top;
    color: ${(props) => props.theme.colors.text.white};
    white-space: nowrap;
  }

  table.json-table > tbody > tr > td:last-child {
    border-right: 0;
  }

  /* Cells that contain a nested sub-table fill flush and allow multi-line */
  table.json-table > tbody > tr > td.json-table-has-sub {
    padding: 0;
    white-space: normal;
    overflow: visible;
    max-width: none;
  }

  table.json-table > tbody > tr:hover > td:not(.json-table-has-sub) {
    background: ${(props) => props.theme.background.surface0};
  }

  /* ──── Sub-table (recursive) ─────────────────── */
  table.json-sub-table {
    width: 100%;
    border-collapse: collapse;
    font-family: inherit;
    font-size: inherit;
    background: transparent;
  }

  /* Key column (for object sub-tables) and index column (for array sub-tables) */
  table.json-sub-table th.json-sub-key,
  table.json-sub-table th.json-sub-idx {
    background: ${(props) => props.theme.background.mantle};
    color: ${(props) => props.theme.colors.text.white};
    font-weight: 600;
    text-align: left;
    padding: 4px 10px;
    border-right: 1px solid ${(props) => props.theme.border.border1};
    border-bottom: 1px solid ${(props) => props.theme.border.border1};
    vertical-align: top;
    white-space: nowrap;
    width: 1%; /* shrink-to-content */
  }

  table.json-sub-table th.json-sub-idx {
    color: ${(props) => props.theme.colors.text.muted};
    text-align: right;
    font-weight: 500;
  }

  /* Top header row (array-of-objects sub-table) */
  table.json-sub-table > thead > tr > th {
    background: ${(props) => props.theme.background.mantle};
    color: ${(props) => props.theme.colors.text.muted};
    font-weight: 600;
    text-align: left;
    padding: 4px 10px;
    border-right: 1px solid ${(props) => props.theme.border.border1};
    border-bottom: 1px solid ${(props) => props.theme.border.border1};
    white-space: nowrap;
    cursor: default;
    position: static;
  }

  table.json-sub-table > thead > tr > th:last-child {
    border-right: 0;
  }

  table.json-sub-table > tbody > tr > td {
    padding: 4px 10px;
    border-right: 1px solid ${(props) => props.theme.border.border1};
    border-bottom: 1px solid ${(props) => props.theme.border.border1};
    vertical-align: top;
    color: ${(props) => props.theme.colors.text.white};
    white-space: normal;
  }

  table.json-sub-table > tbody > tr > td:last-child {
    border-right: 0;
  }

  table.json-sub-table > tbody > tr:last-child > td,
  table.json-sub-table > tbody > tr:last-child > th {
    border-bottom: 0;
  }

  /* Sub-table cell that itself contains a sub-table: flush */
  table.json-sub-table td.json-table-has-sub {
    padding: 0;
  }

  .json-table-nested {
    color: ${(props) => props.theme.colors.text.muted};
    font-style: italic;
  }

  .json-table-null {
    color: ${(props) => props.theme.colors.text.muted};
  }

  .json-table-scroll {
    flex: 1;
    overflow: auto;
  }

  .json-table-pager {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 6px;
    background: ${(props) => props.theme.background.base};
    border-top: 1px solid ${(props) => props.theme.border.border1};
    font-size: 11px;
    color: ${(props) => props.theme.colors.text.muted};
  }

  .json-table-pager button {
    background: ${(props) => props.theme.background.surface1};
    border: 1px solid ${(props) => props.theme.border.border2};
    border-radius: ${(props) => props.theme.border.radius.sm};
    padding: 2px 10px;
    cursor: pointer;
    color: ${(props) => props.theme.colors.text.white};
  }

  .json-table-pager button:hover:not(:disabled) {
    background: ${(props) => props.theme.background.surface0};
  }

  .json-table-pager button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .json-table-empty {
    padding: 24px;
    text-align: center;
    color: ${(props) => props.theme.colors.text.muted};
  }
`;

export default StyledWrapper;
