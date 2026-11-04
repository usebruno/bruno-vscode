import styled from 'styled-components';

const StyledWrapper = styled.div`
  .raw-editor-container {
    border: solid 1px ${(props) => props.theme.border.border0};

    .CodeMirror {
      font-size: ${(props) => props.theme.font.size.base};
    }
  }

  .table-container {
    border: solid 1px ${(props) => props.theme.border.border0};
  }

  table {
    thead {
      color: ${(props) => props.theme.table.thead.color} !important;
      background: ${(props) => props.theme.sidebar.bg};
      font-size: ${(props) => props.theme.font.size.base};
      user-select: none;

      td {
        border-bottom: solid 1px ${(props) => props.theme.border.border0};
        border-right: solid 1px ${(props) => props.theme.border.border0};

        &:last-child {
          border-right: none;
        }
      }
    }

    tbody {
      tr {
        &:last-child td {
          border-bottom: none;
        }

        td {
          border-bottom: solid 1px ${(props) => props.theme.border.border0};
          border-right: solid 1px ${(props) => props.theme.border.border0};

          &:last-child {
            border-right: none;
          }
        }
      }
    }
  }

  .tooltip-mod {
    max-width: 200px !important;
  }

  input[type='text'] {
    color: ${(props) => props.theme.text};
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    color: ${(props) => props.theme.colors.text.muted};
    background: transparent;
    border: none;
    cursor: pointer;
    border-radius: 4px;
    transition: color 0.15s ease, background 0.15s ease;
  }

  .button-container {
    padding: 12px 2px;
    background: ${(props) => props.theme.bg};
    flex-shrink: 0;
    display: flex;
    gap: 8px;
  }

  .submit {
    padding: 6px 16px;
    font-size: ${(props) => props.theme.font.size.sm};
    border-radius: ${(props) => props.theme.border.radius.base};
    border: none;
    background: ${(props) => props.theme.brand};
    color: ${(props) => props.theme.bg};
    cursor: pointer;
    transition: opacity 0.15s ease;

    &:hover {
      opacity: 0.9;
    }
  }

  .reset {
    background: transparent;
    padding: 6px 16px;
    color: ${(props) => props.theme.brand};

    &:hover {
      opacity: 0.9;
    }
  }
`;

export default StyledWrapper;
