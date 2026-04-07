type BodyMode = 'json' | 'text' | 'xml' | 'sparql' | 'formUrlEncoded' | 'graphql' | 'multipartForm' | 'file' | string;

interface Header {
  name: string;
  value: string;
  enabled: boolean;
}

interface RequestBody {
  mode?: BodyMode;
  [key: string]: unknown;
}

interface HarRequest {
  url: string;
  method: string;
  body?: RequestBody;
  params?: Array<{ name: string; value: string; enabled: boolean; type: string }>;
  auth?: {
    mode?: string;
    apikey?: {
      placement?: string;
      key?: string;
      value?: string;
    };
  };
}

const createContentType = (mode: BodyMode | undefined): string => {
  switch (mode) {
    case 'json':
      return 'application/json';
    case 'text':
      return 'text/plain';
    case 'xml':
      return 'application/xml';
    case 'sparql':
      return 'application/sparql-query';
    case 'formUrlEncoded':
      return 'application/x-www-form-urlencoded';
    case 'graphql':
      return 'application/json';
    case 'multipartForm':
      return 'multipart/form-data';
    case 'file':
      return 'application/octet-stream';
    default:
      return '';
  }
};

/**
 * Creates a list of enabled headers for the request, ensuring no duplicate content-type headers.
 *
 * @param request - The request object.
 * @param headers - The array of header objects, each containing name, value, and enabled properties.
 * @returns An array of enabled headers with normalized names and values.
 */
const createHeaders = (request: HarRequest, headers: Header[]): Array<{ name: string; value: string }> => {
  const enabledHeaders = headers
    .filter((header) => header.enabled)
    .map((header) => ({
      name: header.name.toLowerCase(),
      value: header.value
    }));

  const contentType = createContentType(request.body?.mode);
  if (contentType !== '' && !enabledHeaders.some((header) => header.name === 'content-type')) {
    enabledHeaders.push({ name: 'content-type', value: contentType });
  }

  return enabledHeaders;
};

interface FormParam {
  name: string;
  value: string;
  enabled?: boolean;
  type?: string;
}

interface FileParam {
  name?: string;
  filePath?: string;
  contentType?: string;
  selected?: boolean;
}

const createQuery = (
  queryParams: Array<{ name: string; value: string; enabled: boolean; type: string }> = [],
  request: HarRequest
): Array<{ name: string; value: string }> => {
  const params = queryParams
    .filter((param) => param.enabled && param.type === 'query')
    .map((param) => ({
      name: param.name,
      value: param.value
    }));

  if (request?.auth?.mode === 'apikey'
    && request?.auth?.apikey?.placement === 'queryparams'
    && request?.auth?.apikey?.key
    && request?.auth?.apikey?.value) {
    params.push({
      name: request.auth.apikey.key,
      value: request.auth.apikey.value
    });
  }

  return params;
};

const createPostData = (body: RequestBody) => {
  const contentType = createContentType(body.mode);
  const mode = body.mode as string;

  switch (body.mode) {
    case 'formUrlEncoded': {
      const formParams = (Array.isArray(body[mode]) ? body[mode] : []) as FormParam[];
      return {
        mimeType: contentType,
        text: new URLSearchParams(
          formParams
            .filter((param) => param?.enabled)
            .reduce<Record<string, string>>((acc, param) => {
              acc[param.name] = param.value;
              return acc;
            }, {})
        ).toString(),
        params: formParams
          .filter((param) => param?.enabled)
          .map((param) => ({
            name: param.name,
            value: param.value
          }))
      };
    }
    case 'multipartForm': {
      const multipartParams = (Array.isArray(body[mode]) ? body[mode] : []) as FormParam[];
      return {
        mimeType: contentType,
        params: multipartParams
          .filter((param) => param?.enabled)
          .map((param) => ({
            name: param.name,
            value: param.value,
            ...(param.type === 'file' && { fileName: param.value })
          }))
      };
    }
    case 'file': {
      const files = (Array.isArray(body[mode]) ? body[mode] : []) as FileParam[];
      const selectedFile = files.find((param) => param.selected) || files[0];
      const filePath = selectedFile?.filePath || '';
      return {
        mimeType: selectedFile?.contentType || 'application/octet-stream',
        text: filePath,
        params: filePath
          ? [
              {
                name: selectedFile?.name || 'file',
                value: filePath,
                fileName: filePath,
                contentType: selectedFile?.contentType || 'application/octet-stream'
              }
            ]
          : []
      };
    }
    case 'graphql':
      return {
        mimeType: contentType,
        text: JSON.stringify(body[mode])
      };
    default:
      return {
        mimeType: contentType,
        text: body[mode] as string
      };
  }
};

interface BuildHarRequestParams {
  request: HarRequest;
  headers: Header[];
}

export const buildHarRequest = ({ request, headers }: BuildHarRequestParams) => {
  // NOTE:
  // This is just a safety check.
  // The interpolateUrlPathParams method validates the url, but it does not throw
  if (!URL.canParse(request.url)) {
    throw new Error('invalid request url');
  }

  return {
    method: request.method,
    url: request.url,
    httpVersion: 'HTTP/1.1',
    cookies: [] as unknown[],
    headers: createHeaders(request, headers),
    queryString: createQuery(request.params, request),
    postData: createPostData(request.body || {}),
    headersSize: 0,
    bodySize: 0,
    binary: true
  };
};
