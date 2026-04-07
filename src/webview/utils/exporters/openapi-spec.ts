import React from 'react';
import jsyaml from 'js-yaml';
import { interpolate } from '@usebruno/common';
import { isValidUrl } from 'utils/url/index';

interface xml2jsProps {
  variables?: unknown;
  items?: unknown[];
  name: unknown;
}

const xml2js = require('xml2js');

export const exportApiSpec = ({
  variables,
  items,
  name
}: any) => {
  items = items.filter((item: any) => !['grpc-request'].includes(item.type));

  const components: {
    schemas: Record<string, any>;
    requestBodies: Record<string, any>;
    securitySchemes: Record<string, any>;
  } = {
    schemas: {},
    requestBodies: {},
    securitySchemes: {}
  };

  const servers: any = [];
  const warnings: any = [];

  const addWarning = (message: any, itemName: any) => {
    warnings.push({
      message,
      itemName
    });
  };

  const addUrlToServersList = (url: any) => {
    if (!servers?.find((s: any) => s?.url === url)) {
      servers.push({ url });
    }
  };

  const extractTagFromDepth = (item: any) => {
    const { pathname, depth } = item;
    if (!pathname) return;

    const parts = pathname.split('\\');
    const baseDepth = parts.length - depth;
    if (depth === 1) return '';

    const tagIndex = Math.max(baseDepth, 0);

    return parts[tagIndex];
  };

  const generatePaths = () => {
    const _items = items.map((item: any) => {
      let url = interpolate(item?.request?.url, variables);
      if (isValidUrl(url)) {
        let urlDetails = new URL(url);
        urlDetails?.pathname && (url = urlDetails?.pathname);
        urlDetails?.origin && addUrlToServersList(urlDetails?.origin);
      }
      const { request } = item;
      const { method, params = [], headers = [], body, auth } = request || {};

      const pathParamsRegex = /(?<!{){([^{}]+)}(?!})/g;

      const pathMatches = url.match(pathParamsRegex) || [];

      const parameters = [
        ...params?.map((param: any) => ({
          name: param?.name,
          in: 'query',
          description: '',
          required: param?.enabled,
          example: param?.value
        })),
        ...headers?.map((header: any) => ({
          name: header?.name,
          in: 'header',
          description: '',
          required: header?.enabled,
          example: header?.value
        })),
        ...pathMatches?.map((path: any) => ({
          name: path.slice(1, path.length - 1),
          in: 'path',
          required: true
        }))
      ];

      const pathBody: Record<string, any> = {
        summary: item?.name,
        operationId: item?.name,
        description: '',
        tags: [extractTagFromDepth(item)],
        responses: {
          200: {
            description: ''
          }
        }
      };

      if (parameters?.length) {
        pathBody['parameters'] = parameters;
      }

      let schemaId = `${item?.name?.split(' ').join('_').toLowerCase()}`;
      let securitySchemaId = `${item?.name?.split(' ').join('_').toLowerCase()}`;
      let requestBodyId = `${item?.name?.split(' ').join('_').toLowerCase()}`;
      if (body?.mode) {
        switch (body?.mode) {
          case 'json':
            if (!body?.json) break;
            try {
              const parsedJson = JSON.parse(body.json);
              components.schemas[schemaId] = generateProperyShape(parsedJson);
              components.requestBodies[requestBodyId] = {
                content: {
                  'application/json': {
                    schema: {
                      $ref: `#/components/schemas/${schemaId}`
                    }
                  }
                },
                description: '',
                required: true
              };
              pathBody['requestBody'] = {
                $ref: `#/components/requestBodies/${requestBodyId}`
              };
            } catch (error) {
              addWarning(`Failed to parse JSON in request body: ${error.message}`, item?.name);
              components.schemas[schemaId] = {
                type: 'object',
                properties: {}
              };
              components.requestBodies[requestBodyId] = {
                content: {
                  'application/json': {
                    schema: {
                      $ref: `#/components/schemas/${schemaId}`
                    }
                  }
                },
                description: '',
                required: true
              };
              pathBody['requestBody'] = {
                $ref: `#/components/requestBodies/${requestBodyId}`
              };
            }
            break;
          case 'xml':
            if (!body?.xml) break;
            try {
              const jsonResult = xmlToJson(body?.xml);
              if (!jsonResult) {
                addWarning('Failed to parse XML in request body', item?.name);
                break;
              }
              components.schemas[schemaId] = generateProperyShape(jsonResult);
              components.requestBodies[requestBodyId] = {
                content: {
                  'application/xml': {
                    schema: {
                      $ref: `#/components/schemas/${schemaId}`
                    }
                  }
                },
                description: '',
                required: true
              };
              pathBody['requestBody'] = {
                $ref: `#/components/requestBodies/${requestBodyId}`
              };
            } catch (error) {
              addWarning(`Failed to parse XML in request body: ${error.message}`, item?.name);
            }
            break;
          case 'multipartForm':
            if (!body?.multipartForm) return;
            let multipartFormToKeyValue = body?.multipartForm.reduce((acc: any, f: any) => {
              acc[f?.name] = f.value;
              return acc;
            }, {});
            components.schemas[schemaId] = generateProperyShape(multipartFormToKeyValue);
            components.requestBodies[requestBodyId] = {
              content: {
                'multipart/form-data:': {
                  schema: {
                    $ref: `#/components/schemas/${schemaId}`
                  }
                }
              },
              description: '',
              required: true
            };
            pathBody['requestBody'] = {
              $ref: `#/components/requestBodies/${requestBodyId}`
            };
          case 'formUrlEncoded':
            if (!body?.formUrlEncoded) return;
            let formUrlEncodedToKeyValue = body?.formUrlEncoded.reduce((acc: any, f: any) => {
              acc[f?.name] = f.value;
              return acc;
            }, {});
            components.schemas[schemaId] = generateProperyShape(formUrlEncodedToKeyValue);
            components.requestBodies[requestBodyId] = {
              content: {
                'application/x-www-form-urlencoded:': {
                  schema: {
                    $ref: `#/components/schemas/${schemaId}`
                  }
                }
              },
              description: '',
              required: true
            };
            pathBody['requestBody'] = {
              $ref: `#/components/requestBodies/${requestBodyId}`
            };
          case 'text':
            if (!body?.text) return;
            pathBody['requestBody'] = {
              content: {
                'text/plain': {
                  schema: {
                    type: 'string'
                  }
                }
              }
            };
          default:
            break;
        }
      }

      if (auth?.mode) {
        switch (auth?.mode) {
          case 'basic':
            components.securitySchemes[securitySchemaId] = {
              type: 'http',
              scheme: 'basic'
            };
            pathBody['security'] = {
              [securitySchemaId]: []
            };
            break;
          case 'bearer':
            components.securitySchemes[securitySchemaId] = {
              type: 'http',
              scheme: 'bearer'
            };
            pathBody['security'] = {
              [securitySchemaId]: []
            };
            break;
          case 'oauth2':
            if (!auth?.oauth2?.grantType) break;
            const { authorizationUrl, accessTokenUrl, callbackUrl, scope } = auth?.oauth2;
            switch (auth?.oauth2?.grantType) {
              case 'authorization_code':
                components.securitySchemes[securitySchemaId] = {
                  type: 'oauth2',
                  flows: {
                    authorizationCode: {
                      authorizationUrl,
                      tokenUrl: accessTokenUrl,
                      ...(scope.length > 0
                        ? {
                            scopes: {
                              [scope]: ''
                            }
                          }
                        : {})
                    }
                  }
                };
                pathBody['security'] = {
                  [securitySchemaId]: []
                };
                break;
              case 'password':
                components.securitySchemes[securitySchemaId] = {
                  type: 'oauth2',
                  flows: {
                    password: {
                      tokenUrl: accessTokenUrl,
                      ...(scope.length > 0
                        ? {
                            scopes: {
                              [scope]: ''
                            }
                          }
                        : {})
                    }
                  }
                };
                pathBody['security'] = {
                  [securitySchemaId]: []
                };
                break;
              case 'client_credentials':
                components.securitySchemes[securitySchemaId] = {
                  type: 'oauth2',
                  flows: {
                    password: {
                      tokenUrl: accessTokenUrl,
                      ...(scope.length > 0
                        ? {
                            scopes: {
                              [scope]: ''
                            }
                          }
                        : {})
                    }
                  }
                };
                pathBody['security'] = {
                  [securitySchemaId]: []
                };
                break;
            }
            break;
          case 'awsv4':
            components.securitySchemes[securitySchemaId] = {
              'type': 'apiKey',
              'name': 'Authorization',
              'in': 'header',
              'x-amazon-apigateway-authtype': 'awsSigv4'
            };
            pathBody['security'] = {
              [securitySchemaId]: []
            };
            break;
          case 'digest':
            components.securitySchemes[securitySchemaId] = {
              type: 'digest',
              scheme: 'digest',
              description: 'Digest Authentication'
            };
            pathBody['security'] = {
              [securitySchemaId]: []
            };
            break;
          default:
            break;
        }
      }

      return {
        url,
        method: method.toLowerCase(),
        data: pathBody
      };
    });

    return _items.reduce((acc: any, item: any) => {
      if (!acc[item?.url]) {
        acc[item?.url] = {};
      }
      acc[item?.url][item?.method] = item?.data;
      return acc;
    }, {});
  };

  const collectionToExport: Record<string, any> = {};
  collectionToExport.openapi = '3.0.0';
  collectionToExport.info = generateInfoSection(name);
  collectionToExport.paths = generatePaths();
  collectionToExport.servers = servers;
  collectionToExport.components = components;

  let yaml = jsyaml.dump(collectionToExport);

  return {
    content: yaml,
    warnings
  };
};

const xmlToJson = (xmlString: string): unknown => {
  const parser = new xml2js.Parser({ explicitArray: false, trim: true });
  let jsonResult: unknown = null;

  parser.parseString(xmlString, (err: Error | null, result: unknown) => {
    if (err) {
      throw err;
    } else {
      jsonResult = result;
    }
  });

  return jsonResult;
};

const generateInfoSection = (name: any) => {
  return {
    title: name,
    version: '1.0.0'
  };
};

const generateProperyShape = (obj: any) => {
  let data: Record<string, any> = {};

  if (Array.isArray(obj)) {
    data['type'] = 'array';
    data['items'] = {
      type: 'string'
    };
  } else {
    data['type'] = typeof obj;
  }

  let properties: any = null;
  if (obj && typeof obj == 'object') {
    properties = {};
    let keys = Object.keys(obj);
    keys.forEach((key) => {
      let value = obj[key];
      properties[key] = generateProperyShape(value);
    });
    if (keys.length) {
      data['properties'] = properties;
    }
  }
  return data;
};
