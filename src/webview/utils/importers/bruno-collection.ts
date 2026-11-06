import React from 'react';
import { BrunoError } from 'utils/common/error';
import { validateSchema, transformItemsInCollection, updateUidsInCollection, hydrateSeqInCollection } from './common';

const stripExportMetadata = (collection: any) => {
  delete collection.exportedAt;
  delete collection.exportedUsing;
  return collection;
};

export const processBrunoCollection = async (jsonData: any) => {
  try {
    let collection = stripExportMetadata(jsonData);
    collection = hydrateSeqInCollection(collection);
    collection = updateUidsInCollection(collection);
    collection = transformItemsInCollection(collection);
    await validateSchema(collection);
    return collection;
  } catch (err) {
    console.error('Error processing Bruno collection:', err);
    throw new BrunoError('Import collection failed');
  }
};

export { isBrunoCollection } from '../../../utils/collection';
