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
 */
export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  opts: PostJsonOptions = {},
): Promise<unknown> {
  const maxAttempts = opts.maxAttempts ?? 4;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new Error(`Jev request timed out after ${timeoutMs} ms`, { cause: err });
      }
      throw err;
    }

    if (res.ok) {
      const text = await res.text();
      try {
        return JSON.parse(text) as unknown;
      } catch (err) {
        throw new Error(`Jev response is not valid JSON: ${text.slice(0, 200)}`, { cause: err });
      }
    }

    const retryable = res.status === 429 || res.status === 529;
    if (retryable && attempt < maxAttempts) {
      await sleep(250 * 2 ** (attempt - 1));
      continue;
    }
    throw new Error(`Jev request failed: ${res.status} ${await res.text()}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
