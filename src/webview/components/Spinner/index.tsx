import React from 'react';
import StyledWrapper from './StyledWrapper';

interface SpinnerProps {
  size?: number;
  color?: unknown;
  children?: React.ReactNode;
}


// Todo: Size, Color config support
const Spinner = ({
  size,
  color,
  children
}: any) => {
  return (
    <StyledWrapper>
      <div className="animate-spin"></div>
      {children && <div>{children}</div>}
    </StyledWrapper>
  );
};

export default Spinner;
