import React from 'react';
import { useTheme } from 'providers/Theme';
import { formatSize } from 'utils/common/index';
import BodyBlock from '../Common/Body/index';
import Headers from '../Common/Headers/index';
import { getStatusColor, toNumericStatus } from '../Common/Status/index';

const safeStringifyJSONIfNotString = (obj: any) => {
  if (obj === null || obj === undefined) return '';

  if (typeof obj === 'string') {
    return obj;
  }

  try {
    return JSON.stringify(obj);
  } catch (e) {
    return '[Unserializable Object]';
  }
};

const ResponseMeta = ({
  code,
  statusText,
  duration,
  size
}: any) => {
  const { theme } = useTheme();
  const sizeLabel = typeof size === 'number' ? formatSize(size) : null;
  const hasCode = code != null;
  const hasAny = hasCode || statusText || (typeof duration === 'number') || sizeLabel;
  if (!hasAny) return null;
  return (
    <div className="tl-response-meta">
      {(hasCode || statusText) && (
        <span className="tl-response-meta-status" style={{ color: getStatusColor(theme, code) }}>
          {code} {statusText || ''}
        </span>
      )}
      {typeof duration === 'number' && (
        <span className="tl-response-meta-item">{Math.round(duration)}ms</span>
      )}
      {sizeLabel && <span className="tl-response-meta-item">{sizeLabel}</span>}
    </div>
  );
};

const Response = ({
  collection,
  response,
  item
}: any) => {
  let { status, statusCode, statusText, dataBuffer, headers, data, error, duration, size } = response || {};
  if (!dataBuffer) {
    dataBuffer = Buffer.from(safeStringifyJSONIfNotString(data))?.toString('base64');
  }

  return (
    <>
      <ResponseMeta
        code={toNumericStatus(statusCode) ?? toNumericStatus(status)}
        statusText={statusText}
        duration={duration}
        size={size}
      />
      <Headers headers={headers} />
      <BodyBlock
        collection={collection}
        data={data}
        dataBuffer={dataBuffer}
        error={error}
        headers={headers}
        item={item}
        type="response"
      />
    </>
  );
};

export default Response;
