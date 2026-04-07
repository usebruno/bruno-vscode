import React from 'react';
// we maintain cancel tokens for a request separately as redux does not recommend to store
// non-serializable value in the store

const cancelTokens: Record<string, any> = {};

export default cancelTokens;

export const saveCancelToken = (uid: any, axiosRequest: any) => {
  cancelTokens[uid] = axiosRequest;
};

export const deleteCancelToken = (uid: any) => {
  delete cancelTokens[uid];
};
