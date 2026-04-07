import toast from 'react-hot-toast';

export type BrunoErrorLevel = 'warning' | 'error';

export class BrunoError extends Error {
  level: BrunoErrorLevel;

  constructor(message: string, level?: BrunoErrorLevel) {
    super(message);
    this.name = 'BrunoError';
    this.level = level || 'error';
  }
}

export const parseError = (error: unknown, defaultErrorMsg = 'An error occurred'): string => {
  if (error instanceof BrunoError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message || defaultErrorMsg;
  }

  if (typeof error === 'string') {
    return error;
  }

  return defaultErrorMsg;
};

export const toastError = (error: unknown, defaultErrorMsg = 'An error occurred') => {
  const errorMsg = parseError(error, defaultErrorMsg);

  if (error instanceof BrunoError) {
    if (error.level === 'warning') {
      return toast(errorMsg, {
        icon: '⚠️',
        duration: 3000
      });
    }
    return toast.error(errorMsg, {
      duration: 3000
    });
  }

  return toast.error(errorMsg);
};

export function formatIpcError(error: unknown): string {
  if (!(error instanceof Error)) {
    return typeof error === 'string' ? error : '';
  }
  if (!error?.message) return ''; // Avoid returning `null` or `undefined`
  // https://github.com/electron/electron/blob/659e79fc08c6ffc2f7506dd1358918d97d240147/lib/renderer/api/ipc-renderer.ts#L24-L30
  // There is no other way to get rid of this error prefix as of now.
  return error.message.replace(/^Error invoking remote method '.+?': (Error: )?/, '');
}
