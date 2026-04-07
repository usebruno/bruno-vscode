import React, { createContext, useContext } from 'react';
import classnames from 'classnames';
import StyledWrapper from './StyledWrapper';

interface TabsContextValue {
  value?: string;
  onValueChange?: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue>({});

export const Tabs = ({
  value,
  onValueChange,
  children,
  className = ''
}: any) => {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <StyledWrapper className={`flex flex-col h-full flex-1 ${className}`}>{children}</StyledWrapper>
    </TabsContext.Provider>
  );
};

export const TabsList = ({
  children,
  className = ''
}: any) => {
  return <div className={`tabs-list ${className}`}>{children}</div>;
};

export const TabsTrigger = ({
  value: triggerValue,
  children,
  className = ''
}: any) => {
  const { value, onValueChange } = useContext(TabsContext);
  const isActive = value === triggerValue;

  return (
    <button
      onClick={() => onValueChange(triggerValue)}
      className={classnames('tab-trigger', className, { active: isActive })}
    >
      {children}
    </button>
  );
};

export const TabsContent = ({
  value: contentValue,
  children,
  className = '',
  dataTestId = ''
}: any) => {
  const { value } = useContext(TabsContext);
  const isActive = value === contentValue;

  return (
    <div
      className={`outline-none flex flex-col h-full flex-1 ${className}`}
      data-testid={dataTestId}
      style={{ display: isActive ? 'flex' : 'none' }}
    >
      {children}
    </div>
  );
};
