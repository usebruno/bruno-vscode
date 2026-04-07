import React from 'react';
import StyledWrapper from './StyledWrapper';

interface ResponseHeadersProps {
  headers?: React.ReactNode;
}


const ResponseHeaders = ({
  headers
}: any) => {
  const headersArray: [string, string][] = typeof headers === 'object' && headers !== null
    ? Object.entries(headers).map(([k, v]) => [k, String(v)])
    : [];

  return (
    <StyledWrapper className="pb-4 w-full">
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <td>Name</td>
              <td>Value</td>
            </tr>
          </thead>
          <tbody>
            {headersArray && headersArray.length
              ? headersArray.map((header, index) => {
                  return (
                    <tr key={index}>
                      <td className="key">{header[0]}</td>
                      <td className="value">{header[1]}</td>
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
      </div>
    </StyledWrapper>
  );
};
export default ResponseHeaders;
