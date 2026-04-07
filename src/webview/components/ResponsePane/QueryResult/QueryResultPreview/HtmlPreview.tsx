import React, { useRef, useState, useEffect } from 'react';
import { isValidHtml } from 'utils/common/index';
import { escapeHtml, isValidHtmlSnippet } from 'utils/response/index';

interface HtmlPreviewProps {
  data: string;
  baseUrl: string;
}

const HtmlPreview: React.FC<HtmlPreviewProps> = React.memo(({ data, baseUrl }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const checkDragging = () => {
      const hasDraggingParent = containerRef.current?.closest('.dragging');
      setIsDragging(!!hasDraggingParent);
    };

    const watchTarget = containerRef.current.closest('.main-section')
      || document.body;

    const mutationObserver = new MutationObserver(checkDragging);
    mutationObserver.observe(watchTarget, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true
    });

    checkDragging();

    return () => mutationObserver.disconnect();
  }, []);

  if (isValidHtml(data) || isValidHtmlSnippet(data)) {
    const htmlContent = data.includes('<head>')
      ? data.replace('<head>', `<head><base href="${escapeHtml(baseUrl)}">`)
      : `<head><base href="${escapeHtml(baseUrl)}"></head>${data}`;

    const dragStyles: React.CSSProperties = isDragging ? { pointerEvents: 'none', userSelect: 'none' } : {};

    return (
      <div
        ref={containerRef}
        className="h-full bg-white"
        style={dragStyles}
      >
        <iframe
          srcDoc={htmlContent}
          sandbox="allow-scripts"
          className="h-full w-full bg-white border-none"
          style={dragStyles}
        />
      </div>
    );
  }

  // For all other data types, render safely as formatted text
  let displayContent = '';
  if (data === null || data === undefined) {
    displayContent = String(data);
  } else if (typeof data === 'object') {
    displayContent = JSON.stringify(data, null);
  } else if (typeof data === 'string') {
    displayContent = data;
  } else {
    displayContent = String(data);
  }

  return (
    <pre
      className="bg-white font-mono text-[13px] whitespace-pre-wrap break-words overflow-auto overflow-x-hidden p-4 text-[#24292f] w-full max-w-full h-full box-border relative"
    >
      {displayContent}
    </pre>
  );
});

export default HtmlPreview;
