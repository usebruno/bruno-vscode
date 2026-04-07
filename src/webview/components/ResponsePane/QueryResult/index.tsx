import { debounce } from 'lodash';
import { useTheme } from 'providers/Theme/index';
import React, { useMemo, useState } from 'react';
import { formatResponse, getContentType } from 'utils/common';
import { getDefaultResponseFormat, detectContentTypeFromBase64 } from 'utils/response';
import LargeResponseWarning from '../LargeResponseWarning';
import QueryResultFilter from './QueryResultFilter';
import QueryResultPreview from './QueryResultPreview';
import StyledWrapper from './StyledWrapper';

// Raw format options (for byte format types)
const RAW_FORMAT_OPTIONS = [
  { id: 'raw', label: 'Raw', type: 'item', codeMirrorMode: 'text/plain' },
  { id: 'hex', label: 'Hex', type: 'item', codeMirrorMode: 'text/plain' },
  { id: 'base64', label: 'Base64', type: 'item', codeMirrorMode: 'text/plain' }
];

const PREVIEW_FORMAT_OPTIONS = [
  { id: 'json', label: 'JSON', type: 'item', codeMirrorMode: 'application/ld+json' },
  { id: 'html', label: 'HTML', type: 'item', codeMirrorMode: 'xml' },
  { id: 'xml', label: 'XML', type: 'item', codeMirrorMode: 'xml' },
  { id: 'javascript', label: 'JavaScript', type: 'item', codeMirrorMode: 'javascript' },
  { type: 'divider', id: 'divider-structured-raw' },
  ...RAW_FORMAT_OPTIONS
];

const formatErrorMessage = (error: any) => {
  if (!error) return 'Something went wrong';

  const remoteMethodError = 'Error invoking remote method \'send-http-request\':';

  if (error?.includes(remoteMethodError)) {
    const parts = error.split(remoteMethodError);
    return parts[1]?.trim() || error;
  }

  return error;
};

interface InitialResponseFormat {
  initialFormat: string | null;
  initialTab: string | null;
}

// Custom hook to determine the initial format and tab based on the data buffer and headers
export const useInitialResponseFormat = (dataBuffer: unknown, headers: unknown): InitialResponseFormat => {
  return useMemo(() => {
    const detectedContentType = detectContentTypeFromBase64(dataBuffer);
    const contentType = getContentType(headers as Record<string, string>);

    // Wait until both content types are available
    if (detectedContentType === null || contentType === undefined) {
      return { initialFormat: null, initialTab: null };
    }

    const initial = getDefaultResponseFormat(contentType);
    return { initialFormat: initial.format, initialTab: initial.tab };
  }, [dataBuffer, headers]);
};

interface FormatOption {
  id: string;
  label?: string;
  type: string;
  codeMirrorMode?: string;
}

// Custom hook to determine preview format options based on content type
export const useResponsePreviewFormatOptions = (dataBuffer: unknown, headers: unknown): FormatOption[] => {
  return useMemo(() => {
    const detectedContentType = detectContentTypeFromBase64(dataBuffer);
    const contentType = getContentType(headers as Record<string, string>);

    const byteFormatTypes = ['image', 'video', 'audio', 'pdf', 'zip'];

    const isByteFormatType = (contentType: any) => {
      return byteFormatTypes.some((type) => contentType.includes(type));
    };

    const getContentTypeToCheck = () => {
      if (detectedContentType) {
        return detectedContentType;
      }
      return contentType;
    };

    const contentTypeToCheck = getContentTypeToCheck();

    if (contentTypeToCheck && isByteFormatType(contentTypeToCheck)) {
      return RAW_FORMAT_OPTIONS;
    }

    return PREVIEW_FORMAT_OPTIONS;
  }, [dataBuffer, headers]);
};

const QueryResult = ({
  item,
  collection,
  data,
  dataBuffer,
  disableRunEventListener,
  headers,
  error,

  // one of the options in PREVIEW_FORMAT_OPTIONS
  selectedFormat,

  selectedTab
}: any) => {
  const contentType = getContentType(headers);
  const [filter, setFilter] = useState(null);
  const [showLargeResponse, setShowLargeResponse] = useState(false);
  const { displayedTheme } = useTheme();

  const responseSize = useMemo(() => {
    const response = item.response || {};
    if (typeof response.size === 'number') {
      return response.size;
    }

    // Fallback: estimate from base64 length (base64 is ~4/3 of original size)
    if (dataBuffer && typeof dataBuffer === 'string') {
      return Math.floor(dataBuffer.length * 0.75);
    }
    return 0;
  }, [dataBuffer, item.response]);

  const isLargeResponse = responseSize > 10 * 1024 * 1024; // 10 MB

  const detectedContentType = useMemo(() => {
    return detectContentTypeFromBase64(dataBuffer);
  }, [dataBuffer, isLargeResponse]);

  const formattedData = useMemo(
    () => {
      if (isLargeResponse && !showLargeResponse) {
        return '';
      }
      return formatResponse(data, dataBuffer, selectedFormat, filter);
    },
    [data, dataBuffer, selectedFormat, filter, isLargeResponse, showLargeResponse]
  );

  const debouncedResultFilterOnChange = debounce((e) => {
    setFilter(e.target.value);
  }, 250);

  const previewMode = useMemo(() => {
    // Derive preview mode based on selected format
    if (selectedFormat === 'html') return 'preview-web';
    if (selectedFormat === 'json') return 'preview-json';
    if (selectedFormat === 'xml') return 'preview-xml';
    if (selectedFormat === 'raw') return 'preview-text';
    if (selectedFormat === 'javascript') return 'preview-web';

    // For base64/hex, check content type to determine binary preview type
    if (selectedFormat === 'base64' || selectedFormat === 'hex') {
      if (detectedContentType) {
        if (detectedContentType.includes('image')) return 'preview-image';
        if (detectedContentType.includes('pdf')) return 'preview-pdf';
        if (detectedContentType.includes('audio')) return 'preview-audio';
        if (detectedContentType.includes('video')) return 'preview-video';
      }
      // for all other content types, return preview-text
      return 'preview-text';
    }
    return 'preview-text';
  }, [selectedFormat, detectedContentType]);

  const codeMirrorMode = useMemo(() => {
    const option = PREVIEW_FORMAT_OPTIONS
      .filter((opt): opt is FormatOption & { codeMirrorMode: string } => (opt.type === 'item' || !opt.type) && 'codeMirrorMode' in opt)
      .find((opt) => opt.id === selectedFormat);
    return option?.codeMirrorMode || 'text/plain';
  }, [selectedFormat]);

  const queryFilterEnabled = useMemo(() => codeMirrorMode.includes('json') && selectedFormat === 'json' && selectedTab === 'editor', [codeMirrorMode, selectedFormat, selectedTab]);
  const hasScriptError = item.preRequestScriptErrorMessage || item.postResponseScriptErrorMessage;

  return (
    <StyledWrapper
      className="w-full h-full relative flex"
      queryFilterEnabled={queryFilterEnabled}
    >
      {error ? (
        <div>
          {hasScriptError ? null : (
            <div className="error" style={{ whiteSpace: 'pre-line' }}>{formatErrorMessage(error)}</div>
          )}

          {error && typeof error === 'string' && error.toLowerCase().includes('self signed certificate') ? (
            <div className="mt-6 muted text-xs">
              You can disable SSL verification in the Preferences. <br />
              To open the Preferences, click on the gear icon in the bottom left corner.
            </div>
          ) : null}
        </div>
      ) : isLargeResponse && !showLargeResponse ? (
        <LargeResponseWarning
          item={item}
          responseSize={responseSize}
          onRevealResponse={() => setShowLargeResponse(true)}
        />
      ) : (
        <div className="h-full flex flex-col">
          <div className="flex-1 relative">
            <div className="absolute top-0 left-0 h-full w-full" data-testid="response-preview-container">
              <QueryResultPreview
                selectedTab={selectedTab}
                data={data}
                dataBuffer={dataBuffer}
                formattedData={formattedData}
                item={item}
                contentType={contentType}
                previewMode={previewMode}
                codeMirrorMode={codeMirrorMode}
                collection={collection}
                disableRunEventListener={disableRunEventListener}
                displayedTheme={displayedTheme}
              />
            </div>
            {queryFilterEnabled && (
              <QueryResultFilter filter={filter} onChange={debouncedResultFilterOnChange} mode={codeMirrorMode} />
            )}
          </div>
        </div>
      )}
    </StyledWrapper>
  );
};

export default QueryResult;
