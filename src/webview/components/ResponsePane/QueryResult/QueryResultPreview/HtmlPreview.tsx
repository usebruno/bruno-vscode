import React, { useRef, useState, useEffect } from 'react';
import { isValidHtml } from 'utils/common/index';
import { PREVIEW_SAVE_HOTKEY_MESSAGE } from 'utils/common/constants';
import { escapeHtml, isValidHtmlSnippet } from 'utils/response/index';

interface HtmlPreviewProps {
  data: string;
  baseUrl: string;
}

// Match the physical key, like VS Code's keybinding. e.key would be layout-dependent.
const SAVE_SHORTCUT_FORWARDER =
  `<script>document.addEventListener('keydown',function(e){` +
  `if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&e.code==='KeyS'){` +
  `e.preventDefault();parent.postMessage(${JSON.stringify(PREVIEW_SAVE_HOTKEY_MESSAGE)},'*');` +
  `}},true);</script>`;

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
    // Keydowns in this nested context never reach VS Code's keybinding, so save is forwarded.
    const injectedHead = `<base href="${escapeHtml(baseUrl)}">${SAVE_SHORTCUT_FORWARDER}`;
    const openingHead = data.match(/<head\b[^>]*>/i);
    const htmlContent = openingHead
      ? data.replace(openingHead[0], `${openingHead[0]}${injectedHead}`)
      : `<head>${injectedHead}</head>${data}`;

    const dragStyles: React.CSSProperties = isDragging ? { pointerEvents: 'none', userSelect: 'none' } : {};

    return (
      <div
        ref={containerRef}
        className="h-full bg-white"
        style={dragStyles}
      >
        <iframe
          data-html-preview
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
