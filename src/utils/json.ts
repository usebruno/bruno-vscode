import { format, applyEdits } from 'jsonc-parser';
import fastJsonFormat from 'fast-json-format';
import { patternHasher } from '@usebruno/common/utils';

/** Past this many characters on one line, jsonc-parser's formatter can hang. */
const LONG_LINE_LIMIT = 20000;

const hasLongLine = (text: string) => text.split(/\r?\n/).some((line) => line.length > LONG_LINE_LIMIT);

/**
 * `text` indented as JSON. The formatter works on the text,
 * never on a parsed value, so numbers keep every digit and
 * {{variables}} stay where they are. Text that cannot be formatted comes back
 * as it is.
 */
export const prettifyJsonString = (text: string): string => {
  if (typeof text !== 'string') {
    return text;
  }

  try {
    const { hashed, restore } = patternHasher(text);

    // jsonc-parser is exact with Bruno variables but can hang on a pathological
    // single-line payload; fast-json-format stays responsive there.
    if (hasLongLine(text)) {
      return restore(fastJsonFormat(hashed));
    }

    const edits = format(hashed, undefined, { tabSize: 2, insertSpaces: true });

    return restore(applyEdits(hashed, edits));
  } catch {
    return text;
  }
};
