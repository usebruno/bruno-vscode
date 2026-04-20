import React from 'react';
import RequestMethod from '../RequestMethod';
import { IconLoader2, IconAlertTriangle, IconAlertCircle } from '@tabler/icons';
import StyledWrapper from './StyledWrapper';

interface CollectionItemIconProps {
  item?: React.ReactNode;
}


const CollectionItemIcon = ({
  item
}: any) => {
  if (item?.error) {
    return <StyledWrapper><IconAlertCircle className="w-fit mr-2 error" size={18} strokeWidth={1.5} /></StyledWrapper>;
  }

  if (item?.loading) {
    return <IconLoader2 className="animate-spin w-fit mr-2" size={18} strokeWidth={1.5} />;
  }

  // When we have a request type (from the lightweight meta parse), render
  // the method badge. `partial` just means the full file isn't parsed yet —
  // the sidebar still has enough info to show GET/POST/etc.
  const hasType = ['http-request', 'graphql-request', 'grpc-request', 'ws-request'].includes(item?.type);
  if (hasType) {
    return <RequestMethod item={item} />;
  }

  if (item?.partial) {
    return <StyledWrapper><IconAlertTriangle size={18} className="w-fit mr-2 partial" strokeWidth={1.5} /></StyledWrapper>;
  }

  return <RequestMethod item={item} />;
};

export default CollectionItemIcon;
