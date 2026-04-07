import { uuid, generateUidBasedOnHash } from '../utils/common';

interface Example {
  uid?: string;
  [key: string]: unknown;
}

const requestUids = new Map<string, string>();
const exampleUids = new Map<string, string>();

export const getRequestUid = (pathname: string): string => {
  let uid = requestUids.get(pathname);

  if (!uid) {
    // Use hash-based UID to ensure deterministic matching between
    // extension (which sends itemUid) and collection items
    uid = generateUidBasedOnHash(pathname);
    requestUids.set(pathname, uid);
  }

  return uid;
};

export const moveRequestUid = (oldPathname: string, newPathname: string): void => {
  const uid = requestUids.get(oldPathname);

  if (uid) {
    requestUids.delete(oldPathname);
    requestUids.set(newPathname, uid);
  }
};

export const deleteRequestUid = (pathname: string): void => {
  requestUids.delete(pathname);
};

export const getExampleUid = (pathname: string, index: number): string => {
  let uid = exampleUids.get(`${pathname}-${index}`);

  if (!uid) {
    uid = uuid();
    exampleUids.set(`${pathname}-${index}`, uid);
  }

  return uid;
};

/**
 * Syncs the example UID cache with the current state of examples being saved.
 * This ensures the cache stays consistent when examples are added, deleted, or reordered.
 */
export const syncExampleUidsCache = (pathname: string, examples: Example[] = []): void => {
  for (const key of exampleUids.keys()) {
    if (key.startsWith(`${pathname}-`)) {
      exampleUids.delete(key);
    }
  }

  examples.forEach((example, index) => {
    if (example.uid) {
      exampleUids.set(`${pathname}-${index}`, example.uid);
    }
  });
};
