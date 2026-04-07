import React from 'react';
import classnames from 'classnames';
import wsStatusCodePhraseMap from './get-ws-status-code-phrase';
import StyledWrapper from './StyledWrapper';

interface WSStatusCodeProps {
  status?: React.ReactNode;
  text?: unknown;
}


const WSStatusCode = ({
  status,
  text
}: any) => {
  const getTabClassname = (status: any) => {
    return classnames('ml-2', {
      // ok if normal connect and normal closure
      'text-ok': parseInt(status) === 0 || parseInt(status) === 1000,
      'text-error': parseInt(status) !== 1000 && parseInt(status) !== 0
    });
  };

  const statusText = text || (wsStatusCodePhraseMap as Record<number, string>)[status];

  return (
    <StyledWrapper className={getTabClassname(status)}>
      {Number.isInteger(status) && status != 0 ? <div className="mr-1">{status}</div> : null}
      {statusText && <div>{statusText}</div>}
    </StyledWrapper>
  );
};

export default WSStatusCode;
