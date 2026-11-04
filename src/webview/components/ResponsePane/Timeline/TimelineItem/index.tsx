import React, { useEffect, useState } from 'react';
import { IconChevronDown, IconChevronRight } from '@tabler/icons';
import Network from './Network/index';
import Request from './Request/index';
import Response from './Response/index';
import Method from './Common/Method/index';
import Status, { toNumericStatus } from './Common/Status/index';
import { RelativeTime } from './Common/Time/index';
import StyledWrapper from './StyledWrapper';
import { getBadge } from '../entryMeta';
import { getRequestHeaders } from 'utils/timeline';

const TimelineItem = ({
  timestamp,
  request,
  response,
  item,
  collection,
  isOauth2,
  hideTimestamp = false
}: any) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('request');
  // CodeMirror reads its size on mount and stays blank if hidden. Lazy-mount
  // each tab on first visit and keep it mounted, toggling display only.
  const [visitedTabs, setVisitedTabs] = useState<Record<string, boolean>>({ request: true });
  const toggleExpand = () => setIsExpanded((prev) => !prev);
  const handleRowKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      toggleExpand();
    }
  };

  useEffect(() => {
    if (isExpanded) setVisitedTabs({ [activeTab]: true });
  }, [isExpanded]);

  const handleTabClick = (id: string) => {
    setActiveTab(id);
    setVisitedTabs((v) => (v[id] ? v : { ...v, [id]: true }));
  };

  const { method, url = '' } = request || {};
  // A request that never reached the server reports `status: 0` (HTTP) or `'-'` (OAuth2 token call)
  // and carries the error code in `statusText`.
  const { status, statusCode, statusText } = response || {};
  const code = toNumericStatus(statusCode) ?? toNumericStatus(status) ?? statusText;
  const showNetworkLogs = response?.timeline?.length > 0;
  const badge = getBadge(isOauth2);

  const tabs = [
    { id: 'request', label: 'Request' },
    { id: 'response', label: 'Response' },
    ...(showNetworkLogs ? [{ id: 'network', label: 'Network' }] : [])
  ];

  return (
    <StyledWrapper>
      <div className="tl-row-wrap" data-testid="timeline-entry">
        <div
          className={`tl-row ${isExpanded ? 'is-expanded' : ''}`}
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          onClick={toggleExpand}
          onKeyDown={handleRowKeyDown}
          data-testid="timeline-item-header"
        >
          <div className="tl-col-chev">
            {isExpanded ? <IconChevronDown size={14} strokeWidth={2} /> : <IconChevronRight size={14} strokeWidth={2} />}
          </div>
          <div className="tl-col-status">
            <Status statusCode={code} />
          </div>
          <div className="tl-col-method">
            <Method method={method} />
          </div>
          <div className="tl-col-url" title={url} data-testid="timeline-url">{url}</div>
          <div className="tl-col-badge">
            <span className={badge.badgeClass} data-testid={`timeline-badge-${badge.kind}`}>{badge.badgeLabel}</span>
          </div>
          {!hideTimestamp && (
            <div className="tl-col-time">
              <RelativeTime timestamp={timestamp} />
            </div>
          )}
        </div>

        {isExpanded && (
          <div className="tl-detail" data-testid="timeline-detail">
            <div className="tl-header">
              <div className="tl-header-url" title={`${method || ''} ${url}`}>
                <span className="tl-header-url-method">{method}</span>
                <span className="tl-header-url-text">{url}</span>
              </div>
            </div>

            <div className="tl-tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`tl-tab ${activeTab === tab.id ? 'is-active' : ''}`}
                  onClick={() => handleTabClick(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="tl-panel">
              {visitedTabs.request && (
                <div style={{ display: activeTab === 'request' ? 'block' : 'none' }} data-testid="timeline-panel-request">
                  <Request request={request} item={item} collection={collection} headers={getRequestHeaders(response?.timeline)} />
                </div>
              )}
              {visitedTabs.response && (
                <div style={{ display: activeTab === 'response' ? 'block' : 'none' }} data-testid="timeline-panel-response">
                  <Response response={response} item={item} collection={collection} />
                </div>
              )}
              {showNetworkLogs && visitedTabs.network && (
                <div style={{ display: activeTab === 'network' ? 'block' : 'none' }} data-testid="timeline-panel-network">
                  <Network logs={response?.timeline} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </StyledWrapper>
  );
};

export default TimelineItem;
