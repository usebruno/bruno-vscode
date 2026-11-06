import { BrunoError } from 'utils/common/error';
import { safeParseJSON } from 'utils/common/index';
import { isPostmanCollection } from '../../../utils/collection';

const readFile = (files: FileList) => {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();
    fileReader.onload = (e) => {
      const result = e.target?.result;
      resolve(safeParseJSON(typeof result === 'string' ? result : null));
    };
    fileReader.onerror = (err) => reject(err);
    fileReader.readAsText(files[0]);
  });
};

const postmanToBruno = (collection: any) => {
  return new Promise((resolve, reject) => {
    window.ipcRenderer.invoke('renderer:convert-postman-to-bruno', collection)
      .then((result) => resolve(result))
      .catch((err) => {
        console.error('Error converting Postman to Bruno via Electron:', err);
        reject(new BrunoError('Conversion failed'));
      });
  });
};

export { postmanToBruno, readFile, isPostmanCollection };
