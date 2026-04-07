import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { IconEraser } from '@tabler/icons';
import { useDispatch } from 'react-redux';
import StyledWrapper from './StyledWrapper';
import { responseCleared } from 'providers/ReduxStore/slices/collections/index';
import ActionIcon from 'ui/ActionIcon/index';

interface ResponseClearProps {
  collection?: { uid: string };
  item?: { uid: string };
  children?: React.ReactNode;
  asDropdownItem?: boolean;
  onClose?: () => void;
}

interface ResponseClearRef {
  click: () => void;
  isDisabled: boolean;
}

// Hook to get clear response function
export const useResponseClear = (item: { uid: string } | undefined, collection: { uid: string } | undefined) => {
  const dispatch = useDispatch();

  const clearResponse = () => {
    if (!item?.uid || !collection?.uid) return;
    dispatch(
      responseCleared({
        itemUid: item.uid,
        collectionUid: collection.uid,
        response: null
      })
    );
  };

  return { clearResponse };
};

const ResponseClear = forwardRef<ResponseClearRef, ResponseClearProps>(({ collection, item, children }, ref) => {
  const { clearResponse } = useResponseClear(item, collection);
  const elementRef = useRef(null);

  useImperativeHandle(ref, () => ({
    click: () => elementRef.current?.click(),
    isDisabled: false
  }), []);

  return (
    <div ref={elementRef} onClick={clearResponse} title={!children ? 'Clear response' : null} data-testid="response-clear-btn">
      {children ? children : (
        <StyledWrapper className="flex items-center">
          <ActionIcon className="p-1">
            <IconEraser size={16} strokeWidth={2} />
          </ActionIcon>
        </StyledWrapper>
      )}
    </div>
  );
});

ResponseClear.displayName = 'ResponseClear';

export default ResponseClear;
