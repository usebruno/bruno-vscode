import styled from 'styled-components';

const StyledWrapper = styled.div`
  &.dragging {
    cursor: col-resize;
  }

  &.vertical-layout.dragging {
    cursor: row-resize;
  }

  .dragbar-wrapper {
    position: relative;
    z-index: 1;
    cursor: col-resize;
    padding: 0 4px;
  }

  .dragbar-handle {
    width: 2px;
    height: 100%;
    background: ${(props) => props.theme.requestTabPanel?.dragbar?.border || props.theme.border?.border0 || '#454545'};
    transition: background 0.2s;
  }

  .dragbar-wrapper:hover .dragbar-handle {
    background: ${(props) => props.theme.requestTabPanel?.dragbar?.activeBorder || props.theme.colors?.accent || '#007fd4'};
  }

  &.vertical-layout .dragbar-wrapper {
    cursor: row-resize;
    padding: 4px 0;
    width: 100%;
  }

  &.vertical-layout .dragbar-handle {
    width: 100%;
    height: 2px;
  }

  .main {
    flex: 1;
    min-height: 0;
    min-width: 0;
  }

  .request-pane {
    overflow: auto;
    min-width: 300px;
    flex-shrink: 0;
  }

  &.vertical-layout .request-pane {
    min-width: auto;
    min-height: 150px;
    flex-shrink: 0;
  }

  .response-pane {
    overflow: auto;
    min-width: 0;
    flex: 1;
  }

  &.vertical-layout .response-pane {
    min-width: auto;
    min-height: 0;
    flex: 1;
  }

  .graphql-docs-explorer-container {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 400px;
    background: ${(props) => props.theme.bg || props.theme.background?.base};
    border-left: 1px solid ${(props) => props.theme.requestTabPanel?.dragbar?.border || props.theme.border?.border0 || '#454545'};
    z-index: 10;
    overflow: auto;

    &.hidden {
      display: none;
    }
  }
`;

export default StyledWrapper;
