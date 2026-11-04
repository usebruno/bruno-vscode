import styled from 'styled-components';

const StyledWrapper = styled.div`
  .app-name {
    font-size: 16px;
    font-weight: 600;
  }

  .muted {
    margin-top: 2px;
    color: var(--vscode-descriptionForeground, ${(props) => props.theme?.colors?.text?.muted || '#999999'});
  }

  .about-section {
    margin-top: 28px;
  }

  .info-table {
    border-collapse: collapse;

    td {
      padding: 3px 0;
      vertical-align: top;
    }

    td:first-child {
      width: 160px;
      padding-right: 24px;
      color: var(--vscode-descriptionForeground, ${(props) => props.theme?.colors?.text?.muted || '#999999'});
    }
  }

  .links {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, max-content));
    column-gap: 40px;
    row-gap: 6px;
  }

  .link {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 2px 0;
    border: none;
    background: transparent;
    color: var(--vscode-textLink-foreground, ${(props) => props.theme?.textLink || '#3794ff'});
    font-family: inherit;
    font-size: 13px;
    cursor: pointer;

    &:hover {
      color: var(--vscode-textLink-activeForeground, ${(props) => props.theme?.textLink || '#3794ff'});
      text-decoration: underline;
    }

    &:focus-visible {
      outline: 1px solid var(--vscode-focusBorder, #007fd4);
      outline-offset: 2px;
    }
  }
`;

export default StyledWrapper;
