import styled from 'styled-components';

const StyledWrapper = styled.div`
  width: 100%;
  min-height: 100vh;
  background-color: var(--vscode-editor-background, ${(props: any) => props.theme?.bg || '#1e1e1e'});
  color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
  font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  font-size: 13px;
  padding: 24px 32px;

  .import-collection-container {
    max-width: 600px;
    margin: 0 auto;
  }

  /* Modal-style title bar: title on the left, dismiss on the right. */
  .import-collection-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--vscode-widget-border, ${(props: any) => props.theme?.input?.border || '#454545'});

    h1 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});

      svg {
        color: var(--vscode-button-background, ${(props: any) => props.theme?.button?.primary?.bg || '#0e639c'});
      }
    }

    p {
      margin: 6px 0 0 0;
      color: var(--vscode-descriptionForeground, ${(props: any) => props.theme?.textMuted || '#999999'});
      font-size: 12px;
    }

    .close-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      padding: 4px;
      border: none;
      border-radius: 4px;
      background: none;
      color: var(--vscode-descriptionForeground, ${(props: any) => props.theme?.textMuted || '#999999'});
      cursor: pointer;

      &:hover:not(:disabled) {
        background-color: var(--vscode-toolbar-hoverBackground, ${(props: any) => props.theme?.sidebar?.collection?.item?.hoverBg || '#2d2d2d'});
        color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
      }

      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
    }
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 600;
    color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});

    .count-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 22px;
      padding: 1px 7px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      background-color: var(--vscode-badge-background, #4d4d4d);
      color: var(--vscode-badge-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
    }
  }

  .drop-zone {
    border: 2px dashed var(--vscode-input-border, ${(props: any) => props.theme?.input?.border || '#454545'});
    border-radius: 6px;
    padding: 28px 20px;
    text-align: center;
    transition: border-color 0.2s ease, background-color 0.2s ease;
    cursor: pointer;

    &.drag-active {
      border-color: var(--vscode-button-background, ${(props: any) => props.theme?.button?.primary?.bg || '#0e639c'});
      background-color: var(--vscode-list-hoverBackground, ${(props: any) => props.theme?.sidebar?.collection?.item?.hoverBg || '#2d2d2d'});
    }

    .drop-icon {
      color: var(--vscode-descriptionForeground, ${(props: any) => props.theme?.textMuted || '#999999'});
      margin-bottom: 8px;
    }

    .drop-text {
      color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
      margin-bottom: 6px;
    }

    .drop-hint {
      font-size: 11px;
      color: var(--vscode-descriptionForeground, ${(props: any) => props.theme?.textMuted || '#999999'});
    }

    .browse-link {
      color: var(--vscode-textLink-foreground, ${(props: any) => props.theme?.textLink || '#3794ff'});
      cursor: pointer;
      text-decoration: underline;
      background: none;
      border: none;
      font-size: 13px;
      font-family: inherit;
    }
  }

  .import-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .collection-summary {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 4px;
    background-color: var(--vscode-input-background, ${(props: any) => props.theme?.input?.bg || '#3c3c3c'});
    border: 1px solid var(--vscode-input-border, ${(props: any) => props.theme?.input?.border || '#454545'});

    .collection-name {
      font-weight: 500;
      color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
    }
  }

  .collection-panel {
    border-radius: 6px;
    border: 1px solid var(--vscode-input-border, ${(props: any) => props.theme?.input?.border || '#454545'});
    overflow: hidden;
  }

  .collection-panel-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;

    .search-box {
      position: relative;
      flex: 1;
      min-width: 0;

      svg {
        position: absolute;
        top: 50%;
        left: 9px;
        transform: translateY(-50%);
        pointer-events: none;
        color: var(--vscode-descriptionForeground, ${(props: any) => props.theme?.textMuted || '#999999'});
      }

      input {
        width: 100%;
        padding: 6px 10px 6px 30px;
      }
    }

    .select-all {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
      cursor: pointer;
      white-space: nowrap;
      font-weight: 500;
    }
  }

  .collection-list {
    display: flex;
    flex-direction: column;
    max-height: 260px;
    overflow-y: auto;
    padding: 0 6px 6px;
  }

  .collection-list.bordered {
    border-radius: 6px;
    border: 1px solid var(--vscode-input-border, ${(props: any) => props.theme?.input?.border || '#454545'});
    padding: 6px;
  }

  .collection-list-empty {
    padding: 16px 12px;
    text-align: center;
    color: var(--vscode-descriptionForeground, ${(props: any) => props.theme?.textMuted || '#999999'});
  }

  .selected-count {
    font-size: 12px;
    color: var(--vscode-descriptionForeground, ${(props: any) => props.theme?.textMuted || '#999999'});

    strong {
      font-weight: 600;
      color: var(--vscode-textLink-foreground, ${(props: any) => props.theme?.textLink || '#3794ff'});
    }
  }

  input[type='checkbox'] {
    flex-shrink: 0;
    width: 15px;
    height: 15px;
    margin: 0;
    accent-color: var(--vscode-button-background, ${(props: any) => props.theme?.button?.primary?.bg || '#0e639c'});
    cursor: pointer;
  }

  .collection-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      background-color: var(--vscode-list-hoverBackground, ${(props: any) => props.theme?.sidebar?.collection?.item?.hoverBg || '#2d2d2d'});
    }

    .collection-row-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;

      .collection-name {
        font-weight: 500;
        color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .collection-file {
        font-size: 11px;
        color: var(--vscode-descriptionForeground, ${(props: any) => props.theme?.textMuted || '#999999'});
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .collection-error {
        font-size: 11px;
        color: var(--vscode-errorForeground, #f14c4c);
        white-space: pre-wrap;
      }
    }

    .status-icon {
      display: inline-flex;
      flex-shrink: 0;

      &.success {
        color: var(--vscode-testing-iconPassed, #73c991);
      }

      &.error {
        color: var(--vscode-errorForeground, #f14c4c);
      }
    }
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 500;
    color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
  }

  .form-input {
    box-sizing: border-box;
    padding: 6px 10px;
    border: 1px solid var(--vscode-input-border, ${(props: any) => props.theme?.input?.border || '#454545'});
    border-radius: 4px;
    background-color: var(--vscode-input-background, ${(props: any) => props.theme?.input?.bg || '#3c3c3c'});
    color: var(--vscode-input-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
    font-size: 13px;
    font-family: inherit;
    transition: border-color 0.15s ease;

    &:focus {
      outline: none;
      border-color: var(--vscode-focusBorder, ${(props: any) => props.theme?.button?.primary?.bg || '#007acc'});
    }

    &.error {
      border-color: var(--vscode-inputValidation-errorBorder, #f14c4c);
    }
  }

  .location-input-group {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;

    .location-input {
      width: 100%;
      cursor: pointer;
    }

    .browse-button {
      padding: 0;
      background: none;
      border: none;
      color: var(--vscode-textLink-foreground, ${(props: any) => props.theme?.textLink || '#3794ff'});
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;

      &:hover:not(:disabled) {
        color: var(--vscode-textLink-activeForeground, ${(props: any) => props.theme?.textLink || '#3794ff'});
        text-decoration: underline;
      }

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }
  }

  .location-row {
    display: flex;
    align-items: center;
    gap: 16px;

    .form-label {
      flex-shrink: 0;
    }

    .form-input {
      flex: 1;
      min-width: 0;
    }
  }

  .form-help {
    font-size: 11px;
    color: var(--vscode-descriptionForeground, ${(props: any) => props.theme?.textMuted || '#999999'});
  }

  .form-error {
    font-size: 12px;
    color: var(--vscode-errorForeground, #f14c4c);
  }

  .detected-format {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    background-color: var(--vscode-badge-background, ${(props: any) => props.theme?.button?.primary?.bg || '#0e639c'});
    color: var(--vscode-badge-foreground, ${(props: any) => props.theme?.button?.primary?.color || '#ffffff'});
  }

  .grouping-section {
    display: flex;
    gap: 12px;
    align-items: center;

    .grouping-label {
      flex: 1;
    }

    .current-group {
      background-color: var(--vscode-input-background, ${(props: any) => props.theme?.input?.bg || '#3c3c3c'});
      border-radius: 4px;
      padding: 6px 10px;
      cursor: pointer;
      border: 1px solid var(--vscode-input-border, ${(props: any) => props.theme?.input?.border || '#454545'});
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      min-width: 100px;
    }
  }

  .form-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 8px;
    padding-top: 16px;
    border-top: 1px solid var(--vscode-widget-border, ${(props: any) => props.theme?.input?.border || '#454545'});
  }

  .btn {
    padding: 6px 16px;
    border-radius: 4px;
    font-size: 13px;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s ease;
    min-width: 80px;

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  .btn-secondary {
    background-color: transparent;
    color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
    border: 1px solid var(--vscode-button-border, ${(props: any) => props.theme?.input?.border || '#454545'});

    &:hover:not(:disabled) {
      background-color: var(--vscode-list-hoverBackground, ${(props: any) => props.theme?.sidebar?.collection?.item?.hoverBg || '#2d2d2d'});
    }
  }

  .btn-primary {
    background-color: var(--vscode-button-background, ${(props: any) => props.theme?.button?.primary?.bg || '#0e639c'});
    color: var(--vscode-button-foreground, ${(props: any) => props.theme?.button?.primary?.color || '#ffffff'});
    border: none;

    &:hover:not(:disabled) {
      background-color: var(--vscode-button-hoverBackground, ${(props: any) => props.theme?.button?.primary?.hoverBg || '#1177bb'});
    }
  }

  .loading-overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    text-align: center;

    .loading-message {
      margin-top: 16px;
      font-size: 14px;
      color: var(--vscode-foreground, ${(props: any) => props.theme?.text || '#cccccc'});
    }

    .loading-hint {
      margin-top: 8px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground, ${(props: any) => props.theme?.textMuted || '#999999'});
    }
  }
`;

export default StyledWrapper;
