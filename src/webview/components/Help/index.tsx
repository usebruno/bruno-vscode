/**
 * The InfoTip components needs to be nuked
 * This component will be the future replacement
 * We should allow icon and placement props to be passed in
 */

import React, { useState, useRef, useCallback } from 'react';
import HelpIcon from 'components/Icons/Help';
import StyledWrapper from './StyledWrapper';

type Placement = 'top' | 'bottom' | 'left' | 'right';

interface TooltipPosition {
  top: number;
  left: number;
  transform?: string;
}

interface HelpProps {
  children?: React.ReactNode;
  width?: number;
  placement?: Placement;
  iconComponent?: React.ComponentType<{ size?: number }>;
  size?: number;
}

const GAP = 8;

const getPortalPosition = (rect: DOMRect, placement: Placement, width: number): TooltipPosition => {
  switch (placement) {
    case 'top':
      return {
        top: rect.top - GAP,
        left: rect.left + rect.width / 2 - width / 2,
        transform: 'translateY(-100%)'
      };
    case 'bottom':
      return {
        top: rect.bottom + GAP,
        left: rect.left + rect.width / 2 - width / 2
      };
    case 'left':
      return {
        top: rect.top + rect.height / 2,
        left: rect.left - GAP - width,
        transform: 'translateY(-50%)'
      };
    case 'right':
    default:
      return {
        top: rect.top + rect.height / 2,
        left: rect.right + GAP,
        transform: 'translateY(-50%)'
      };
  }
};

const Help = ({
  children,
  width = 200,
  placement = 'right',
  iconComponent: IconComponent,
  size = 14
}: HelpProps) => {
  const tooltipWidth = Number(width) || 200;
  const ResolvedIcon = IconComponent || HelpIcon;

  const [showTooltip, setShowTooltip] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const iconRef = useRef<HTMLSpanElement>(null);

  const handleMouseEnter = useCallback(() => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setPosition(getPortalPosition(rect, placement, tooltipWidth));
    }
    setShowTooltip(true);
  }, [placement, tooltipWidth]);

  return (
    <div className="flex items-center">
      <span
        ref={iconRef}
        className="flex items-center"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <ResolvedIcon size={size} />
      </span>
      {showTooltip && position && (
        <StyledWrapper
          className="z-50 rounded-md p-3"
          style={{
            position: 'fixed',
            ...position,
            width: `${tooltipWidth}px`
          }}
        >
          {children}
        </StyledWrapper>
      )}
    </div>
  );
};

export default Help;
