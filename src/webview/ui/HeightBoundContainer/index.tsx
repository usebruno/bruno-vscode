import React from 'react';
import StyledWrapper from './StyledWrapper';

interface HeightBoundContainerProps {
  children?: React.ReactNode;
  className?: string;
}


const HeightBoundContainer = ({
  children,
  className
}: any) => {
  return (
    <StyledWrapper className={className}>
      <div className="height-constraint">
        <div className="flex-boundary">
          {children}
        </div>
      </div>
    </StyledWrapper>
  );
};

export default HeightBoundContainer;
