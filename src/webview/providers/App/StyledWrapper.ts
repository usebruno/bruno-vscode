import styled from 'styled-components';

const StyledWrapper = styled.div`
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  color: ${(props) => props.theme.text};
  background-color: ${(props) => props.theme.bg};
`;

export default StyledWrapper;
