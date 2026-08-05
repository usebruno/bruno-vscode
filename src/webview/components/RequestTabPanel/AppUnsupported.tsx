import React from 'react';
import { IconAppWindow } from '@tabler/icons';

const AppUnsupported: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <IconAppWindow size={40} strokeWidth={1.5} className="mb-4 opacity-70" />
      <div className="text-lg font-semibold mb-2">Apps are not supported in VS Code</div>
      <div className="text-sm opacity-70 max-w-md">
        To use this feature, please open this collection in the Bruno desktop application.
      </div>
    </div>
  );
};

export default AppUnsupported;
