export function isXML(snippet: any): unknown {
  return /<\/?[a-z][\s\S]*>/i.test(snippet);
}

export function isJSON(snippet: any): unknown {
  try {
    JSON.parse(snippet);
    return true;
  } catch (err) {
    return false;
  }
}

export function autoDetectLang(snippet: any): unknown {
  if (isJSON(snippet)) {
    return 'json';
  }
  if (isXML(snippet)) {
    return 'xml';
  }
  return 'text';
}
