import { BrunoError } from 'utils/common/error';

export const convertOpenapiToBruno = async (data: any, options = {}) => {
  try {
    return await window.ipcRenderer.invoke('renderer:convert-openapi-to-bruno', data, options);
  } catch (err: any) {
    console.error('Error converting OpenAPI to Bruno:', err);
    throw new BrunoError('Import collection failed: ' + err.message);
  }
};

export { isOpenApiSpec } from '../../../utils/collection';
