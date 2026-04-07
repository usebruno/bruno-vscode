import React from 'react';
import StyledWrapper from './StyledWrapper';

interface ResponseSizeProps {
  size?: number;
}


const ResponseSize = ({
  size
}: any) => {
  if (!Number.isFinite(size)) {
    return null;
  }

  let sizeToDisplay = '';

  // If size is greater than 1024 bytes, format as KB
  if (size > 1024) {
    let kb = Math.floor(size / 1024);
    let decimal = Math.round(parseFloat(((size % 1024) / 1024).toFixed(2)) * 100);
    sizeToDisplay = kb + '.' + decimal + 'KB';
  } else {
    // If size is less than or equal to 1024 bytes, display as bytes (B)
    sizeToDisplay = size + 'B';
  }

  return (
    <StyledWrapper title={(size?.toLocaleString() || '0') + 'B'} className="ml-2">
      {sizeToDisplay}
    </StyledWrapper>
  );
};
export default ResponseSize;
