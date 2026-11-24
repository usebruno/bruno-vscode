import { parseQueryParams } from '@usebruno/common/utils';

export interface PathParam {
  name: string;
  value: string;
  type?: string;
}

export const parsePathParams = (url: string): PathParam[] => {
  let uri: string | URL = url.slice();

  if (!uri || !uri.length) {
    return [];
  }

  if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
    uri = `http://${uri}`;
  }

  let paths: string[];

  try {
    const parsedUri = new URL(uri);
    paths = parsedUri.pathname.split('/');
  } catch (e) {
    paths = (uri as string).split('/');
  }

  // Enhanced: also match :param inside parentheses and/or quotes
  const foundParams = new Set<string>();
  paths.forEach((segment: string) => {
    if (segment.startsWith(':')) {
      const name = segment.slice(1);
      if (name && !foundParams.has(name)) {
        foundParams.add(name);
      }
      return;
    }

    // for OData-style parameters (parameters inside parentheses)
    // 1. EntitySet('key') or EntitySet(key)
    // 2. EntitySet(Key1=value1,Key2=value2)
    // 3. Function(param=value)
    if (!/^[A-Za-z0-9_.-]+\([^)]*\)$/.test(segment)) {
      return;
    }

    const paramRegex = /[:](\w+)/g;
    let match;
    while ((match = paramRegex.exec(segment))) {
      if (!match[1]) continue;

      let name = match[1].replace(/[')"`]+$/, '');
      name = name.replace(/^[('"`]+/, '');
      if (name && !foundParams.has(name)) {
        foundParams.add(name);
      }
    }
  });
  return Array.from(foundParams).map((name) => ({ name, value: '' }));
};

export const splitOnFirst = (str: string | null | undefined, char: string): string[] => {
  if (!str || !str.length) {
    return [str ?? ''];
  }
  const masked = str.replace(/\{\{.*?\}\}/g, (match) => '_'.repeat(match.length));
  const index = masked.indexOf(char);

  if (index === -1) {
    return [str];
  }

  return [str.slice(0, index), str.slice(index + 1)];
};

/** The query and path params a request URL carries, as the Bruno app's newHttpRequest derives them. */
export const parseParamsFromUrl = (url: string): { name: string; value: string; enabled: boolean; type: 'query' | 'path' }[] => {
  const query = parseQueryParams(splitOnFirst(url, '?')[1] || '').map(({ name, value }) => ({
    name,
    value: value ?? '',
    enabled: true,
    type: 'query' as const
  }));
  const path = parsePathParams(url).map(({ name, value }) => ({ name, value, enabled: true, type: 'path' as const }));

  return [...query, ...path];
};
