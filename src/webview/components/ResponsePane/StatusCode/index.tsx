import React from 'react';
import classnames from 'classnames';
import statusCodePhraseMap from './get-status-code-phrase';
import StyledWrapper from './StyledWrapper';

interface StatusCodeProps {
  status?: React.ReactNode;
  statusText?: unknown;
  isStreaming?: boolean;
}


// Todo: text-error class is not getting pulled in for 500 errors
const StatusCode = ({
  status,
  statusText,
  isStreaming
}: any) => {
  const getTabClassname = (status: number) => {
    return classnames({
      'text-ok': status >= 100 && status < 300,
      'text-error': status >= 300 && status < 600
    });
  };

  return (
    <StyledWrapper className={`response-status-code ${getTabClassname(status)}`} data-testid="response-status-code">
      {status} {statusText || (statusCodePhraseMap as Record<number, string>)[status]} {isStreaming ? ' - STREAMING' : null}
    </StyledWrapper>
  );
};
export default StatusCode;
