import React, { useState, useEffect } from 'react';
import find from 'lodash/find';
import classnames from 'classnames';
import { useDispatch, useSelector } from 'react-redux';
import { updateResponsePaneTab } from 'providers/ReduxStore/slices/tabs';
import Overlay from '../Overlay';
import Placeholder from '../Placeholder';
import GrpcResponseHeaders from './GrpcResponseHeaders';
import GrpcStatusCode from './GrpcStatusCode';
import ResponseTime from '../ResponseTime/index';
import ResponseClear from '../ResponseClear';
import StyledWrapper from './StyledWrapper';
import ResponseTrailers from './ResponseTrailers';
import GrpcQueryResult from './GrpcQueryResult';
import ResponseLayoutToggle from '../ResponseLayoutToggle';
import Tab from 'components/Tab';

interface GrpcResponsePaneProps {
  item?: React.ReactNode;
  collection?: React.ReactNode;
}


const GrpcResponsePane = ({
  item,
  collection
}: any) => {
  const dispatch = useDispatch();
  const tabs = useSelector((state) => state.tabs.tabs);
  const activeTabUid = useSelector((state) => state.tabs.activeTabUid);
  const isLoading = ['queued', 'sending'].includes(item.requestState);

  const selectTab = (tab: any) => {
    dispatch(
      updateResponsePaneTab({
        uid: item.uid,
        responsePaneTab: tab
      })
    );
  };

  const response = item.response || {};

  const getTabPanel = (tab: any) => {
    switch (tab) {
      case 'response': {
        return <GrpcQueryResult item={item} collection={collection} />;
      }
      case 'headers': {
        return <GrpcResponseHeaders metadata={response.metadata} />;
      }
      case 'trailers': {
        return <ResponseTrailers trailers={response.trailers} />;
      }
      default: {
        return <div>404 | Not found</div>;
      }
    }
  };

  if (isLoading && !item.response) {
    return (
      <StyledWrapper className="flex flex-col h-full relative">
        <Overlay item={item} collection={collection} />
      </StyledWrapper>
    );
  }

  if (!item.response) {
    return (
      <StyledWrapper className="flex h-full relative">
        <Placeholder />
      </StyledWrapper>
    );
  }

  if (!activeTabUid) {
    return <div>Something went wrong</div>;
  }

  const focusedTab = find(tabs, (t) => t.uid === activeTabUid);
  if (!focusedTab || !focusedTab.uid || !focusedTab.responsePaneTab) {
    return <div className="pb-4 px-4">An error occurred!</div>;
  }

  const tabConfig = [
    {
      name: 'response',
      label: 'Response',
      count: Array.isArray(response.responses) ? response.responses.length : 0
    },
    {
      name: 'headers',
      label: 'Metadata',
      count: Array.isArray(response.metadata) ? response.metadata.length : 0
    },
    {
      name: 'trailers',
      label: 'Trailers',
      count: Array.isArray(response.trailers) ? response.trailers.length : 0
    },
  ];

  return (
    <StyledWrapper className="flex flex-col h-full relative">
      <div className="flex flex-wrap items-center pl-3 pr-4 tabs" role="tablist" data-testid="grpc-response-tabs">
        {tabConfig.map((tab) => (
          <Tab
            key={tab.name}
            name={tab.name}
            label={tab.label}
            isActive={focusedTab.responsePaneTab === tab.name}
            onClick={selectTab}
            count={tab.count}
          />
        ))}
        {!isLoading ? (
          <div className="flex flex-grow justify-end items-center">
            {item?.response ? (
              <>
                <ResponseLayoutToggle />
                <ResponseClear item={item} collection={collection} />
                <GrpcStatusCode
                  status={response.statusCode}
                  text={response.statusText}
                  details={response.statusDescription}
                />
                <ResponseTime duration={response.duration} />
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      <section
        className="flex flex-col pl-3 pr-4 mt-4 min-h-0 min-w-0 overflow-hidden"
        style={{ flex: '1 1 0' }}
      >
        {isLoading ? <Overlay item={item} collection={collection} /> : null}
        <div className="flex-1 min-h-0 min-w-0 overflow-auto">
          {item?.response ? (
            <>{getTabPanel(focusedTab.responsePaneTab)}</>
          ) : null}
        </div>
      </section>
    </StyledWrapper>
  );
};

export default GrpcResponsePane;
