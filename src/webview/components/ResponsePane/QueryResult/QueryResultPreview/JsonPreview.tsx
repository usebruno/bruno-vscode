import React from 'react';
import ReactJson from 'react-json-view';
import { useDispatch, useSelector } from 'react-redux';
import find from 'lodash/find';
import ErrorBanner from 'ui/ErrorBanner';
import { updateResponseJsonPreviewMode } from 'providers/ReduxStore/slices/tabs';
import JsonTablePreview from './JsonTablePreview';
import ModeToggle, { type JsonPreviewMode } from './JsonTablePreview/ModeToggle';

interface JsonPreviewProps {
  data?: unknown;
  displayedTheme?: string;
}

const JsonPreview = ({ data, displayedTheme }: any) => {
  const dispatch = useDispatch();
  const tabs = useSelector((state: any) => state.tabs.tabs);
  const activeTabUid = useSelector((state: any) => state.tabs.activeTabUid);
  const focusedTab = find(tabs, (t: any) => t.uid === activeTabUid);

  const mode: JsonPreviewMode = focusedTab?.responseJsonPreviewMode === 'table' ? 'table' : 'tree';

  const handleModeChange = (next: JsonPreviewMode) => {
    if (!focusedTab) return;
    dispatch(updateResponseJsonPreviewMode({ uid: focusedTab.uid, mode: next }));
  };

  const validateJsonData = (input: unknown): { data: unknown; error: string | null } => {
    if (typeof input === 'object' && input !== null) return { data: input, error: null };
    if (typeof input === 'string') {
      try {
        return { data: JSON.parse(input), error: null };
      } catch (e) {
        return { data: null, error: `Invalid JSON format: ${(e as Error).message}` };
      }
    }
    return { data: null, error: 'Invalid input. Expected a JSON object, array, or valid JSON string.' };
  };

  const jsonData = validateJsonData(data);

  if (jsonData.error) {
    return <ErrorBanner errors={[{ title: 'Cannot preview as JSON', message: jsonData.error }]} />;
  }

  if (jsonData.data === null || jsonData.data === undefined) {
    return <ErrorBanner errors={[{ title: 'Cannot preview as JSON', message: 'Data is null or undefined. Expected a valid JSON object or array.' }]} />;
  }

  if (typeof jsonData.data !== 'object') {
    return <ErrorBanner errors={[{ title: 'Cannot preview as JSON', message: 'Data cannot be rendered as a JSON tree. Expected a JSON object or array.' }]} />;
  }

  if (mode === 'table') {
    return (
      <JsonTablePreview
        data={jsonData.data}
        modeToggle={<ModeToggle mode="table" onChange={handleModeChange} />}
      />
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
        <ModeToggle mode="tree" onChange={handleModeChange} />
      </div>
      <ReactJson
        src={jsonData.data}
        theme={displayedTheme === 'light' ? 'rjv-default' : 'monokai'}
        collapsed={1}
        displayDataTypes={false}
        displayObjectSize={true}
        enableClipboard={true}
        name={false}
        style={{
          backgroundColor: 'transparent',
          fontSize: '12px',
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
          padding: '16px'
        }}
      />
    </div>
  );
};

export default JsonPreview;
