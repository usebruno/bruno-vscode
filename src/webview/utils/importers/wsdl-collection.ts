import { BrunoError } from 'utils/common/error';

export const wsdlToBruno = async (data: string) => {
  try {
    return await window.ipcRenderer.invoke('renderer:convert-wsdl-to-bruno', data);
  } catch (err: any) {
    console.error('Error converting WSDL to Bruno:', err);
    throw new BrunoError('Import collection failed: ' + err.message);
  }
};

const isWSDLCollection = (data: any) => {
  if (typeof data !== 'string') {
    return false;
  }

  const wsdlIndicators = [
    'wsdl:definitions',
    'definitions',
    'wsdl:types',
    'wsdl:message',
    'wsdl:portType',
    'wsdl:binding',
    'wsdl:service'
  ];

  const hasWSDLNamespace = data.includes('xmlns:wsdl=')
    || data.includes('xmlns="http://schemas.xmlsoap.org/wsdl/"')
    || data.includes('xmlns="http://www.w3.org/2001/XMLSchema"');

  const hasWSDLElements = wsdlIndicators.some((indicator) => data.includes(indicator));

  return hasWSDLNamespace || hasWSDLElements;
};

export { isWSDLCollection };
