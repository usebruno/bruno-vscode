import React, { useMemo, useState } from 'react';
import StyledWrapper from './StyledWrapper';
import TimelineItem from './TimelineItem/index';
import GrpcTimelineItem from './GrpcTimelineItem/index';
import { useTimelineEntries } from '../timeline-utils';
import { countByKind, getEntryKind } from './buildEntries';
import { FILTER_CHIPS } from './entryMeta';

const Timeline = ({
  collection,
  item
}: any) => {
  const [selectedFilter, setSelectedFilter] = useState('all');
  const isGrpcRequest = item.type === 'grpc-request' || item.type === 'ws-request';
  const entries = useTimelineEntries(collection, item);
  const counts = useMemo(() => countByKind(entries), [entries]);

  const visibleChips = FILTER_CHIPS.filter((chip) => chip.id === 'all' || counts[chip.id] > 0);
  const showFilterBar = entries.length > 0 && counts.oauth > 0;
  // Clearing the timeline can retire the selected kind, so fall back rather than render nothing.
  const activeFilter = visibleChips.some((chip) => chip.id === selectedFilter) ? selectedFilter : 'all';

  return (
    <StyledWrapper className="pb-4 w-full flex flex-grow flex-col">
      {showFilterBar && (
        <div className="timeline-filter-bar" data-testid="timeline-filter-bar">
          {visibleChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`timeline-chip ${activeFilter === chip.id ? 'is-active' : ''}`}
              onClick={() => setSelectedFilter(chip.id)}
              data-testid={`timeline-chip-${chip.id}`}
            >
              {chip.label}
              <span className="timeline-chip-count" data-testid={`timeline-chip-count-${chip.id}`}>{counts[chip.id] ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      <div className="timeline-container" data-testid="timeline-container">
        {entries.map((entry) => {
          if (activeFilter !== 'all' && activeFilter !== getEntryKind(entry)) return null;

          // Newest-first: an index key would let a new row inherit the top row's expand state.
          // OAuth2 rows share their parent's id, so the timestamp separates them.
          const key = `${entry.id ?? `${entry.type}-${entry.itemUid}`}-${entry.timestamp}-${entry.eventType ?? ''}`;

          if (entry.type === 'request') {
            const { data, timestamp, eventType } = entry;
            const { request, response, eventData = {}, timestamp: eventTimestamp = timestamp } = data as any;

            if (isGrpcRequest) {
              return (
                <div key={key} className="timeline-event" data-testid={`timeline-event-${key}`}>
                  <GrpcTimelineItem
                    timestamp={eventTimestamp}
                    request={request}
                    response={response}
                    eventType={eventType}
                    eventData={eventData}
                    item={item}
                    collection={collection}
                  />
                </div>
              );
            }

            return (
              <div key={key} className="timeline-event" data-testid={`timeline-event-${key}`}>
                <TimelineItem
                  timestamp={timestamp}
                  request={request}
                  response={response}
                  item={item}
                  collection={collection}
                />
              </div>
            );
          }

          if (entry.type === 'oauth2' && entry._oauth2Child) {
            return (
              <div key={key} className="timeline-event" data-testid={`timeline-event-${key}`}>
                <TimelineItem
                  timestamp={entry.timestamp}
                  request={entry._oauth2Child.request}
                  response={entry._oauth2Child.response}
                  item={item}
                  collection={collection}
                  isOauth2={true}
                />
              </div>
            );
          }

          return null;
        })}
      </div>
    </StyledWrapper>
  );
};

export default Timeline;
