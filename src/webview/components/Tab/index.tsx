import React from 'react';
import classnames from 'classnames';

interface TabProps {
  name?: React.ReactNode;
  label?: React.ReactNode;
  isActive?: boolean;
  onClick?: (...args: unknown[]) => void;
  count?: number;
  className?: string;
}


const Tab = ({
  name,
  label,
  isActive,
  onClick,
  count = 0,
  className = '',
  ...props
}: any) => {
  const tabClassName = classnames('tab select-none', {
    active: isActive
  }, className);

  return (
    <div
      className={tabClassName}
      role="tab"
      onClick={() => onClick(name)}
      data-testid={`tab-${name}`}
      {...props}
    >
      {label}
      {count > 0 && <sup className="ml-1 font-medium" data-testid={`tab-${name}-count`}>{count}</sup>}
    </div>
  );
};

export default Tab;
