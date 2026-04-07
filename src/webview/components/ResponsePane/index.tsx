import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import find from 'lodash/find';
import { useDispatch, useSelector } from 'react-redux';
import { updateResponsePaneTab, updateResponseFormat, updateResponseViewTab } from 'providers/ReduxStore/slices/tabs';
import QueryResult from './QueryResult';
import Overlay from './Overlay';
import Placeholder from './Placeholder';
import ResponseHeaders from './ResponseHeaders';
import StatusCode from './StatusCode';
import ResponseTime from './ResponseTime';
import ResponseSize from './ResponseSize';
import TestResults from './TestResults';
import TestResultsLabel from './TestResultsLabel';
import ScriptError from './ScriptError';
import ScriptErrorIcon from './ScriptErrorIcon';
import StyledWrapper from './StyledWrapper';
import ResponsePaneActions from './ResponsePaneActions';
import QueryResultTypeSelector from './QueryResult/QueryResultTypeSelector/index';
import { useInitialResponseFormat, useResponsePreviewFormatOptions } from './QueryResult/index';
import SkippedRequest from './SkippedRequest';
import HeightBoundContainer from 'ui/HeightBoundContainer';
import ResponseStopWatch from 'components/ResponsePane/ResponseStopWatch';
import WSMessagesList from './WsResponsePane/WSMessagesList';
import ResponsiveTabs from 'ui/ResponsiveTabs';

interface RIGHT_CONTENT_EXPANDED_WIDTHProps {
  item?: React.ReactNode;
  collection?: React.ReactNode;
}

// Width threshold for expanded right-side action buttons
const RIGHT_CONTENT_EXPANDED_WIDTH = 135;

const ResponsePane = ({
  item,
  collection
}: any) => {
  const dispatch = useDispatch();
  const tabs = useSelector((state) => state.tabs.tabs);
  const activeTabUid = useSelector((state) => state.tabs.activeTabUid);
  const isLoading = ['queued', 'sending'].includes(item.requestState);
  const [showScriptErrorCard, setShowScriptErrorCard] = useState(false);
  const rightContentRef = useRef(null);

  const response = item.response || {};

  const focusedTab = find(tabs, (t) => t.uid === activeTabUid);

  const { initialFormat, initialTab } = useInitialResponseFormat(response?.dataBuffer, response?.headers);
  const previewFormatOptions = useResponsePreviewFormatOptions(response?.dataBuffer, response?.headers);

  const persistedFormat = focusedTab?.responseFormat;
  const persistedViewTab = focusedTab?.responseViewTab;

  // Use persisted values from Redux, falling back to initial values or defaults
  const selectedFormat = persistedFormat ?? initialFormat ?? 'raw';
  const selectedViewTab = persistedViewTab ?? initialTab ?? 'editor';

  useEffect(() => {
    if (!focusedTab || initialFormat === null || initialTab === null) {
      return;
    }
    if (persistedFormat === null) {
      dispatch(updateResponseFormat({ uid: item.uid, responseFormat: initialFormat }));
    }
    if (persistedViewTab === null) {
      dispatch(updateResponseViewTab({ uid: item.uid, responseViewTab: initialTab }));
    }
  }, [initialFormat, initialTab, persistedFormat, persistedViewTab, focusedTab, item.uid, dispatch]);

  const handleFormatChange = useCallback((newFormat: any) => {
    dispatch(updateResponseFormat({ uid: item.uid, responseFormat: newFormat }));
  }, [dispatch, item.uid]);

  const handleViewTabChange = useCallback((newViewTab: any) => {
    dispatch(updateResponseViewTab({ uid: item.uid, responseViewTab: newViewTab }));
  }, [dispatch, item.uid]);

  useEffect(() => {
    if (item?.preRequestScriptErrorMessage || item?.postResponseScriptErrorMessage || item?.testScriptErrorMessage) {
      setShowScriptErrorCard(true);
    }
  }, [item?.preRequestScriptErrorMessage, item?.postResponseScriptErrorMessage, item?.testScriptErrorMessage]);

  const selectTab = (tab: any) => {
    dispatch(
      updateResponsePaneTab({
        uid: item.uid,
        responsePaneTab: tab
      })
    );
  };
  const responseSize = useMemo(() => {
    if (typeof response.size === 'number') {
      return response.size;
    }

    if (!response.dataBuffer) return 0;

    try {
      // dataBuffer is base64 encoded, so we need to calculate the actual size
      const buffer = Buffer.from(response.dataBuffer, 'base64');
      return buffer.length;
    } catch (error) {
      return 0;
    }
  }, [response.size, response.dataBuffer]);
  const responseHeadersCount = typeof response.headers === 'object' ? Object.entries(response.headers).length : 0;

  const hasScriptError = item?.preRequestScriptErrorMessage || item?.postResponseScriptErrorMessage || item?.testScriptErrorMessage;

  const allTabs = useMemo((): Array<{ key: string; label: React.ReactNode; indicator: React.ReactNode }> => {
    return [
      {
        key: 'response',
        label: 'Response',
        indicator: null
      },
      {
        key: 'headers',
        label: 'Headers',
        indicator: responseHeadersCount > 0 ? <sup className="ml-1 font-medium">{responseHeadersCount}</sup> : null
      },
      {
        key: 'tests',
        label: (
          <TestResultsLabel
            results={item.testResults}
            assertionResults={item.assertionResults}
            preRequestTestResults={item.preRequestTestResults}
            postResponseTestResults={item.postResponseTestResults}
          />
        ),
        indicator: null
      }
    ];
  }, [responseHeadersCount, item.testResults, item.assertionResults, item.preRequestTestResults, item.postResponseTestResults]);

  const getTabPanel = (tab: any) => {
    switch (tab) {
      case 'response': {
        const isStream = item.response?.stream ?? false;
        if (isStream) {
          return <WSMessagesList messages={item.response.data} />;
        }
        return (
          <QueryResult
            item={item}
            collection={collection}
            data={response.data}
            dataBuffer={response.dataBuffer}
            headers={response.headers}
            error={response.error}
            key={item.filename}
            selectedFormat={selectedFormat}
            selectedTab={selectedViewTab}
          />
        );
      }
      case 'headers': {
        return <ResponseHeaders headers={response.headers} />;
      }
      case 'tests': {
        return (
          <TestResults
            results={item.testResults}
            assertionResults={item.assertionResults}
            preRequestTestResults={item.preRequestTestResults}
            postResponseTestResults={item.postResponseTestResults}
          />
        );
      }

      default: {
        return <div>404 | Not found</div>;
      }
    }
  };

  if (item.response && item.status === 'skipped') {
    return (
      <StyledWrapper className="flex h-full relative">
        <SkippedRequest />
      </StyledWrapper>
    );
  }

  if (isLoading && !item.response) {
    return (
      <StyledWrapper className="flex flex-col h-full relative">
        <Overlay item={item} collection={collection} />
      </StyledWrapper>
    );
  }

  if (!item.response) {
    return (
      <HeightBoundContainer>
        <Placeholder />
      </HeightBoundContainer>
    );
  }

  if (!activeTabUid) {
    return <div>Something went wrong</div>;
  }

  if (!focusedTab || !focusedTab.uid || !focusedTab.responsePaneTab) {
    return <div className="pb-4 px-4">An error occurred!</div>;
  }

  const rightContent = !isLoading ? (
    <div ref={rightContentRef} className="flex justify-end items-center right-side-container gap-3">
      {hasScriptError && !showScriptErrorCard && (
        <ScriptErrorIcon
          itemUid={item.uid}
          onClick={() => setShowScriptErrorCard(true)}
        />
      )}
      {focusedTab?.responsePaneTab === 'response' && item?.response ? (
        <>
          {/* Result View Tabs (Visualizations + Response Format) */}
          <div className="result-view-tabs">

            <QueryResultTypeSelector
              formatOptions={previewFormatOptions}
              formatValue={selectedFormat}
              onFormatChange={handleFormatChange}
              onPreviewTabSelect={handleViewTabChange}
              selectedTab={selectedViewTab}
              isActiveTab={selectedViewTab === 'editor' || selectedViewTab === 'preview'}
              onTabSelect={() => {
                handleViewTabChange('editor');
              }}
            />
          </div>
        </>
      ) : null}
      <div className="flex items-center response-pane-status">
        <StatusCode status={response.status} isStreaming={item.response?.stream?.running} />
        {item.response?.stream?.running
          ? <ResponseStopWatch startMillis={response.duration} />
          : <ResponseTime duration={response.duration} />}
        <ResponseSize size={responseSize} />
      </div>

      <div className="flex items-center response-pane-actions">
        {item?.response && !item?.response?.error ? (
          <ResponsePaneActions
            item={item}
            collection={collection}
            responseSize={responseSize}
            selectedFormat={selectedFormat}
            selectedTab={selectedViewTab}
            data={response.data}
            dataBuffer={response.dataBuffer}
          />
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <StyledWrapper className="flex flex-col h-full relative">
      <div className="px-4">
        <ResponsiveTabs
          tabs={allTabs}
          activeTab={focusedTab.responsePaneTab}
          onTabSelect={selectTab}
          rightContent={rightContent}
          rightContentRef={rightContentRef}
          rightContentExpandedWidth={RIGHT_CONTENT_EXPANDED_WIDTH}
        />
      </div>
      <section
        className="flex flex-col min-h-0 min-w-0 relative px-4 overflow-hidden mt-4"
        style={{
          flex: '1 1 0'
        }}
      >
        {isLoading ? <Overlay item={item} collection={collection} /> : null}
        {hasScriptError && showScriptErrorCard && (
          <ScriptError
            item={item}
            onClose={() => setShowScriptErrorCard(false)}
          />
        )}
        <div className="flex-1 min-h-0 min-w-0 overflow-auto">
          {item?.response ? (
            <>{getTabPanel(focusedTab.responsePaneTab)}</>
          ) : null}
        </div>
      </section>
    </StyledWrapper>
  );
};

export default ResponsePane;
