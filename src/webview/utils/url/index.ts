import { interpolate } from '@usebruno/common';

interface PathParam {
  name: string;
  value: string;
  type?: string;
}

interface InterpolateUrlParams {
  url: string;
  variables: Record<string, unknown>;
}

const hasLength = (str: string | null | undefined): boolean => {
  if (!str || !str.length) {
    return false;
  }

  const trimmed = str.trim();

  return trimmed.length > 0;
};

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

  const index = str.indexOf(char);
  if (index === -1) {
    return [str];
  }

  return [str.slice(0, index), str.slice(index + 1)];
};

export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch (err) {
    return false;
  }
};

export const interpolateUrl = ({
  url,
  variables
}: InterpolateUrlParams): string | undefined => {
  if (!url || !url.length || typeof url !== 'string') {
    return;
  }

  return interpolate(url, variables);
};

export const interpolateUrlPathParams = (url: string, params: PathParam[]): string => {
  const getInterpolatedBasePath = (pathname: string, params: PathParam[]): string => {
    return pathname
      .split('/')
      .map((segment: string) => {
        if (segment.startsWith(':')) {
          const name = segment.slice(1);
          const pathParam = params.find((p) => p?.name === name && p?.type === 'path');
          return pathParam ? pathParam.value : segment;
        }

        // for OData-style parameters (parameters inside parentheses)
        // 1. EntitySet('key') or EntitySet(key)
        // 2. EntitySet(Key1=value1,Key2=value2)
        // 3. Function(param=value)
        if (!/^[A-Za-z0-9_.-]+\([^)]*\)$/.test(segment)) {
          return segment;
        }

        const regex = /[:](\w+)/g;
        let match: RegExpExecArray | null;
        let result = segment;
        while ((match = regex.exec(segment))) {
          if (!match[1]) continue;

          let name = match[1].replace(/[')"`]+$/, '');
          name = name.replace(/^[('"`]+/, '');
          if (!name) continue;

          const pathParam = params.find((p) => p?.name === name && p?.type === 'path');
          if (pathParam) {
            result = result.replace(':' + match[1], pathParam.value);
          }
        }
        return result;
      })
      .join('/');
  };

  let uri;

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `http://${url}`;
  }

  try {
    uri = new URL(url);
  } catch (error) {
    // if the URL is invalid, return the URL as is
    return url;
  }

  const basePath = getInterpolatedBasePath(uri.pathname, params);

  return `${uri.origin}${basePath}${uri?.search || ''}`;
};
