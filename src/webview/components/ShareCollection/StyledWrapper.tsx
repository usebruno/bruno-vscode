import styled from 'styled-components';

const StyledWrapper = styled.div`
  .share-button {
    display: flex;
    border-radius: ${(props) => props.theme.border.radius.base};
    padding: 10px;
    border: 1px solid ${(props) => props.theme.border.border0};
    background-color: ${(props) => props.theme.background.base};
    color: ${(props) => props.theme.text};
    cursor: pointer;
    transition: all 0.1s ease;

    &.no-padding {
      padding: 0px;
    }

    .note-warning {
      color: ${(props) => props.theme.colors?.text?.warning || '#f59e0b'};
      background-color: rgba(245, 158, 11, 0.06);
    }

    &:hover {
      background-color: ${(props) => props.theme.background.mantle};
      border-color: ${(props) => props.theme.border.border2};
    }

    &.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
`;

export default StyledWrapper;
