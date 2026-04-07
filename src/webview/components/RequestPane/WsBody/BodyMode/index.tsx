import React, { useRef, forwardRef } from 'react';
import { IconCaretDown } from '@tabler/icons';
import Dropdown from 'components/Dropdown';
import { humanizeRequestBodyMode } from 'utils/collections';
import StyledWrapper from './StyledWrapper';

interface WSRequestBodyModeProps {
  mode: string;
  onModeChange: (mode: string) => void;
}

const RAW_MODES = [
  {
    label: 'JSON',
    key: 'json'
  },
  {
    label: 'XML',
    key: 'xml'
  },
  {
    label: 'TEXT',
    key: 'text'
  }
];

const WSRequestBodyMode = ({
  mode,
  onModeChange
}: WSRequestBodyModeProps) => {
  const dropdownTippyRef = useRef<{ hide: () => void } | null>(null);
  const onDropdownCreate = (ref: any) => dropdownTippyRef.current = ref;

  const Icon = forwardRef<HTMLDivElement>((props, ref) => {
    return (
      <div ref={ref} className="flex items-center justify-center pl-3 py-1 select-none selected-body-mode">
        {humanizeRequestBodyMode(mode)}
        {' '}
        <IconCaretDown className="caret ml-2" size={14} strokeWidth={2} />
      </div>
    );
  });

  return (
    <StyledWrapper>
      <div className="inline-flex items-center cursor-pointer body-mode-selector">
        <Dropdown onCreate={onDropdownCreate} icon={<Icon />} placement="bottom-end">
          <div className="label-item font-medium">Raw</div>
          {RAW_MODES.map((d) => (
            <div
              className="dropdown-item"
              key={d.key}
              onClick={() => {
                dropdownTippyRef.current?.hide();
                onModeChange(d.key);
              }}
            >
              {d.label}
            </div>
          ))}
        </Dropdown>
      </div>
    </StyledWrapper>
  );
};
export default WSRequestBodyMode;
