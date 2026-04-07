import { BrunoError } from 'utils/common/error';

export const convertOpenapiToBruno = async (data: any, options = {}) => {
  try {
    return await window.ipcRenderer.invoke('renderer:convert-openapi-to-bruno', data, options);
  } catch (err: any) {
    console.error('Error converting OpenAPI to Bruno:', err);
    throw new BrunoError('Import collection failed: ' + err.message);
  }
};

export const isOpenApiSpec = (data: any) => {
  if (typeof data.info !== 'object' || data.info === null) {
    return false;
  }

  if (typeof data.openapi === 'string' && data.openapi.trim().length) {
    return true;
  }

  if (typeof data.swagger === 'string' && data.swagger.trim().length) {
    return true;
  }

  return false;
};
