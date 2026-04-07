import React from 'react';
import { useDispatch } from 'react-redux';
import { loadRequest } from 'providers/ReduxStore/slices/collections/actions';

interface RequestNotLoadedProps {
  item: any;
  collection: any;
}

const RequestNotLoaded: React.FC<RequestNotLoadedProps> = ({ item, collection }) => {
  const dispatch = useDispatch();

  const handleLoad = () => {
    dispatch(loadRequest({ pathname: item.pathname, collectionUid: collection.uid }) as any);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="text-lg font-semibold mb-2">Request not loaded</div>
      <div className="text-sm text-gray-500 mb-4">
        This request has not been fully loaded yet.
      </div>
      <button
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        onClick={handleLoad}
      >
        Load Request
      </button>
    </div>
  );
};

export default RequestNotLoaded;
