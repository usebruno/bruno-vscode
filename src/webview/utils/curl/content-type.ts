import React from 'react';
const normalizeContentType = (contentType: any) => {
  if (!contentType || typeof contentType !== 'string') {
    return '';
  }

  return contentType.toLowerCase();
};

export const isJsonLikeContentType = (contentType: any) => {
  const normalized = normalizeContentType(contentType);

  return normalized.includes('application/json') || normalized.includes('+json');
};

export const isXmlLikeContentType = (contentType: any) => {
  const normalized = normalizeContentType(contentType);

  return normalized.includes('application/xml') || normalized.includes('+xml') || normalized.includes('text/xml');
};

export const isPlainTextContentType = (contentType: any) => {
  const normalized = normalizeContentType(contentType);

  return normalized.includes('text/plain');
};

export const isStructuredContentType = (contentType: any) => {
  return isJsonLikeContentType(contentType) || isXmlLikeContentType(contentType) || isPlainTextContentType(contentType);
};
