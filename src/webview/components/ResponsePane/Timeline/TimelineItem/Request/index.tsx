import React from 'react';
import Headers from '../Common/Headers/index';
import BodyBlock from '../Common/Body/index';

interface safeStringifyJSONIfNotStringProps {
  collection?: React.ReactNode;
  request?: unknown;
  item?: React.ReactNode;
}

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

const Request = ({
  collection,
  request,
  item
}: any) => {
  let { url, headers, data, dataBuffer, error } = request || {};
  if (!dataBuffer) {
    dataBuffer = Buffer.from(safeStringifyJSONIfNotString(data))?.toString('base64');
  }

  return (
    <div>
      <div className="mb-1 flex gap-2">
        <pre className="whitespace-pre-wrap" title={url}>{url}</pre>
      </div>

      <Headers headers={headers} type="request" />

      <BodyBlock collection={collection} data={data} dataBuffer={dataBuffer} error={error} headers={headers} item={item} type="request" />
    </div>
  );
};

export default Request;
