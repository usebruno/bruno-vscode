import styled from 'styled-components';

const StyledWrapper = styled.div`
  color: ${(props) => props.theme.text};
  overflow: hidden;
  min-width: 0;

  .test-summary {
    transition: background-color 0.2s;
    border-bottom: 1px solid ${(props) => props.theme.sidebar.collection.item.indentBorder};
    color: ${(props) => props.theme.text};

    &:hover {
      background-color: ${(props) => props.theme.sidebar.collection.item.hoverBg};
    }
  }

  .test-success {
    color: ${(props) => props.theme.colors.text.green};
  }

  .test-failure {
    color: ${(props) => props.theme.colors.text.danger};
  }

  .test-success-count {
    color: ${(props) => props.theme.colors.text.green};
  }

  .test-failure-count {
    color: ${(props) => props.theme.colors.text.danger};
  }

  .test-result-item {
    word-break: break-word;
    overflow-wrap: break-word;
    min-width: 0;
  }

  .error-message {
    color: ${(props) => props.theme.colors.text.muted};
    word-break: break-word;
    overflow-wrap: break-word;
    white-space: pre-wrap;
  }

  .test-results-list {
    transition: all 0.3s ease;
  }

  .dropdown-icon {
    color: ${(props) => props.theme.sidebar.dropdownIcon.color};
  }

  ul {
    overflow: hidden;
    min-width: 0;
  }

  li {
    overflow: hidden;
    min-width: 0;
  }
`;

export default StyledWrapper;
