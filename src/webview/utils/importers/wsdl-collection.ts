import { BrunoError } from 'utils/common/error';
import { isWSDLCollection } from '../../../utils/collection';

export const wsdlToBruno = async (data: string) => {
  try {
    return await window.ipcRenderer.invoke('renderer:convert-wsdl-to-bruno', data);
  } catch (err: any) {
    console.error('Error converting WSDL to Bruno:', err);
    throw new BrunoError('Import collection failed: ' + err.message);
  }
};

export { isWSDLCollection };
