import React from 'react';
import { useSidebarAccordion } from './SidebarAccordionContext';

interface SidebarContentProps {
  sections: unknown[];
}

/**
 * Sections configuration
 *
 * All sections use the same generic accordion behavior with the class 'accordion-section-wrapper'.
 * Layout behavior is fully automatic based on section order and expansion state:
 * - Single expanded: When only one section is expanded, it fills available space
 * - Multi-expanded: When multiple sections are expanded, they split space equally
 * - Automatic pinning: Sections below an expanded section are automatically pinned to bottom
 *
 * To add a new section, simply add a new entry to this array:
 *
 * {
 *   id: 'my-section',                    // Unique identifier
 *   component: MySectionComponent,       // React component to render
 *   getProps: (context) => ({ ... })     // Function to get props for component
 * }
 */

const SidebarContent = ({
  sections
}: any) => {
  const { isExpanded, getExpandedCount } = useSidebarAccordion();

  const expandedCount = getExpandedCount();

  const getWrapperClassName = (section: any, sectionIndex: any) => {
    const sectionExpanded = isExpanded(section.id);
    const classes = ['accordion-section-wrapper'];

    // Multi-expanded: when multiple sections are expanded
    if (expandedCount > 1 && sectionExpanded) {
      classes.push('multi-expanded');
    }

    // Single expanded wrapper behavior: when only one section is expanded, it fills space
    if (sectionExpanded && expandedCount === 1) {
      classes.push('single-expanded-wrapper');
    }

    // Automatic pinning: if section is not expanded and any section above it (earlier in array) is expanded
    if (!sectionExpanded) {
      const hasExpandedAbove = sections.slice(0, sectionIndex).some((s: any) => isExpanded(s.id));
      if (hasExpandedAbove) {
        classes.push('pinned-to-bottom');
      }
    }

    return classes.join(' ');
  };

  return <>
    {sections.map((section: any, index: any) => {
      const SectionComponent = section.component;
      const wrapperClassName = getWrapperClassName(section, index);

      return (
        <div key={section.id} className={wrapperClassName}>
          <SectionComponent />
        </div>
      );
    })}
  </>;
};

export default SidebarContent;
