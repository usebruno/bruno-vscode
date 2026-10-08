import React from 'react';
import styled from 'styled-components';

export type JsonPreviewMode = 'tree' | 'table';

interface ModeToggleProps {
  mode: JsonPreviewMode;
  onChange: (mode: JsonPreviewMode) => void;
}

const ToggleGroup = styled.div`
  display: inline-flex;
  align-items: stretch;
  border: 1px solid ${(props) => props.theme.border.border2};
  border-radius: ${(props) => props.theme.border.radius.sm};
  overflow: hidden;
  background: ${(props) => props.theme.background.surface1};
  font-size: 11px;
  line-height: 1;
  font-family: inherit;

  button {
    appearance: none;
    background: transparent;
    border: 0;
    padding: 4px 12px;
    cursor: pointer;
    color: ${(props) => props.theme.colors.text.muted};
    transition: background-color 120ms ease, color 120ms ease;
  }

  button + button {
    border-left: 1px solid ${(props) => props.theme.border.border2};
  }

  button:hover {
    color: ${(props) => props.theme.colors.text.white};
  }

  button.active {
    background: ${(props) => props.theme.background.surface0};
    color: ${(props) => props.theme.colors.text.yellow};
    font-weight: 600;
  }

  button:focus {
    outline: none;
  }

  button:focus-visible {
    box-shadow: inset 0 0 0 2px ${(props) => props.theme.colors.text.yellow};
  }
`;

const ModeToggle: React.FC<ModeToggleProps> = ({ mode, onChange }) => (
  <ToggleGroup role="tablist" aria-label="JSON preview mode">
    <button
      type="button"
      role="tab"
      aria-selected={mode === 'tree'}
      className={mode === 'tree' ? 'active' : ''}
      onClick={() => onChange('tree')}
    >
      Tree
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={mode === 'table'}
      className={mode === 'table' ? 'active' : ''}
      onClick={() => onChange('table')}
    >
      Table
    </button>
  </ToggleGroup>
);

export default ModeToggle;
