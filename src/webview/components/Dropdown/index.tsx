import React from 'react';
import Tippy from '@tippyjs/react';
import StyledWrapper from './StyledWrapper';

interface DropdownProps {
  icon?: React.ReactNode;
  children?: React.ReactNode;
  onCreate?: (...args: unknown[]) => void;
  placement?: unknown;
  transparent?: React.ReactNode;
  visible?: boolean;
  appendTo?: unknown;
}


const Dropdown = ({
  icon,
  children,
  onCreate,
  placement,
  transparent,
  visible,
  appendTo,
  ...props
}: any) => {
  // When in controlled mode (visible prop is provided), don't use trigger prop
  const tippyProps = visible !== undefined
    ? { ...props, visible, interactive: true, appendTo: appendTo || 'parent' }
    : { ...props, trigger: 'click', interactive: true, appendTo: appendTo || 'parent' };

  return (
    <Tippy
      render={(attrs) => (
        <StyledWrapper className="tippy-box dropdown" tabIndex={-1} {...attrs}>
          {children}
        </StyledWrapper>
      )}
      placement={placement || 'bottom-end'}
      animation={false}
      arrow={false}
      onCreate={onCreate}
      {...tippyProps}
    >
      {icon}
    </Tippy>
  );
};

export default Dropdown;
