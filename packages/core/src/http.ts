import { JevHttpError, JevResponseError, JevTimeoutError } from './errors.js';

export interface PostJsonOptions {
  /** total attempts, including the first. Default 4. */
  maxAttempts?: number;
  /** per-attempt timeout in ms. Default 30 000. */
  timeoutMs?: number;
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
  const { maxAttempts = 4, timeoutMs = 30_000 } = typeof opts === 'number' ? { maxAttempts: opts } : opts;
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
  for (let attempt = 1; ; attempt++) {
    const res = await fetchOnce(url, init, timeoutMs);
    if (res.ok) return parseBody(await res.text());
    const error = new JevHttpError(res.status, await res.text());
    if (!error.retryable || attempt >= maxAttempts) throw error;
    await sleep(250 * 2 ** (attempt - 1));
  }
}

async function fetchOnce(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') throw new JevTimeoutError(timeoutMs, { cause: err });
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
