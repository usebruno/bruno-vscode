import styled from 'styled-components';

const StyledWrapper = styled.div`
  .info-icon {
    color: ${(props) => props.theme.colors.text.muted};
  }

  /* Required field asterisk */
  .required-asterisk {
    color: ${(props) => props.theme.colors.text.danger};
  }

  .error-message {
    color: ${(props) => props.theme.colors.text.danger};
  }

  input[type='checkbox'] {
    cursor: pointer;
    accent-color: ${(props) => props.theme.primary.solid};
  }
`;

export default StyledWrapper;
