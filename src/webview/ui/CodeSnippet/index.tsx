import React from 'react';
import type { ScriptErrorContextLine } from '@bruno-types';
import StyledWrapper from './StyledWrapper';

interface CodeSnippetProps {
  lines?: ScriptErrorContextLine[];
}

const CodeSnippet = ({ lines }: CodeSnippetProps) => {
  if (!lines?.length) return null;

  return (
    <StyledWrapper>
      <div className="code-snippet" data-testid="code-snippet">
        {lines.map((line) => (
          <div
            key={line.lineNumber}
            className={`code-line ${line.isError ? 'highlighted-error' : ''}`}
            data-testid={`${line.isError ? 'code-line-error' : 'code-line'}-${line.lineNumber}`}
          >
            <span className="code-line-number">{line.lineNumber}</span>
            <span className="code-line-content">
              {line.isError ? '> ' : '  '}{line.content}
            </span>
          </div>
        ))}
      </div>
    </StyledWrapper>
  );
};

export default CodeSnippet;
