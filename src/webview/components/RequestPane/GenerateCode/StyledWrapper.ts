import styled from 'styled-components';

const StyledWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 480px;
  max-height: 60vh;

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
    padding-bottom: 10px;
  }

  .left-controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .select-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .select-arrow {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    color: ${(props) => props.theme.dropdown.mutedText};
  }

  .native-select {
    background: ${(props) => props.theme.input.bg};
    border: 1px solid ${(props) => props.theme.input.border};
    border-radius: 3px;
    color: ${(props) => props.theme.requestTabPanel.url.icon};
    font-size: ${(props) => props.theme.font.size.sm};
    padding: 6px 28px 6px 10px;
    min-width: 140px;
    height: 32px;
    cursor: pointer;
    transition: all 0.2s ease;
    appearance: none;
    outline: none;
    box-shadow: none;

    &:hover {
      border-color: ${(props) => props.theme.input.focusBorder};
    }

    &:focus {
      outline: none;
      border-color: ${(props) => props.theme.input.focusBorder};
    }
  }

  .library-options {
    display: flex;
    gap: 6px;
  }

  .lib-btn {
    height: 32px;
    padding: 0 12px;
    background: ${(props) => props.theme.input.bg};
    border: 1px solid ${(props) => props.theme.input.border};
    border-radius: 3px;
    color: ${(props) => props.theme.requestTabPanel.url.icon};
    font-size: ${(props) => props.theme.font.size.sm};
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;

    &:hover {
      background: ${(props) => props.theme.dropdown.hoverBg};
      border-color: ${(props) => props.theme.input.focusBorder};
    }

    &.active {
      background: ${(props) => props.theme.button.secondary.bg};
      border-color: ${(props) => props.theme.button.secondary.border};
      color: ${(props) => props.theme.button.secondary.color};
    }
  }

  .right-controls {
    display: flex;
    align-items: center;

    .interpolate-checkbox {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: ${(props) => props.theme.font.size.base};
      color: ${(props) => props.theme.requestTabPanel.url.icon};

      input[type='checkbox'] {
        cursor: pointer;
        margin: 0;
      }

      &:hover {
        opacity: 0.8;
      }
    }
  }

  .snippet-editor {
    flex: 1;
    min-height: 0;
    border: ${(props) => props.theme.requestTabPanel.url.border};
  }
`;

export default StyledWrapper;