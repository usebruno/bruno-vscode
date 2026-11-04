import styled from 'styled-components';

const StyledWrapper = styled.div`
  .editing-mode {
    cursor: pointer;
    color: ${(props) => props.theme.colors.text.yellow};
  }

  div.CodeMirror {
    height: 100%;
  }
`;

export default StyledWrapper;
