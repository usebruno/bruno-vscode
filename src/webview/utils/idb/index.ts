import React from 'react';
export const saveCollectionToIdb = (connection: any, collection: any) => {
  return new Promise((resolve, reject) => {
    connection
      .then((db: any) => {
        let tx = db.transaction(`collection`, 'readwrite');
        let collectionStore = tx.objectStore('collection');

        collectionStore.put(collection);

        resolve(collection);
      })
      .catch((err: any) => reject(err));
  });
};

export const getCollectionsFromIdb = (connection: any) => {
  return new Promise((resolve, reject) => {
    connection
      .then((db: any) => {
        let tx = db.transaction('collection');
        let collectionStore = tx.objectStore('collection');
        return collectionStore.getAll();
      })
      .then((collections: any) => {
        if (!Array.isArray(collections)) {
          return new Error('IDB Corrupted');
        }

        return resolve(collections);
      })
      .catch((err: any) => reject(err));
  });
};
