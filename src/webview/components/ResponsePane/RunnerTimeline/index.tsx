import React, { useMemo } from 'react';
import TimelineItem from '../Timeline/TimelineItem';

const RunnerTimeline = ({
  request = {},
  response = {},
  item,
  collection
}: any) => {
  const oauth2Calls = useMemo(
    () =>
      (collection?.timeline || [])
        .filter((event: any) => event.type === 'oauth2' && event.itemUid === item.uid)
        .flatMap((event: any) => event.data?.debugInfo || []),
    [collection?.timeline, item.uid]
  );

  return (
    <div className="pb-4 w-full">
      <TimelineItem
        request={request}
        response={response}
        item={item}
        collection={collection}
        hideTimestamp={true}
      />

      {oauth2Calls.map((call: any, index: number) => (
        <TimelineItem
          key={index}
          request={call?.request}
          response={call?.response}
          item={item}
          collection={collection}
          isOauth2={true}
          hideTimestamp={true}
        />
      ))}
    </div>
  );
};

export default RunnerTimeline;
