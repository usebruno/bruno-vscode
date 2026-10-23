import React from 'react';
import DotIcon from 'components/Icons/Dot';

interface StatusDotProps {
  type?: 'default' | 'error';
  dataTestId: string;
}

const StatusDot = ({ type = 'default', dataTestId }: StatusDotProps) => (
  <sup
    className={`ml-[.125rem] opacity-80 font-medium ${
      type === 'error' ? 'text-red-500' : ''
    }`}
    data-testid={`status-dot-${dataTestId}`}
  >
    <DotIcon width="10" />
  </sup>
);

export default StatusDot;
