import React from 'react';
import { IconAlertTriangle } from '@tabler/icons';

interface ConfirmSwitchEnvProps {
  onCancel: () => void;
}

const ConfirmSwitchEnv: React.FC<ConfirmSwitchEnvProps> = ({ onCancel }) => {
  return (
    <div className="flex flex-col items-center justify-center p-6 bg-opacity-95 rounded-lg shadow-lg">
      <IconAlertTriangle size={48} className="text-yellow-500 mb-4" />
      <h3 className="text-lg font-semibold mb-2">Unsaved Changes</h3>
      <p className="text-sm text-center mb-4 opacity-80">
        You have unsaved changes in the current environment.
        Please save or discard your changes before switching.
      </p>
      <button
        className="btn btn-close px-4 py-2 rounded transition-colors"
        onClick={onCancel}
      >
        OK
      </button>
    </div>
  );
};

export default ConfirmSwitchEnv;
