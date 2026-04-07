/**
 * Utility functions for processing response body content and determining body type
 */

type BodyType = 'json' | 'xml' | 'html' | 'text';

/**
 * Determines the body type based on content-type header
 * @param contentType - The content-type header value
 * @returns The body type (json, xml, html, text)
 */
export const getBodyType = (contentType = ''): BodyType => {
  const normalizedContentType = contentType.toLowerCase();

  if (normalizedContentType.includes('application/json')) {
    return 'json';
  } else if (normalizedContentType.includes('text/xml') || normalizedContentType.includes('application/xml')) {
    return 'xml';
  } else if (normalizedContentType.includes('text/html')) {
    return 'html';
  }

  return 'text';
};
