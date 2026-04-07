import React from 'react';
import cookie from 'cookie';
import URL from 'url';
import { parse } from 'shell-quote';
import { isEmpty } from 'lodash';
import { parseQueryParams } from '@usebruno/common/utils';

/**
 * Flag definitions - maps flag names to their states and actions
 * State-returning flags expect a value, immediate action flags don't
 */
const FLAG_CATEGORIES = {
  // State-returning flags (expect a value after the flag)
  'user-agent': ['-A', '--user-agent'],
  'header': ['-H', '--header'],
  'data': ['-d', '--data', '--data-ascii', '--data-urlencode'],
  'json': ['--json'],
  'user': ['-u', '--user'],
  'method': ['-X', '--request'],
  'cookie': ['-b', '--cookie'],
  'form': ['-F', '--form'],
  // Special data flags with properties
  'data-raw': ['--data-raw'],
  'data-binary': ['--data-binary'],

  // Immediate action flags (no value expected)
  'head': ['-I', '--head'],
  'compressed': ['--compressed'],
  'insecure': ['-k', '--insecure'],
  /**
   * Query flags: mark data for conversion to query parameters.
   * While this is an immediate action flag, the actual conversion to a query string occurs later during post-build request processing.
   * Due to the unpredictable order of flags, query string construction is deferred to the end.
   */
  'query': ['-G', '--get']
};

/**
 * Parse a curl command into a request object
 *
 * @TODO
 * - Handle T (file upload)
 */
const parseCurlCommand = (curl: any) => {
  const cleanedCommand = cleanCurlCommand(curl);
  const parsedArgs = parse(cleanedCommand);
  const request = buildRequest(parsedArgs);

  return cleanRequest(postBuildProcessRequest(request));
};

/**
 * Build request object by processing parsed arguments
 * Uses a state machine pattern to handle flag-value pairs
 */
const buildRequest = (parsedArgs: any) => {
  const request = { headers: {} };
  let currentState = null;

  for (const arg of parsedArgs) {
    const newState = processArgument(arg, currentState, request);
    if (currentState && !newState) {
      currentState = null;
    } else if (newState) {
      currentState = newState;
    }
  }

  return request;
};

const processArgument = (arg: any, currentState: any, request: any) => {
  const flagState = handleFlag(arg, request);
  if (flagState) {
    return flagState;
  }

  if (arg && currentState) {
    handleValue(arg, currentState, request);
    return null;
  }

  // Handle URL detection (only when no current state to avoid conflicts)
  if (!currentState && isURLOrFragment(arg)) {
    setURL(request, arg);
    return null;
  }

  return null;
};

const handleFlag = (arg: any, request: any) => {
  for (const [category, flags] of Object.entries(FLAG_CATEGORIES)) {
    if (flags.includes(arg)) {
      return handleFlagCategory(category, arg, request);
    }
  }

  return null;
};

const handleFlagCategory = (category: any, arg: any, request: any) => {
  switch (category) {
    case 'user-agent':
    case 'header':
    case 'data':
    case 'json':
    case 'user':
    case 'method':
    case 'cookie':
    case 'form':
      return category;

    case 'data-raw':
      request.isDataRaw = true;
      return 'data';

    case 'data-binary':
      request.isDataBinary = true;
      return 'data';
    // Immediate action flags (perform action and return null)
    case 'head':
      request.method = 'HEAD';
      return null;

    case 'compressed':
      request.headers['Accept-Encoding'] = request.headers['Accept-Encoding'] || 'deflate, gzip';
      return null;

    case 'insecure':
      request.insecure = true;
      return null;

    case 'query':
      // this is processed later at post build request processing
      request.isQuery = true;
      return null;

    default:
      return null;
  }
};

const handleValue = (value: any, state: string, request: any) => {
  const valueHandlers: Record<string, () => void> = {
    'header': () => setHeader(request, value),
    'user-agent': () => setUserAgent(request, value),
    'data': () => setData(request, value),
    'json': () => setJsonData(request, value),
    'form': () => setFormData(request, value),
    'user': () => setAuth(request, value),
    'method': () => setMethod(request, value),
    'cookie': () => setCookie(request, value)
  };

  const handler = valueHandlers[state];
  if (handler) {
    handler();
  }
};

const setHeader = (request: any, value: any) => {
  const [headerName, headerValue] = value.split(/:\s*(.+)/);
  request.headers[headerName] = headerValue;
};

const setUserAgent = (request: any, value: any) => {
  request.headers['User-Agent'] = value;
};

const setAuth = (request: any, value: any) => {
  if (typeof value !== 'string') {
    return;
  }

  const [username, password] = value.split(':');
  request.auth = {
    mode: 'basic',
    basic: {
      username: username || '',
      password: password || ''
    }
  };
};

const setMethod = (request: any, value: any) => {
  request.method = value.toUpperCase();
};

/**
 * Set request cookies
 */
const setCookie = (request: any, value: any) => {
  if (typeof value !== 'string') {
    return;
  }

  const parsedCookies = cookie.parse(value);
  request.cookies = { ...request.cookies, ...parsedCookies };
  request.cookieString = request.cookieString ? request.cookieString + '; ' + value : value;

  request.headers['Cookie'] = request.cookieString;
};

/**
 * Set data (handles multiple -d flags by concatenating with &)
 */
const setData = (request: any, value: any) => {
  request.data = request.data ? request.data + '&' + value : value;
};

/**
 * Set JSON data
 * JSON flag automatically sets Content-Type and converts GET/HEAD to POST
 */
const setJsonData = (request: any, value: any) => {
  if (request.method === 'GET' || request.method === 'HEAD') {
    request.method = 'POST';
  }
  request.headers['Content-Type'] = 'application/json';
  // JSON data replaces existing data (don't append with &)
  request.data = value;
};

/**
 * Set form data
 * Form data always sets method to POST and creates multipart uploads
 */
const setFormData = (request: any, value: any) => {
  const formArray = Array.isArray(value) ? value : [value];
  const multipartUploads: any = [];

  formArray.forEach((field) => {
    const upload = parseFormField(field);
    if (upload) {
      multipartUploads.push(upload);
    }
  });

  request.multipartUploads = request.multipartUploads || [];
  request.multipartUploads.push(...multipartUploads);
  request.method = 'POST';
};

/**
 * Parse a single form field
 * Handles text fields, quoted values, and file uploads (@path)
 */
const parseFormField = (field: any) => {
  const match = field.match(/^([^=]+)=(?:@?"([^"]*)"|@([^@]*)|([^@]*))?$/);

  if (!match) return null;

  const fieldName = match[1];
  const fieldValue = match[2] || match[3] || match[4] || '';
  const isFile = field.includes('@');

  return {
    name: fieldName,
    value: fieldValue,
    type: isFile ? 'file' : 'text',
    enabled: true
  };
};

const isURLOrFragment = (arg: any) => {
  return isURL(arg) || isURLFragment(arg);
};

const isURL = (arg: any) => {
  if (typeof arg !== 'string') {
    return false;
  }

  if (URL.parse(arg || '').host) {
    return true;
  }

  // This regex matches domain patterns like:
  // - example.com
  // - sub.example.com
  // - example.com/path
  // - example.com/path?query=value
  // Must contain at least one dot to be considered a domain
  const DOMAIN_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(\/[^\s]*)?(\?[^\s]*)?$/;

  return DOMAIN_PATTERN.test(arg);
};

const isURLFragment = (arg: any) => {
  // If it's a glob pattern that looks like a URL, treat it as a complete URL
  if (arg && typeof arg === 'object' && arg.op === 'glob') {
    return isURL(arg.pattern);
  }
  if (arg && typeof arg === 'object' && arg.op === '&') {
    return true;
  }
  if (typeof arg === 'string') {
    return /^[^=]+=[^&]*$/.test(arg);
  }
  return false;
};

/**
 * Set URL and related properties
 * Handles URL concatenation for shell-quote fragments
 */
const setURL = (request: any, url: any) => {
  const urlString = getUrlString(url);
  if (!urlString) return;

  let processedUrl = urlString;
  if (!request.url && !urlString.match(/^[a-zA-Z]+:\/\//)) {
    processedUrl = 'https://' + urlString;
  }

  const newUrl = request.url ? request.url + processedUrl : processedUrl;

  const { url: formattedUrl, queries, urlWithoutQuery } = parseUrl(newUrl);

  request.url = formattedUrl;
  request.urlWithoutQuery = urlWithoutQuery;
  request.queries = queries;
};

const getUrlString = (url: any) => {
  if (typeof url === 'string') return url;
  if (url?.op === 'glob') return url.pattern;
  if (url?.op === '&') return '&';
  return null;
};

/**
 * Parse URL
 * Returns formatted URL, URL without query, and queries
 */
const parseUrl = (url: any) => {
  const parsedUrl = URL.parse(url);

  // @ts-expect-error - @usebruno/common/utils parseQueryParams may accept options parameter
  const queries = parseQueryParams(parsedUrl.query, { decode: false });

  let formattedUrl = URL.format(parsedUrl);
  if (!url.endsWith('/') && formattedUrl.endsWith('/')) {
    formattedUrl = formattedUrl.slice(0, -1);
  }

  const urlWithoutQuery = formattedUrl.split('?')[0];

  return {
    url: formattedUrl,
    urlWithoutQuery,
    queries
  };
};

const convertDataToQueryString = (request: any) => {
  let url = request.url;

  if (url.indexOf('?') < 0) {
    url += '?';
  } else if (!url.endsWith('&')) {
    url += '&';
  }

  // append data to url as query string
  url += request.data;

  const { url: formattedUrl, queries } = parseUrl(url);

  request.url = formattedUrl;
  request.queries = queries;

  return request;
};

/**
 * Post-build processing of request
 * Handles method conversion and query parameter processing
 */
const postBuildProcessRequest = (request: any) => {
  if (request.isQuery && request.data) {
    request = convertDataToQueryString(request);
    delete request.data;
    delete request.isQuery;
  } else if (request.data) {
    // if data is present, set method to POST unless the method is explicitly set
    if (!request.method || request.method === 'HEAD') {
      request.method = 'POST';
    }
  }

  // if method is not set, set it to GET
  if (!request.method) {
    request.method = 'GET';
  }

  // bruno requires method to be lowercase
  request.method = request.method.toLowerCase();

  return request;
};

/**
 * Clean up the final request object
 */
const cleanRequest = (request: any) => {
  if (isEmpty(request.headers)) {
    delete request.headers;
  }

  if (isEmpty(request.queries)) {
    delete request.queries;
  }

  return request;
};

/**
 * Clean up curl command
 * Handles escape sequences, line continuations, and method concatenation
 */
const cleanCurlCommand = (curlCommand: any) => {
  curlCommand = curlCommand.replace(/\$('.*')/g, (match: any, group: any) => group);
  curlCommand = curlCommand.replace(/\\'(?!')/g, '\'\\\'\'');
  // Fix concatenated HTTP methods
  curlCommand = fixConcatenatedMethods(curlCommand);

  return curlCommand.trim();
};

/**
 * Fix concatenated HTTP methods
 * Eg: Converts -XPOST to -X POST for proper parsing
 */
const fixConcatenatedMethods = (command: any) => {
  const methodFixes = [
    { from: / -XPOST/, to: ' -X POST' },
    { from: / -XGET/, to: ' -X GET' },
    { from: / -XPUT/, to: ' -X PUT' },
    { from: / -XPATCH/, to: ' -X PATCH' },
    { from: / -XDELETE/, to: ' -X DELETE' },
    { from: / -XOPTIONS/, to: ' -X OPTIONS' },
    { from: / -XHEAD/, to: ' -X HEAD' },
    { from: / -Xnull/, to: ' ' }
  ];

  methodFixes.forEach(({ from, to }) => {
    command = command.replace(from, to);
  });

  return command;
};

export default parseCurlCommand;
