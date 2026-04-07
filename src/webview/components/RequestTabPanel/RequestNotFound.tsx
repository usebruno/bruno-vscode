import React from 'react';

interface RequestNotFoundProps {
  itemUid?: string;
}

const RequestNotFound: React.FC<RequestNotFoundProps> = ({ itemUid }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="text-lg font-semibold mb-2">Request no longer exists</div>
      <div className="text-sm text-gray-500">
        This can happen when the .bru file associated with this request was deleted on your filesystem.
      </div>
      {itemUid && (
        <div className="text-xs text-gray-400 mt-4 font-mono">
          Item UID: {itemUid}
        </div>
      )}
    </div>
  );
};

export default RequestNotFound;
