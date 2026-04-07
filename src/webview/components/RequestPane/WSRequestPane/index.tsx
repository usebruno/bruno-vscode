import classnames from 'classnames';
import Documentation from 'components/Documentation/index';
import RequestHeaders from 'components/RequestPane/RequestHeaders';
import StatusDot from 'components/StatusDot/index';
import { find } from 'lodash';
import { updateRequestPaneTab } from 'providers/ReduxStore/slices/tabs';
import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import HeightBoundContainer from 'ui/HeightBoundContainer';
import { getPropertyFromDraftOrRequest } from 'utils/collections/index';
import WsBody from '../WsBody/index';
import StyledWrapper from './StyledWrapper';
import WSAuth from './WSAuth';
import WSSettingsPane from '../WSSettingsPane/index';

interface WSRequestPaneProps {
  item?: React.ReactNode;
  collection?: React.ReactNode;
  handleRun?: (...args: unknown[]) => void;
}


const WSRequestPane = ({
  item,
  collection,
  handleRun
}: any) => {
  const dispatch = useDispatch();
  const tabs = useSelector((state) => state.tabs.tabs);
  const activeTabUid = useSelector((state) => state.tabs.activeTabUid);

  const selectTab = (tab: any) => {
    dispatch(updateRequestPaneTab({
      uid: item.uid,
      requestPaneTab: tab
    }));
  };

  const focusedTab = find(tabs, (t) => t.uid === activeTabUid);

  // useEffect must be called before any early returns (React rules of hooks)
  useEffect(() => {
    if (!focusedTab?.requestPaneTab) {
      selectTab('body');
    }
  }, []);

  const getTabPanel = (tab: any) => {
    switch (tab) {
      case 'body': {
        return (
          <WsBody
            item={item}
            collection={collection}
            hideModeSelector={true}
            hidePrettifyButton={true}
            handleRun={handleRun}
          />
        );
      }
      case 'headers': {
        return <RequestHeaders item={item} collection={collection} addHeaderText="Add Headers" />;
      }
      case 'settings': {
        return <WSSettingsPane item={item} collection={collection} />;
      }
      case 'auth': {
        return <WSAuth item={item} collection={collection} />;
      }
      case 'docs': {
        return <Documentation item={item} collection={collection} />;
      }
      default: {
        return <div className="mt-4">404 | Not found</div>;
      }
    }
  };

  if (!activeTabUid) {
    return <div>Something went wrong</div>;
  }

  if (!focusedTab || !focusedTab.uid || !focusedTab.requestPaneTab) {
    return <div className="pb-4 px-4">An error occurred!</div>;
  }

  const getTabClassname = (tabName: any) => {
    return classnames(`tab select-none ${tabName}`, {
      active: tabName === focusedTab.requestPaneTab
    });
  };

  const headers = getPropertyFromDraftOrRequest(item, 'request.headers');
  const docs = getPropertyFromDraftOrRequest(item, 'request.docs');
  const auth = getPropertyFromDraftOrRequest(item, 'request.auth');

  const activeHeadersLength = headers.filter((header: any) => header.enabled).length;

  return (
    <StyledWrapper className="flex flex-col h-full relative">
      <div className="flex flex-wrap items-center tabs" role="tablist">
        <div className={getTabClassname('body')} role="tab" onClick={() => selectTab('body')}>
          Message
        </div>
        <div className={getTabClassname('headers')} role="tab" onClick={() => selectTab('headers')}>
          Headers
          {activeHeadersLength > 0 && <sup className="ml-[.125rem] font-medium">{activeHeadersLength}</sup>}
        </div>
        <div className={getTabClassname('auth')} role="tab" onClick={() => selectTab('auth')}>
          Auth
          {auth.mode !== 'none' && <StatusDot type="default" />}
        </div>
        <div className={getTabClassname('settings')} role="tab" onClick={() => selectTab('settings')}>
          Settings
        </div>
        <div className={getTabClassname('docs')} role="tab" onClick={() => selectTab('docs')}>
          Docs
          {docs && docs.length > 0 && <StatusDot type="default" />}
        </div>
      </div>
      <section
        className={classnames('flex w-full flex-1 h-full mt-4')}
      >
        <HeightBoundContainer>{getTabPanel(focusedTab.requestPaneTab)}</HeightBoundContainer>
      </section>
    </StyledWrapper>
  );
};

export default WSRequestPane;
