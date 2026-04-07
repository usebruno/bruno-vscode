import React from 'react';

interface RequestIsLoadingProps {
  item: any;
}

const RequestIsLoading: React.FC<RequestIsLoadingProps> = ({ item }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="text-lg font-semibold mb-2">Loading request...</div>
      <div className="text-sm text-gray-500">
        Please wait while the request is being loaded.
      </div>
    </div>
  );
};

export default RequestIsLoading;
