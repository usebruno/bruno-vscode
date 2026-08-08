import React, { useRef, useState, useEffect } from 'react';
import { escapeHtml } from 'utils/response/index';

const HtmlPreview = React.memo(({ data, baseUrl }: { data: string; baseUrl: string }) => {
  const webviewContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!webviewContainerRef.current) return;

    const checkDragging = () => {
      const hasDraggingParent = webviewContainerRef.current?.closest('.dragging');
      setIsDragging(!!hasDraggingParent);
    };

    // Watch from a common ancestor where .dragging gets added
    const watchTarget = webviewContainerRef.current.closest('.main-section')
      || document.body;

    const mutationObserver = new MutationObserver(checkDragging);
    mutationObserver.observe(watchTarget, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true
    });

    // Check initial state
    checkDragging();

    return () => mutationObserver.disconnect();
  }, []);

  const renderHtmlPreview = (data: string, baseUrl: string, isDragging: boolean, webviewContainerRef: React.RefObject<HTMLDivElement>) => {
    const htmlContent = data.includes('<head>')
      ? data.replace('<head>', `<head><base href="${escapeHtml(baseUrl)}">`)
      : `<head><base href="${escapeHtml(baseUrl)}"></head>${data}`;

    const dragStyles: React.CSSProperties = isDragging ? { pointerEvents: 'none', userSelect: 'none' } : {};

    return (
      <div
        ref={webviewContainerRef}
        className="h-full bg-white webview-container"
        style={dragStyles}
      >
        {/* VS Code webviews can't use Electron's <webview> tag - an iframe
            with srcDoc is the platform-native equivalent here, achieving
            the same "just render whatever we're given" behavior as desktop. */}
        <iframe
          srcDoc={htmlContent}
          sandbox="allow-scripts"
          className="h-full bg-white border-none"
          style={dragStyles}
        />
      </div>
    );
  };

  // For all other data types, render safely as formatted text
  let displayContent = '';
  if (data === null || data === undefined) {
    displayContent = String(data);
  } else if (typeof data === 'object') {
    displayContent = JSON.stringify(data, null);
  } else {
    displayContent = String(data);
  }

  return (
    <>{renderHtmlPreview(displayContent, baseUrl, isDragging, webviewContainerRef)}</>
  );
});

export default HtmlPreview;