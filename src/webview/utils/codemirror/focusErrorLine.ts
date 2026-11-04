const LINE_CLASS_TARGET = 'background';
const LINE_CLASS_NAME = 'cm-error-line-flash';
const GUTTER_CLASS_TARGET = 'gutter';
const GUTTER_CLASS_NAME = 'cm-error-line-flash-gutter';

const FLASH_DURATION_MS = 3000;

const noop = () => {};

export const focusErrorLine = (editor: any, line1Based: number): (() => void) => {
  if (!editor || typeof line1Based !== 'number' || Number.isNaN(line1Based)) {
    return noop;
  }

  const line = Math.max(0, Math.min(line1Based - 1, editor.lineCount() - 1));

  try {
    editor.scrollIntoView({ line, ch: 0 }, 80);
    editor.addLineClass(line, LINE_CLASS_TARGET, LINE_CLASS_NAME);
    editor.addLineClass(line, GUTTER_CLASS_TARGET, GUTTER_CLASS_NAME);
  } catch {
    return noop;
  }

  let disposed = false;
  let timer: ReturnType<typeof setTimeout>;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    try {
      editor.off('change', dispose);
      editor.removeLineClass(line, LINE_CLASS_TARGET, LINE_CLASS_NAME);
      editor.removeLineClass(line, GUTTER_CLASS_TARGET, GUTTER_CLASS_NAME);
    } catch {}
  };

  timer = setTimeout(dispose, FLASH_DURATION_MS);
  editor.on('change', dispose);

  return dispose;
};
