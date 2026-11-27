/** Thrown when a request is aborted */
export class RequestCancelledError extends Error {
  // Declared here because the extension's ES2021 lib has no ErrorOptions/`cause`.
  constructor(readonly cause: unknown) {
    super('Request cancelled');
    this.name = 'RequestCancelledError';
  }
}
