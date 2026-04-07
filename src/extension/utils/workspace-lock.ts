const locks = new Map<string, Promise<void>>();

export const acquireLock = async (key: string, timeout = 10000): Promise<() => void> => {
  const startTime = Date.now();

  while (locks.has(key)) {
    if (Date.now() - startTime > timeout) {
      throw new Error(`Lock acquisition timeout for: ${key}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  let releaseFn: () => void;
  const releasePromise = new Promise<void>((resolve) => {
    releaseFn = resolve;
  });

  locks.set(key, releasePromise);

  return () => {
    locks.delete(key);
    releaseFn!();
  };
};

export const withLock = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  const release = await acquireLock(key);
  try {
    return await fn();
  } finally {
    release();
  }
};

export const getWorkspaceLockKey = (workspacePath: string): string => {
  return `workspace:${workspacePath}`;
};
