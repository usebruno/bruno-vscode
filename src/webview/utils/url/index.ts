import { interpolate } from '@usebruno/common';

import { parseParamsFromUrl, parsePathParams, splitOnFirst, type PathParam } from '../../../utils/url';

// Shared with the extension host, which reads params from a request URL too.
export { parseParamsFromUrl, parsePathParams, splitOnFirst };

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
