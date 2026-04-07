import styled from 'styled-components';

const StyledWrapper = styled.div`
  .appearance-container {
    padding: 8px 0 16px 0;
  }

  .theme-info {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: ${(props) => props.theme.input.bg};
    border: 1px solid ${(props) => props.theme.input.border};
    border-radius: ${(props) => props.theme.border.radius.md};
    margin-top: 8px;
  }

  .theme-info-icon {
    color: ${(props) => props.theme.colors.text.muted};
  }

  .theme-info-text {
    font-size: ${(props) => props.theme.font.size.sm};
    color: ${(props) => props.theme.colors.text.muted};
    line-height: 1.5;
  }

  .current-theme {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 16px;
    padding: 12px;
    background: ${(props) => props.theme.input.bg};
    border: 1px solid ${(props) => props.theme.input.border};
    border-radius: ${(props) => props.theme.border.radius.md};
  }

  .current-theme-label {
    font-size: ${(props) => props.theme.font.size.sm};
    color: ${(props) => props.theme.colors.text.muted};
  }

  .current-theme-value {
    font-size: ${(props) => props.theme.font.size.sm};
    font-weight: 500;
    color: ${(props) => props.theme.text};
  }
`;

export default StyledWrapper;
