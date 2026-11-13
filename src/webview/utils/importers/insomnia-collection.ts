import { BrunoError } from 'utils/common/error';

export const convertInsomniaToBruno = async (data: any) => {
  try {
    return await window.ipcRenderer.invoke('renderer:convert-insomnia-to-bruno', data);
  } catch (err: any) {
    console.error('Error converting Insomnia to Bruno:', err);
    throw new BrunoError('Import collection failed: ' + err.message);
  }
};

export { isInsomniaCollection } from '../../../utils/collection';
