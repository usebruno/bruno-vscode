import React from 'react';
import { IconAlertTriangle } from '@tabler/icons';
import { Tooltip } from 'react-tooltip';
import StyledWrapper from './StyledWrapper';

interface SensitiveFieldWarningProps {
  fieldName?: React.ReactNode;
  warningMessage?: React.ReactNode;
}


const SensitiveFieldWarning = ({
  fieldName,
  warningMessage
}: any) => {
  const tooltipId = `sensitive-field-warning-${fieldName}`;

  return (
    <StyledWrapper>
      <span className="ml-2 flex items-center">
        <IconAlertTriangle id={tooltipId} className="tooltip-icon cursor-pointer" size={20} />
        <Tooltip
          anchorId={tooltipId}
          className="tooltip-mod max-w-lg"
          content={String(warningMessage || '')}
        />
      </span>
    </StyledWrapper>
  );
};

export default SensitiveFieldWarning;
