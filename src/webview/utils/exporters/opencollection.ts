import React from 'react';
import * as FileSaver from 'file-saver';
import jsyaml from 'js-yaml';
import { brunoToOpencollection as brunoToOpenCollection } from '@usebruno/converters';
import { sanitizeName } from 'utils/common/regex';

interface OpenCollection {
  extensions?: {
    bruno?: {
      exportedAt?: string;
      exportedUsing?: string;
      [key: string]: any;
    };
    [key: string]: any;
  };
  [key: string]: any;
}

export const exportCollection = (collection: any, version: any) => {
  const openCollection = brunoToOpenCollection(collection) as OpenCollection;

  if (!openCollection.extensions) {
    openCollection.extensions = {};
  }
  if (!openCollection.extensions.bruno) {
    openCollection.extensions.bruno = {};
  }
  openCollection.extensions.bruno.exportedAt = new Date().toISOString();
  openCollection.extensions.bruno.exportedUsing = version ? `Bruno/${version}` : 'Bruno';

  const yamlContent = jsyaml.dump(openCollection, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false
  });

  const sanitizedName = sanitizeName(collection.name);
  const fileName = `${sanitizedName}.yml`;
  const fileBlob = new Blob([yamlContent], { type: 'application/x-yaml' });

  FileSaver.saveAs(fileBlob, fileName);
};

export default exportCollection;
