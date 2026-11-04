import styled from 'styled-components';

const StyledWrapper = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  overflow: hidden;
  min-width: 0;

  .file-picker-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 8px;
    color: ${(props) => props.theme.colors.text.muted};
    background: transparent;
    border: none;
    cursor: pointer;
    border-radius: 4px;
    transition: color 0.15s ease;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    min-width: 0;
    max-width: 100%;

    &:hover {
      color: ${(props) => props.theme.text} !important;
    }

    &.read-only {
      cursor: default;
      opacity: 0.6;
    }

    &.icon-only {
      padding: 4px;
      flex-shrink: 0;
    }

    &.icon-right {
      width: 100%;
      justify-content: space-between;
    }

    span {
      line-height: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }

    .label {
      font-style: italic;
    }

    svg {
      flex-shrink: 0;
    }
  }

  .file-picker-selected {
    display: flex;
    align-items: center;
    padding: 4px 0;
    width: 100%;
    cursor: pointer;

    &.read-only {
      cursor: default;
    }

    /* The selected file is missing on disk — tint the chip so it reads as a warning. */
    &.has-warning {
      background-color: var(--vscode-inputValidation-warningBackground, rgba(204, 167, 0, 0.15));
      border-radius: ${(props) => props.theme.border.radius.sm};
      font-weight: 500;
      padding: 4px;
    }

    .file-icon {
      flex-shrink: 0;
      color: ${(props) => props.theme.colors.text.muted};
      margin-right: 4px;
    }

    .warning-icon {
      flex-shrink: 0;
      color: ${(props) => props.theme.status.warning.text};
      margin-right: 4px;
    }

    .warning-tooltip {
      display: flex;
      align-items: center;
      gap: 6px;

      svg {
        color: ${(props) => props.theme.status.warning.text};
        flex-shrink: 0;
      }
    }

    .file-name {
      flex: 1;
      font-size: 12px;
      color: ${(props) => props.theme.text};
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }

    .clear-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      margin-left: 4px;
      color: ${(props) => props.theme.colors.text.muted};
      background: transparent;
      border: none;
      cursor: pointer;
      border-radius: 4px;
      transition: color 0.15s ease;
      flex-shrink: 0;

      &:hover {
        color: ${(props) => props.theme.text};
      }
    }
  }
`;

export default StyledWrapper;
