import React, { useEffect, useMemo, useRef, useState } from 'react';
import ErrorBanner from 'ui/ErrorBanner';
import StyledWrapper from './StyledWrapper';
import FilterInput from './FilterInput';
import TableView from './TableView';
import { flatten } from './flatten';

interface JsonTablePreviewProps {
  data: unknown;
  modeToggle: React.ReactNode;
}

const JsonTablePreview: React.FC<JsonTablePreviewProps> = ({ data, modeToggle }) => {
  const shape = useMemo(() => flatten(data), [data]);
  const [filter, setFilter] = useState('');
  const resetTokenRef = useRef(0);

  // Reset filter/sort/page when the underlying data changes (per spec section 6/12).
  useEffect(() => {
    setFilter('');
    resetTokenRef.current += 1;
  }, [data]);

  return (
    <StyledWrapper>
      <div className="json-table-toolbar">
        <FilterInput onChange={setFilter} resetToken={resetTokenRef.current} />
        {modeToggle}
      </div>
      {shape.kind === 'unsupported' ? (
        <div style={{ padding: 12 }}>
          <ErrorBanner errors={[{ title: 'Cannot display as table', message: shape.reason }]} />
        </div>
      ) : (
        <TableView shape={shape} filter={filter} resetToken={resetTokenRef.current} />
      )}
    </StyledWrapper>
  );
};

export default JsonTablePreview;
