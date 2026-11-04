import React from 'react';
import DotIcon from 'components/Icons/Dot';

interface StatusDotProps {
  type?: 'default' | 'error';
  testId: string;
}

const StatusDot = ({ type = 'default', testId }: StatusDotProps) => (
  <sup
    className={`ml-[.125rem] opacity-80 font-medium ${
      type === 'error' ? 'text-red-500' : ''
    }`}
    data-testid={`status-dot-${testId}`}
  >
    <DotIcon width="10" />
  </sup>
);

export default StatusDot;
