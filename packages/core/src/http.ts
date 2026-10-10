import { JevHttpError, JevResponseError, JevTimeoutError } from './errors.js';

/** Per-attempt timeout used when none is given. */
export const DEFAULT_TIMEOUT_MS = 30_000;

export interface PostJsonOptions {
  /** total attempts, including the first. Default 4. */
  maxAttempts?: number;
  /** per-attempt timeout in ms. Default 30 000. */
  timeoutMs?: number;
  /** cancels the request and any retry backoff; rejects with the signal's reason. */
  signal?: AbortSignal;
}

/**
 * Minimal POST-JSON helper with the retry policy TypeSafe's docs recommend:
 * exponential backoff on 429 (rate limited) and 529 (overloaded). Each attempt is
 * bounded by an AbortSignal timeout so a hung connection can't stall the caller.
 *
 * The 4th argument also accepts a bare number, read as `maxAttempts`, matching the
 * older standalone copies of this client.
 */
export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  opts: PostJsonOptions | number = {},
): Promise<unknown> {
  const { maxAttempts = 4, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = typeof opts === 'number' ? { maxAttempts: opts } : opts;
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
  for (let attempt = 1; ; attempt++) {
    const res = await fetchOnce(url, init, timeoutMs, signal);
    if (res.ok) return parseBody(await res.text());
    const error = new JevHttpError(res.status, await res.text());
    if (!error.retryable || attempt >= maxAttempts) throw error;
    await sleep(250 * 2 ** (attempt - 1), signal);
  }
}

async function fetchOnce(url: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  try {
    return await fetch(url, { ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  } catch (err) {
    if (timeout.aborted && !signal?.aborted) throw new JevTimeoutError(timeoutMs, { cause: err });
    throw err;
  }
}

function parseBody(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    throw new JevResponseError(`Jev response is not valid JSON: ${text.slice(0, 200)}`, { cause: err });
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
