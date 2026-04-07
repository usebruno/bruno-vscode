import React from 'react';
import classnames from 'classnames';
import grpcStatusCodePhraseMap from './get-grpc-status-code-phrase';
import StyledWrapper from './StyledWrapper';

interface GrpcStatusCodeProps {
  status?: React.ReactNode;
  text?: unknown;
}


const GrpcStatusCode = ({
  status,
  text
}: any) => {
  // gRPC status codes: 0 is success, anything else is an error
  const getTabClassname = (status: any) => {
    const isPending = text === 'PENDING' || text === 'STREAMING';
    return classnames('ml-2', {
      'text-ok': parseInt(status) === 0,
      'text-pending': isPending,
      'text-error': parseInt(status) > 0 && !isPending
    });
  };

  const statusText = text || (grpcStatusCodePhraseMap as Record<string | number, string>)[status];

  return (
    <StyledWrapper className={getTabClassname(status)}>
      {Number.isInteger(status) ? <div className="mr-1" data-testid="grpc-response-status-code">{status}</div> : null}
      {statusText && <div data-testid="grpc-response-status-text">{statusText}</div>}
    </StyledWrapper>
  );
};

export default GrpcStatusCode;
