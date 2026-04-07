import React, { useRef, useMemo, useCallback } from 'react';
import classnames from 'classnames';
import { useSelector, useDispatch } from 'react-redux';
import { find, get } from 'lodash';
import { updateRequestPaneTab } from 'providers/ReduxStore/slices/tabs';
import QueryParams from 'components/RequestPane/QueryParams';
import RequestHeaders from 'components/RequestPane/RequestHeaders';
import RequestBody from 'components/RequestPane/RequestBody';
import RequestBodyMode from 'components/RequestPane/RequestBody/RequestBodyMode';
import Auth from 'components/RequestPane/Auth';
import Vars from 'components/RequestPane/Vars';
import Assertions from 'components/RequestPane/Assertions';
import Script from 'components/RequestPane/Script';
import Tests from 'components/RequestPane/Tests';
import Settings from 'components/RequestPane/Settings';
import Documentation from 'components/Documentation/index';
import StatusDot from 'components/StatusDot';
import ResponsiveTabs from 'ui/ResponsiveTabs';
import HeightBoundContainer from 'ui/HeightBoundContainer';
import AuthMode from '../Auth/AuthMode/index';

interface TAB_CONFIGProps {
  item?: React.ReactNode;
  collection?: React.ReactNode;
}


const TAB_CONFIG = [
  { key: 'params', label: 'Params' },
  { key: 'body', label: 'Body' },
  { key: 'headers', label: 'Headers' },
  { key: 'auth', label: 'Auth' },
  { key: 'vars', label: 'Vars' },
  { key: 'script', label: 'Script' },
  { key: 'assert', label: 'Assert' },
  { key: 'tests', label: 'Tests' },
  { key: 'docs', label: 'Docs' },
  { key: 'settings', label: 'Settings' }
];

const TAB_PANELS: Record<string, React.ComponentType<any>> = {
  params: QueryParams,
  body: RequestBody,
  headers: RequestHeaders,
  auth: Auth,
  vars: Vars,
  assert: Assertions,
  script: Script,
  tests: Tests,
  docs: Documentation,
  settings: Settings
};

const HttpRequestPane = ({
  item,
  collection
}: any) => {
  const dispatch = useDispatch();
  const tabs = useSelector((state) => state.tabs.tabs);
  const activeTabUid = useSelector((state) => state.tabs.activeTabUid);

  const rightContentRef = useRef(null);

  const focusedTab = find(tabs, (t) => t.uid === activeTabUid);
  const requestPaneTab = focusedTab?.requestPaneTab;

  // Get draft or original values - compute directly to ensure proper reactivity
  const draftOrOriginal = item.draft || item;
  const params = get(draftOrOriginal, 'request.params', []);
  const body = get(draftOrOriginal, 'request.body', {});
  const headers = get(draftOrOriginal, 'request.headers', []);
  const script = get(draftOrOriginal, 'request.script', {});
  const assertions = get(draftOrOriginal, 'request.assertions', []);
  const tests = get(draftOrOriginal, 'request.tests', '');
  const docs = get(draftOrOriginal, 'request.docs', '');
  const requestVars = get(draftOrOriginal, 'request.vars.req', []);
  const responseVars = get(draftOrOriginal, 'request.vars.res', []);
  const auth = get(draftOrOriginal, 'request.auth', {});
  const tags = get(draftOrOriginal, 'tags', []);

  const activeCounts = useMemo(() => ({
    params: params.filter((p: any) => p.enabled).length,
    headers: headers.filter((h: any) => h.enabled).length,
    assertions: assertions.filter((a: any) => a.enabled).length,
    vars: requestVars.filter((r: any) => r.enabled).length + responseVars.filter((r: any) => r.enabled).length
  }), [params, headers, assertions, requestVars, responseVars]);

  const selectTab = useCallback(
    (tabKey: any) => {
      dispatch(updateRequestPaneTab({ uid: item.uid, requestPaneTab: tabKey }));
    },
    [dispatch, item.uid]
  );

  const indicators: Record<string, React.ReactNode> = useMemo(() => {
    const hasScriptError = item.preRequestScriptErrorMessage || item.postResponseScriptErrorMessage;
    const hasTestError = item.testScriptErrorMessage;

    return {
      params: activeCounts.params > 0 ? <sup className="font-medium">{activeCounts.params}</sup> : null,
      body: body.mode !== 'none' ? <StatusDot /> : null,
      headers: activeCounts.headers > 0 ? <sup className="font-medium">{activeCounts.headers}</sup> : null,
      auth: auth.mode !== 'none' ? <StatusDot /> : null,
      vars: activeCounts.vars > 0 ? <sup className="font-medium">{activeCounts.vars}</sup> : null,
      script: (script.req || script.res) ? (hasScriptError ? <StatusDot type="error" /> : <StatusDot />) : null,
      assert: activeCounts.assertions > 0 ? <sup className="font-medium">{activeCounts.assertions}</sup> : null,
      tests: tests?.length > 0 ? (hasTestError ? <StatusDot type="error" /> : <StatusDot />) : null,
      docs: docs?.length > 0 ? <StatusDot /> : null,
      settings: tags?.length > 0 ? <StatusDot /> : null
    };
  }, [activeCounts, body.mode, auth.mode, script, item.preRequestScriptErrorMessage, item.postResponseScriptErrorMessage, item.testScriptErrorMessage, tests, docs, tags]);

  const allTabs = useMemo(
    () => TAB_CONFIG.map(({ key, label }) => ({ key, label, indicator: indicators[key] })),
    [indicators]
  );

  const tabPanel = useMemo(() => {
    const Component = TAB_PANELS[requestPaneTab];
    return Component ? <Component item={item} collection={collection} /> : <div className="mt-4">404 | Not found</div>;
  }, [requestPaneTab, item, collection]);

  if (!activeTabUid || !focusedTab?.uid || !requestPaneTab) {
    return <div className="pb-4 px-4">An error occurred!</div>;
  }

  const rightContent = requestPaneTab === 'body' ? (
    <div ref={rightContentRef}>
      <RequestBodyMode item={item} collection={collection} />
    </div>
  ) : requestPaneTab === 'auth' ? (
    <div ref={rightContentRef} className="flex flex-grow justify-start items-center">
      <AuthMode item={item} collection={collection} />
    </div>
  ) : null;

  return (
    <div className="flex flex-col h-full relative">
      <ResponsiveTabs
        tabs={allTabs}
        activeTab={requestPaneTab}
        onTabSelect={selectTab}
        rightContent={rightContent}
        rightContentRef={rightContent ? rightContentRef : null}
        delayedTabs={['body']}
      />

      <section className={classnames('flex w-full flex-1 mt-4')}>
        <HeightBoundContainer>{tabPanel}</HeightBoundContainer>
      </section>
    </div>
  );
};

export default HttpRequestPane;
