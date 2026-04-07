import styled from 'styled-components';

const StyledWrapper = styled.div`
  font-size: ${(props) => props.theme.font.size.base};

  .auth-mode-selector {
    background: transparent;

    .auth-mode-label {
      color: ${(props) => props.theme.dropdown.selectedColor};
      font-weight: 500;

      .caret {
        color: ${(props) => props.theme.colors.text.muted};
        fill: ${(props) => props.theme.colors.text.muted};
      }
    }
  }
`;

export default StyledWrapper;
