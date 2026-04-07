import QueryResponse from 'components/ResponsePane/QueryResponse/index';
import { useState } from 'react';

interface BodyBlockProps {
  collection?: React.ReactNode;
  data?: unknown[];
  dataBuffer?: unknown[];
  headers?: React.ReactNode;
  error?: React.ReactNode;
  item?: React.ReactNode;
  type?: unknown;
}


const BodyBlock = ({
  collection,
  data,
  dataBuffer,
  headers,
  error,
  item,
  type
}: any) => {
  const [isBodyCollapsed, toggleBody] = useState(true);
  return (
    <div className="collapsible-section">
      <div className="section-header" onClick={() => toggleBody(!isBodyCollapsed)}>
        <pre className="flex flex-row items-center">
          <div className="opacity-70">{isBodyCollapsed ? '▼' : '▶'}</div> Body
        </pre>
      </div>
      {isBodyCollapsed && (
        <div className="mt-2">
          {data || dataBuffer ? (
            <div className="h-96 overflow-auto">
              <QueryResponse
                item={item}
                collection={collection}
                data={data}
                dataBuffer={dataBuffer}
                headers={headers}
                error={error}
                key={item?.uid}
                hideResultTypeSelector={type === 'request'}
              />
            </div>
          ) : (
            <div className="timeline-item-timestamp">No Body found</div>
          )}
        </div>
      )}
    </div>
  );
};

export default BodyBlock;
