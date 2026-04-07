import LinkifyIt from 'linkify-it';
import { isMacOS } from 'utils/common/platform';
import { debounce } from 'lodash';

function getVisibleLineRange(editor: any, padding = 3) {
  const doc = editor.getDoc();
  const scroll = editor.getScrollInfo();
  const topLine = editor.lineAtHeight(scroll.top, 'local');
  const bottomLine = editor.lineAtHeight(scroll.top + scroll.clientHeight, 'local');

  return {
    from: Math.max(0, topLine - padding),
    to: Math.min(doc.lineCount(), bottomLine + padding + 1) // +1 because to is exclusive
  };
}

function markUrls(editor: any, linkify: any, linkClass: any, linkHint: any) {
  const doc = editor.getDoc();
  const { from: fromLine, to: toLine } = getVisibleLineRange(editor, 3);

  editor.operation(() => {
    editor.getAllMarks().forEach((mark: any) => {
      if (mark.className !== linkClass) return;

      const pos = mark.find?.();
      if (!pos) {
        // If we can't find position, clear it to be safe
        mark.clear();
        return;
      }

      if (pos.to.line >= fromLine && pos.from.line < toLine) {
        mark.clear();
      }
    });

    for (let lineNum = fromLine; lineNum < toLine; lineNum++) {
      const lineContent = doc.getLine(lineNum);
      if (!lineContent) continue;

      const matches = linkify.match(lineContent);
      if (!matches) continue;

      matches.forEach(({
        index,
        lastIndex,
        url
      }: any) => {
        try {
          editor.markText(
            { line: lineNum, ch: index },
            { line: lineNum, ch: lastIndex },
            {
              className: linkClass,
              attributes: {
                'data-url': url,
                'title': linkHint
              }
            }
          );
        } catch (e) {
          // Silently ignore marking errors (e.g., if positions are invalid)
          // This can happen if the line content changed between getting it and marking
        }
      });
    }
  });
}

function handleMouseEnter(event: any, linkClass: any, linkHoverClass: any, updateCmdCtrlClass: any) {
  const el = event.target;
  if (!el.classList.contains(linkClass)) return;

  updateCmdCtrlClass(event);

  el.classList.add(linkHoverClass);

  let sibling = el.previousElementSibling;
  while (sibling && sibling.classList.contains(linkClass)) {
    sibling.classList.add(linkHoverClass);
    sibling = sibling.previousElementSibling;
  }

  sibling = el.nextElementSibling;
  while (sibling && sibling.classList.contains(linkClass)) {
    sibling.classList.add(linkHoverClass);
    sibling = sibling.nextElementSibling;
  }
}

function handleMouseLeave(event: any, linkClass: any, linkHoverClass: any) {
  const el = event.target;
  el.classList.remove(linkHoverClass);

  let sibling = el.previousElementSibling;
  while (sibling && sibling.classList.contains(linkClass)) {
    sibling.classList.remove(linkHoverClass);
    sibling = sibling.previousElementSibling;
  }

  sibling = el.nextElementSibling;
  while (sibling && sibling.classList.contains(linkClass)) {
    sibling.classList.remove(linkHoverClass);
    sibling = sibling.nextElementSibling;
  }
}

function updateCmdCtrlClass(event: any, editorWrapper: any, cmdCtrlClass: any, isCmdOrCtrlPressed: any) {
  if (isCmdOrCtrlPressed(event)) {
    editorWrapper.classList.add(cmdCtrlClass);
  } else {
    editorWrapper.classList.remove(cmdCtrlClass);
  }
}

function handleClick(event: any, linkClass: any, isCmdOrCtrlPressed: any) {
  if (!isCmdOrCtrlPressed(event)) return;

  if (event.target.classList.contains(linkClass)) {
    event.preventDefault();
    event.stopPropagation();
    const url = event.target.getAttribute('data-url');
    if (url) {
      window?.ipcRenderer?.openExternal(url);
    }
  }
}

function setupLinkAware(editor: any, options = {}) {
  if (!editor) {
    return;
  }

  const cmdCtrlClass = 'cmd-ctrl-pressed';
  const linkClass = 'CodeMirror-link';
  const linkHoverClass = 'hovered-link';
  const linkHint = isMacOS() ? 'Hold Cmd and click to open link' : 'Hold Ctrl and click to open link';

  const isCmdOrCtrlPressed = (event: any) => isMacOS() ? event.metaKey : event.ctrlKey;

  const linkify = new LinkifyIt();
  const editorWrapper = editor.getWrapperElement();

  const boundMarkUrls = () => markUrls(editor, linkify, linkClass, linkHint);
  const boundUpdateCmdCtrlClass = (event: any) => updateCmdCtrlClass(event, editorWrapper, cmdCtrlClass, isCmdOrCtrlPressed);
  const boundHandleClick = (event: any) => handleClick(event, linkClass, isCmdOrCtrlPressed);
  const boundHandleMouseEnter = (event: any) => handleMouseEnter(event, linkClass, linkHoverClass, boundUpdateCmdCtrlClass);
  const boundHandleMouseLeave = (event: any) => handleMouseLeave(event, linkClass, linkHoverClass);

  const debouncedMarkUrls = debounce(() => {
    requestAnimationFrame(() => {
      // Skip if the editor is hidden (e.g., tab not visible)
      if (!editorWrapper.offsetParent) return;
      boundMarkUrls();
    });
  }, 150);

  editor.on('refresh', debouncedMarkUrls);

  editor.on('changes', debouncedMarkUrls);

  editor.on('scroll', debouncedMarkUrls);

  window.addEventListener('keydown', boundUpdateCmdCtrlClass);
  window.addEventListener('keyup', boundUpdateCmdCtrlClass);
  editorWrapper.addEventListener('click', boundHandleClick);
  editorWrapper.addEventListener('mouseover', boundHandleMouseEnter);
  editorWrapper.addEventListener('mouseout', boundHandleMouseLeave);

  editor._destroyLinkAware = () => {
    editor.off('refresh', debouncedMarkUrls);
    editor.off('changes', debouncedMarkUrls);
    editor.off('scroll', debouncedMarkUrls);
    window.removeEventListener('keydown', boundUpdateCmdCtrlClass);
    window.removeEventListener('keyup', boundUpdateCmdCtrlClass);
    editorWrapper.removeEventListener('click', boundHandleClick);
    editorWrapper.removeEventListener('mouseover', boundHandleMouseEnter);
    editorWrapper.removeEventListener('mouseout', boundHandleMouseLeave);
  };
}

export { setupLinkAware };
