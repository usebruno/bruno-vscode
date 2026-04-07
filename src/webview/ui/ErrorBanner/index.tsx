import React from 'react';
import { IconX } from '@tabler/icons';
import StyledWrapper from './StyledWrapper';

interface ErrorBannerProps {
  errors: unknown[];
  onClose?: (...args: unknown[]) => void;
  className?: string;
}


const ErrorBanner = ({
  errors,
  onClose,
  className = ''
}: any) => {
  if (!errors || errors.length === 0) return null;

  return (
    <StyledWrapper className={className}>
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          {errors.map((error: any, index: any) => (
            <div key={index}>
              {index > 0 && <div className="separator my-2"></div>}
              <div className="error-title">
                {error.title}
              </div>
              <div className="error-message">
                {error.message}
              </div>
            </div>
          ))}
        </div>
        {onClose && (
          <div
            className="close-button flex-shrink-0 cursor-pointer"
            onClick={onClose}
          >
            <IconX size={16} strokeWidth={1.5} />
          </div>
        )}
      </div>
    </StyledWrapper>
  );
};

export default ErrorBanner;
