import React from 'react';
export const setupPolyfills = () => {
  // polyfill required to make react-pdf
  if (typeof Promise.withResolvers === 'undefined') {
    const createWithResolvers = <T>(): PromiseWithResolvers<T> => {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };

    if (typeof window !== 'undefined') {
      (window.Promise as unknown as { withResolvers: typeof createWithResolvers }).withResolvers = createWithResolvers;
    } else {
      (global.Promise as unknown as { withResolvers: typeof createWithResolvers }).withResolvers = createWithResolvers;
    }
  }
};
