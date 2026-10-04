/** Base class for every error this package throws, so callers can catch Jev failures as one kind. */
export class JevError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'JevError';
  }
}

/** The provider answered with a non-2xx status (after retries, for 429/529). */
export class JevHttpError extends JevError {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Jev request failed: ${status} ${body}`);
    this.name = 'JevHttpError';
  }

  /** True for the statuses TypeSafe's docs say to retry: 429 (rate limited) and 529 (overloaded). */
  get retryable(): boolean {
    return this.status === 429 || this.status === 529;
  }
}

/** A single attempt exceeded its timeout. */
export class JevTimeoutError extends JevError {
  constructor(
    readonly timeoutMs: number,
    options?: ErrorOptions,
  ) {
    super(`Jev request timed out after ${timeoutMs} ms`, options);
    this.name = 'JevTimeoutError';
  }
}

/** The provider answered 2xx, but the body is not JSON or has no usable `answers` object. */
export class JevResponseError extends JevError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'JevResponseError';
  }
}
