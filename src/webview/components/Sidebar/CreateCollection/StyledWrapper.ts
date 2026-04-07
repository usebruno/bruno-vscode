import styled from 'styled-components';

const StyledWrapper = styled.div`
  .advanced-options {
    .caret {
      color: ${(props) => props.theme.textLink};
      fill: ${(props) => props.theme.textLink};
    }
  }

  .btn-advanced {
    background: none;
    border: none;
    color: ${(props) => props.theme.textLink};
    font-size: inherit;
    font-family: inherit;
    cursor: pointer;
    padding: 0;
  }
`;

export default StyledWrapper;
