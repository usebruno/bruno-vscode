import styled from 'styled-components';

const StyledWrapper = styled.div`
  width: 100%;
  height: 100%;
  background-color: var(--vscode-editor-background, ${(props) => props.theme?.bg || '#1e1e1e'});
  color: var(--vscode-foreground, ${(props) => props.theme?.text || '#cccccc'});
  font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  font-size: 13px;
  padding: 28px 32px 0;

  .preferences-header {
    max-width: 880px;
    padding-bottom: 20px;
    margin-bottom: 20px;
    border-bottom: 1px solid var(--vscode-widget-border, ${(props) => props.theme?.input?.border || '#454545'});

    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
    }

    p {
      margin: 6px 0 0;
      color: var(--vscode-descriptionForeground, ${(props) => props.theme?.colors?.text?.muted || '#999999'});
    }
  }

  .preferences-body {
    display: flex;
    gap: 32px;
    max-width: 880px;
    flex: 1;
    min-height: 0;
  }

  .tabs {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 180px;
    flex-shrink: 0;

    .tab {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 6px 10px;
      border: none;
      border-left: 2px solid transparent;
      border-radius: 0 4px 4px 0;
      background: transparent;
      color: var(--vscode-foreground, ${(props) => props.theme?.text || '#cccccc'});
      font-family: inherit;
      font-size: 13px;
      text-align: left;
      cursor: pointer;
      opacity: 0.8;

      &:hover {
        opacity: 1;
        background-color: var(--vscode-list-hoverBackground, ${(props) => props.theme?.sidebar?.collection?.item?.hoverBg || '#2a2d2e'});
      }

      &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder, #007fd4);
        outline-offset: -1px;
      }

      &.active {
        opacity: 1;
        font-weight: 500;
        border-left-color: var(--vscode-focusBorder, #007fd4);
        background-color: var(--vscode-list-inactiveSelectionBackground, ${(props) => props.theme?.sidebar?.collection?.item?.hoverBg || '#37373d'});
      }
    }
  }

  .tab-panel {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding-bottom: 32px;
  }


  .settings-section + .settings-section {
    margin-top: 28px;
  }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground, ${(props) => props.theme?.colors?.text?.muted || '#999999'});
    margin-bottom: 12px;
  }

  .setting + .setting {
    margin-top: 16px;
  }

  .setting.disabled {
    opacity: 0.5;
  }

  .setting-checkbox {
    display: flex;
    align-items: flex-start;
    gap: 10px;

    input[type='checkbox'] {
      margin: 2px 0 0;
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      cursor: pointer;
      accent-color: var(--vscode-focusBorder, #007fd4);

      &:disabled {
        cursor: not-allowed;
      }
    }
  }

  .setting-label {
    display: block;
    font-weight: 500;
    cursor: pointer;
    user-select: none;
  }

  .setting-description {
    margin-top: 2px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--vscode-descriptionForeground, ${(props) => props.theme?.colors?.text?.muted || '#999999'});
  }

  .setting-control {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .setting-nested {
    margin-left: 24px;
  }

  .setting + .setting-nested {
    margin-top: 10px;
  }

  .setting-nested > .setting-control:first-child {
    margin-top: 0;
  }

  .form-input {
    padding: 6px 10px;
    border: 1px solid var(--vscode-input-border, ${(props) => props.theme?.input?.border || '#454545'});
    border-radius: 4px;
    background-color: var(--vscode-input-background, ${(props) => props.theme?.input?.bg || '#3c3c3c'});
    color: var(--vscode-input-foreground, ${(props) => props.theme?.text || '#cccccc'});
    font-size: 13px;
    font-family: inherit;
    min-width: 0;

    &::placeholder {
      color: var(--vscode-input-placeholderForeground, ${(props) => props.theme?.colors?.text?.muted || '#999999'});
    }

    &:focus {
      outline: none;
      border-color: var(--vscode-focusBorder, #007fd4);
    }

    &:disabled {
      cursor: not-allowed;
    }

    &[readonly] {
      cursor: pointer;
    }

    &.error {
      border-color: var(--vscode-inputValidation-errorBorder, #f14c4c);
    }

    &.input-sm {
      width: 160px;
    }

    &.input-full {
      flex: 1;
    }
  }

  .form-error {
    margin-top: 6px;
    font-size: 12px;
    color: var(--vscode-errorForeground, #f14c4c);
  }

  .btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: 4px;
    background-color: var(--vscode-button-secondaryBackground, ${(props) => props.theme?.button?.secondary?.bg || '#3a3d41'});
    color: var(--vscode-button-secondaryForeground, ${(props) => props.theme?.button?.secondary?.color || '#cccccc'});
    font-size: 13px;
    font-family: inherit;
    white-space: nowrap;
    cursor: pointer;

    &:hover:not(:disabled) {
      background-color: var(--vscode-button-secondaryHoverBackground, ${(props) => props.theme?.button?.secondary?.hoverBg || '#45494e'});
    }

    &:disabled {
      cursor: not-allowed;
    }
  }

  .file-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    padding: 4px 6px 4px 10px;
    border: 1px solid var(--vscode-input-border, ${(props) => props.theme?.input?.border || '#454545'});
    border-radius: 4px;
    background-color: var(--vscode-input-background, ${(props) => props.theme?.input?.bg || '#3c3c3c'});

    .file-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    button {
      display: flex;
      padding: 2px;
      border: none;
      border-radius: 3px;
      background: transparent;
      color: inherit;
      cursor: pointer;

      &:hover:not(:disabled) {
        background-color: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
      }

      &:disabled {
        cursor: not-allowed;
      }
    }
  }
`;

export default StyledWrapper;
