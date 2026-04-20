import React, { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { loadRequest } from 'providers/ReduxStore/slices/collections/actions';

interface RequestNotLoadedProps {
  item: any;
  collection: any;
}

const RequestNotLoaded: React.FC<RequestNotLoadedProps> = ({ item, collection }) => {
  const dispatch = useDispatch();
  const requestedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!item?.pathname || !collection?.uid) return;
    if (requestedRef.current === item.pathname) return;
    requestedRef.current = item.pathname;
    dispatch(loadRequest({ pathname: item.pathname, collectionUid: collection.uid }) as any);
  }, [item?.pathname, collection?.uid, dispatch]);

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="text-sm text-gray-500">Loading request...</div>
    </div>
  );
};

export default RequestNotLoaded;
