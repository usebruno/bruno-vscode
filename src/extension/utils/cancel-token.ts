const cancelTokens: Record<string, AbortController> = {};

export const saveCancelToken = (uid: string, abortController: AbortController): void => {
  cancelTokens[uid] = abortController;
};

export const deleteCancelToken = (uid: string): void => {
  delete cancelTokens[uid];
};

export { cancelTokens };
