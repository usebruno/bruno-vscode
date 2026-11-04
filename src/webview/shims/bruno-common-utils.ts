/**
 * Shim for @usebruno/common/utils - provides missing functions not in the npm package
 * This supplements the npm package with browser-compatible implementations
 *
 * NOTE: parseQueryParams and buildQueryString are implemented here directly because
 * the rsbuild alias redirects @usebruno/common/utils to this file, which would create
 * a circular import if we tried to re-export from the npm package.
 */

export type BrunoVariableDataType = 'string' | 'number' | 'boolean' | 'object';

/**
 * Derive the Bru lang data type of a native value. Mirrors @usebruno/common's implementation;
 * reimplemented here because the rsbuild alias redirects @usebruno/common/utils to this shim.
 */
export const getDataTypeFromValue = (value: unknown): BrunoVariableDataType => {
  if (value === null || value === undefined) return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object') return 'object';
  return 'string';
};

export const BRUNO_VARIABLE_DATATYPES: readonly BrunoVariableDataType[] = ['string', 'number', 'boolean', 'object'];

/** String-form → typed JS value, or the raw value on failure. Pairs with valueToString. */
export const parseValueByDataType = (value: any, dataType?: BrunoVariableDataType): any => {
  if (!dataType || dataType === 'string') return value;
  try {
    if (dataType === 'number') {
      if (typeof value === 'number') return value;
      const trimmed = typeof value === 'string' ? value.trim() : value;
      if (trimmed === '' || trimmed == null) return value;
      const num = Number(trimmed);
      if (!Number.isNaN(num)) return num;
    } else if (dataType === 'boolean') {
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
    } else if (dataType === 'object') {
      if (typeof value === 'object' && value !== null) return value;
      const trimmed = typeof value === 'string' ? value.trim() : value;
      if (trimmed === '' || trimmed == null) return value;
      const parsed = JSON.parse(trimmed);
      if (parsed !== null && typeof parsed === 'object') return parsed;
    }
  } catch (_) {
    // not coercible — fall through to raw
  }
  return value;
};

/** Native value → its string form (objects as JSON). Pairs with parseValueByDataType. */
export const valueToString = (value: unknown, indent?: number): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'function' || typeof value === 'symbol') return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, indent) ?? '';
    } catch (_) {
      return '';
    }
  }
  return String(value);
};

/** Error message when a coerced value's JS type doesn't match its declared dataType, else null. */
export const validateDataTypeValue = (value: any, dataType?: BrunoVariableDataType): string | null => {
  if (!dataType || dataType === 'string') return null;
  if (value === undefined || value === null) return null;
  if (dataType === 'number' && typeof value !== 'number') return `Value is not a valid ${dataType}`;
  if (dataType === 'boolean' && typeof value !== 'boolean') return `Value is not a valid ${dataType}`;
  if (dataType === 'object' && typeof value !== 'object') return `Value is not a valid ${dataType}`;
  return null;
};

export interface DotenvVariable {
  name: string;
  value?: string;
}

/**
 * Serializes variables to .env file content. Copied from @usebruno/common because the
 * rsbuild alias points @usebruno/common/utils at this shim, so its version is unreachable
 * here. The two must stay byte-identical or the extension and the webview disagree on
 * what a saved file should look like.
 *
 * A value is quoted based on how the dotenv parser reads each quote style back:
 * - unquoted keeps \, " and ', but ends the value at a # and drops surrounding spaces
 * - single and backtick quotes are taken literally
 * - double quotes are literal except for \n and \r, which expand
 */
export const jsonToDotenv = (variables: DotenvVariable[]): string => {
  if (!Array.isArray(variables)) {
    return '';
  }

  return variables
    .filter((variable) => variable.name && variable.name.trim() !== '')
    .map((variable) => {
      const value = variable.value || '';

      if (value.includes('\n') || value.includes('\r')) {
        return `${variable.name}="${value.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`;
      }

      if (value.includes('#')) {
        if (!value.includes('\'')) {
          return `${variable.name}='${value}'`;
        }
        if (!value.includes('`')) {
          return `${variable.name}=\`${value}\``;
        }
        return `${variable.name}="${value.replace(/"/g, '\\"')}"`;
      }

      if (value !== value.trim()) {
        if (!value.includes('\'')) {
          return `${variable.name}='${value}'`;
        }
        if (!value.includes('`')) {
          return `${variable.name}=\`${value}\``;
        }
        return `${variable.name}="${value}"`;
      }

      return `${variable.name}=${value}`;
    })
    .join('\n');
};

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
