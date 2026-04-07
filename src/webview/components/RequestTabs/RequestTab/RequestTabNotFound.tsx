import React, { useState, useEffect } from 'react';
import { IconAlertTriangle } from '@tabler/icons';
import GradientCloseButton from './GradientCloseButton';

interface RequestTabNotFoundProps {
  handleCloseClick?: React.ReactNode;
}


const RequestTabNotFound = ({
  handleCloseClick
}: any) => {
  const [showErrorMessage, setShowErrorMessage] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      setShowErrorMessage(true);
    }, 300);
  }, []);

  if (!showErrorMessage) {
    return null;
  }

  return (
    <>
      <div className="flex items-center tab-label px-3">
        {showErrorMessage ? (
          <>
            <IconAlertTriangle size={18} strokeWidth={1.5} className="text-yellow-600" />
            <span className="ml-1">Not Found</span>
          </>
        ) : null}
      </div>
      <GradientCloseButton onClick={handleCloseClick} hasChanges={true} />
    </>
  );
};

export default RequestTabNotFound;
