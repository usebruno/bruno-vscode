import React, { createContext, useContext, useState } from 'react';
import { IconChevronDown } from '@tabler/icons';
import { AccordionItem, AccordionHeader, AccordionContent } from './styledWrapper';

interface AccordionContextValue {
  openIndex: number | null;
  toggleItem: (index: number) => void;
}

interface AccordionProps {
  children?: React.ReactNode;
  defaultIndex?: number;
  dataTestId?: string;
}

interface ItemProps {
  index?: number;
  children?: React.ReactNode;
  className?: string;
}

interface HeaderProps {
  index?: number;
  children?: React.ReactNode;
  className?: string;
}

interface ContentProps {
  index?: number;
  children?: React.ReactNode;
  className?: string;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

const useAccordionContext = (): AccordionContextValue => {
  const context = useContext(AccordionContext);
  if (!context) {
    throw new Error('Accordion compound components must be used within Accordion');
  }
  return context;
};

const Accordion = ({
  children,
  defaultIndex,
  dataTestId
}: AccordionProps) => {
  const [openIndex, setOpenIndex] = useState<number | null>(defaultIndex ?? null);

  const toggleItem = (index: number): void => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <AccordionContext.Provider value={{ openIndex, toggleItem }}>
      <div data-testid={dataTestId}>{children}</div>
    </AccordionContext.Provider>
  );
};

const Item = ({
  index,
  children,
  ...props
}: ItemProps) => {
  return (
    <AccordionItem {...props}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement<{ index?: number }>(child)) {
          return React.cloneElement(child, { index });
        }
        return child;
      })}
    </AccordionItem>
  );
};

export const Header = ({
  index,
  children,
  ...props
}: HeaderProps) => {
  const { openIndex, toggleItem } = useAccordionContext();
  const isOpen = openIndex === index;

  return (
    <AccordionHeader onClick={() => index !== undefined && toggleItem(index)} {...props} className={isOpen ? 'open' : ''}>
      <div className="w-full">{children}</div>

      <IconChevronDown
        className="w-5 h-5 ml-auto"
        style={{
          transform: `rotate(${isOpen ? '180deg' : '0deg'})`,
          transition: 'transform 0.3s ease-in-out'
        }}
      />
    </AccordionHeader>
  );
};

const Content = ({
  index,
  children,
  ...props
}: ContentProps) => {
  const { openIndex } = useAccordionContext();
  const isOpen = openIndex === index;

  return (
    <AccordionContent isOpen={isOpen} {...props}>
      {children}
    </AccordionContent>
  );
};

Accordion.Item = Item;
Accordion.Header = Header;
Accordion.Content = Content;
export default Accordion;
