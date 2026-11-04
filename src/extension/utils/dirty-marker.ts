/**
 * VS Code cannot flag a document as dirty without editing it, so the custom editor appends a
 * zero width space to show the unsaved indicator on the tab. The bru grammar rejects a trailing
 * zero width space, so a marker that reaches disk leaves the file unparseable.
 * https://github.com/usebruno/bruno-vscode/issues/59
 */
export const DIRTY_MARKER = '\u200B';

// Only markers in the trailing whitespace run are ours. A zero width space anywhere else is content.
const trailingMarkers = () => new RegExp(`${DIRTY_MARKER}(?=[\\s${DIRTY_MARKER}]*$)`, 'g');

export const stripDirtyMarker = (content: string): string => content.replace(trailingMarkers(), '');

export const dirtyMarkerOffsets = (content: string): number[] =>
  Array.from(content.matchAll(trailingMarkers()), (match) => match.index as number);
