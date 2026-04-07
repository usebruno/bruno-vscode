/**
 * Shim for @usebruno/common/utils - provides missing functions not in the npm package
 * This supplements the npm package with browser-compatible implementations
 *
 * NOTE: parseQueryParams and buildQueryString are implemented here directly because
 * the rsbuild alias redirects @usebruno/common/utils to this file, which would create
 * a circular import if we tried to re-export from the npm package.
 */

interface QueryParam {
  name: string;
  value?: string;
}

interface BuildQueryStringOptions {
  encode?: boolean;
}

interface ExtractQueryParamsOptions {
  decode?: boolean;
}

/**
 * Build a query string from an array of query parameters
 */
export function buildQueryString(paramsArray: QueryParam[], { encode = false }: BuildQueryStringOptions = {}): string {
  return paramsArray
    .filter(({ name }) => typeof name === 'string' && name.trim().length > 0)
    .map(({ name, value }) => {
      const finalName = encode ? encodeURIComponent(name) : name;
      const finalValue = encode ? encodeURIComponent(value ?? '') : (value ?? '');
      return finalValue ? `${finalName}=${finalValue}` : finalName;
    })
    .join('&');
}

export function parseQueryParams(query: string, { decode = false }: ExtractQueryParamsOptions = {}): QueryParam[] {
  if (!query || !query.length) {
    return [];
  }

  try {
    const [queryString] = query.split('#');
    const pairs = queryString.split('&');

    const params = pairs.map((pair) => {
      const [name, ...valueParts] = pair.split('=');

      if (!name) {
        return null;
      }

      return {
        name: decode ? decodeURIComponent(name) : name,
        value: decode ? decodeURIComponent(valueParts.join('=')) : valueParts.join('=')
      };
    }).filter((param): param is NonNullable<typeof param> => param !== null);

    return params;
  } catch (error) {
    console.error('Error parsing query params:', error);
    return [];
  }
}

/**
 * Encode URL query parameters
 */
export const encodeUrl = (url: string): string => {
  if (!url || typeof url !== 'string') {
    return url;
  }

  const [urlWithoutHash, ...hashFragments] = url.split('#');
  const [basePath, ...queryString] = urlWithoutHash.split('?');

  if (!queryString || queryString.length === 0) {
    return url;
  }

  const queryParams = parseQueryParams(queryString.join('?'), { decode: false });
  const encodedQueryString = buildQueryString(queryParams, { encode: true });

  const encodedUrl = `${basePath}?${encodedQueryString}${hashFragments.length > 0 ? `#${hashFragments.join('#')}` : ''}`;

  return encodedUrl;
};

/**
 * Inner regex pattern for prompt variable names (without braces or `?` prefix)
 */
const PROMPT_VARIABLE_PATTERN = /[^{}\s](?:[^{}]*[^{}\s])?/;

/**
 * Valid examples: "?Name", "?Prompt Var", "?x"
 * Invalid examples: "? Name", "?Name ", "?{{Name}}", "?{Name}"
 */
export const PROMPT_VARIABLE_TEXT_PATTERN = new RegExp(`^\\?(${PROMPT_VARIABLE_PATTERN.source})$`);

/**
 * Valid matches: "{{?Name}}", "{{?Prompt Var}}", "{{?x}}"
 * Invalid: "{{? Name}}", "{{?Name }}", "{{?{Name}}}"
 */
export const PROMPT_VARIABLE_TEMPLATE_PATTERN = new RegExp(`{{\\?(${PROMPT_VARIABLE_PATTERN.source})}}`, 'g');

/**
 * Extract prompt variables matching {{?<Prompt Text>}} from a string.
 * @param str - The input string.
 * @returns An array of extracted prompt variables.
 */
export const extractPromptVariablesFromString = (str: string): string[] => {
  const prompts = new Set<string>();
  let match;
  while ((match = PROMPT_VARIABLE_TEMPLATE_PATTERN.exec(str)) !== null) {
    prompts.add(match[1]);
  }
  return Array.from(prompts);
};

/**
 * Extract prompt variables from an object.
 * @param obj - The input object.
 * @returns An array of extracted prompt variables.
 */
export function extractPromptVariables(obj: any): string[] {
  const prompts = new Set<string>();
  try {
    if (typeof obj === 'string') {
      const extracted = extractPromptVariablesFromString(obj);
      extracted.forEach((prompt) => prompts.add(prompt));
    } else if (Array.isArray(obj)) {
      for (const item of obj) {
        const extracted = extractPromptVariables(item);
        extracted.forEach((prompt) => prompts.add(prompt));
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        const extracted = extractPromptVariables(obj[key]);
        extracted.forEach((prompt) => prompts.add(prompt));
      }
    }
  } catch (error) {
    console.error('Error extracting prompt variables:', error);
  }
  return Array.from(prompts);
}

const VARIABLE_REGEX = /\{\{([^}]+)\}\}/g;

/**
 * Replaces variables in a string with a unique hash that can be restored later.
 * Used for URL validation where variable syntax might interfere.
 */
export function patternHasher(input: string, pattern: string | RegExp = VARIABLE_REGEX) {
  const usableRegex = new RegExp(pattern, 'g');

  function hash(toHash: string) {
    let hash = 5381;
    let c;
    for (let i = 0; i < toHash.length; i++) {
      c = toHash.charCodeAt(i);
      hash = ((hash << 5) + hash + c) | 0;
    }
    return '' + hash;
  }

  const prefix = `bruno-var-hash-`;
  const hashToOriginal: Record<string, string> = {};
  let result = input;
  let hashed = false;

  if (usableRegex.test(input)) {
    hashed = true;
    result = input.replace(usableRegex, function (matchedVar) {
      const hashedValue = `${prefix}${hash(matchedVar)}`;
      hashToOriginal[hashedValue] = matchedVar;
      return hashedValue;
    });
  }

  return {
    hashed: result,
    restore(current: string) {
      if (!hashed) {
        return current;
      }
      let clone = current;
      for (const hash in hashToOriginal) {
        const value = hashToOriginal[hash];
        clone = clone.replaceAll(hash, value);
      }
      return clone;
    }
  };
}
