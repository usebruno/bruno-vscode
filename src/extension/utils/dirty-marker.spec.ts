import { describe, test, expect } from 'vitest';
import { DIRTY_MARKER, dirtyMarkerOffsets, stripDirtyMarker } from './dirty-marker';

const request = `meta {
  name: login
  type: http
  seq: 1
}

post {
  url: {{BACKEND_URL}}/auth/login
  body: json
  auth: none
}
`;

describe('stripDirtyMarker', () => {
  test('leaves a file without a marker untouched', () => {
    expect(stripDirtyMarker(request)).toBe(request);
  });

  test('removes a marker at the end of the file', () => {
    expect(stripDirtyMarker(`${request}${DIRTY_MARKER}`)).toBe(request);
  });

  test('removes a marker followed by trailing whitespace', () => {
    expect(stripDirtyMarker(`${request}${DIRTY_MARKER}\n`)).toBe(`${request}\n`);
  });

  test('removes repeated markers', () => {
    expect(stripDirtyMarker(`${request}${DIRTY_MARKER}${DIRTY_MARKER}`)).toBe(request);
  });

  test('keeps a zero-width space that is part of the request', () => {
    const withZeroWidthInBody = `${request}
body:json {
  {
    "note": "a${DIRTY_MARKER}b"
  }
}
`;
    expect(stripDirtyMarker(withZeroWidthInBody)).toBe(withZeroWidthInBody);
  });
});

describe('dirtyMarkerOffsets', () => {
  test('reports nothing for a clean file', () => {
    expect(dirtyMarkerOffsets(request)).toEqual([]);
  });

  test('reports the offset of a trailing marker', () => {
    expect(dirtyMarkerOffsets(`${request}${DIRTY_MARKER}`)).toEqual([request.length]);
  });

  test('reports every trailing marker', () => {
    expect(dirtyMarkerOffsets(`${request}${DIRTY_MARKER}\n${DIRTY_MARKER}`)).toEqual([
      request.length,
      request.length + 2
    ]);
  });
});
