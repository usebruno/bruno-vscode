import React, { createContext, useContext, useState, useCallback, useRef, RefObject } from 'react';

interface SidebarAccordionContextValue {
  expandedSections: Set<string>;
  toggleSection: (sectionId: string) => void;
  setSectionExpanded: (sectionId: string, expanded: boolean) => void;
  isExpanded: (sectionId: string) => boolean;
  getExpandedCount: () => number;
  dropdownContainerRef: RefObject<HTMLDivElement>;
}

const SidebarAccordionContext = createContext<SidebarAccordionContextValue | null>(null);

export const useSidebarAccordion = (): SidebarAccordionContextValue => {
  const context = useContext(SidebarAccordionContext);
  if (!context) {
    throw new Error('useSidebarAccordion must be used within SidebarAccordionProvider');
  }
  return context;
};

export const SidebarAccordionProvider = ({
  children,
  defaultExpanded = ['collections']
}: any) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(defaultExpanded));
  const dropdownContainerRef = useRef(null);

  const toggleSection = useCallback((sectionId: any) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  }, []);

  const setSectionExpanded = useCallback((sectionId: any, expanded: any) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (expanded) {
        newSet.add(sectionId);
      } else {
        newSet.delete(sectionId);
      }
      return newSet;
    });
  }, []);

  const isExpanded = useCallback((sectionId: any) => {
    return expandedSections.has(sectionId);
  }, [expandedSections]);

  const getExpandedCount = useCallback(() => {
    return expandedSections.size;
  }, [expandedSections]);

  return (
    <SidebarAccordionContext.Provider
      value={{
        expandedSections,
        toggleSection,
        setSectionExpanded,
        isExpanded,
        getExpandedCount,
        dropdownContainerRef
      }}
    >
      <div ref={dropdownContainerRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {children}
      </div>
    </SidebarAccordionContext.Provider>
  );
};
