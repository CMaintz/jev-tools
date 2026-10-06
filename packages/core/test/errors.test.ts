import { afterEach, describe, expect, it, vi } from 'vitest';
import { JevError, JevHttpError, JevResponseError, JevTimeoutError, parseJevResponse, postJson } from '../src/index.js';

function stubFetch(impl: typeof fetch) {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('typed errors', () => {
  it('throws JevHttpError with status and body on a non-retryable status', async () => {
    stubFetch(async () => new Response('bad key', { status: 401 }));
    const err = await postJson('https://x.test', {}, {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JevHttpError);
    expect(err).toBeInstanceOf(JevError);
    expect(err).toMatchObject({ name: 'JevHttpError', status: 401, body: 'bad key', retryable: false });
  });

  it('marks 429 and 529 as retryable', () => {
    expect(new JevHttpError(429, '').retryable).toBe(true);
    expect(new JevHttpError(529, '').retryable).toBe(true);
    expect(new JevHttpError(500, '').retryable).toBe(false);
  });

  it('throws JevTimeoutError carrying the timeout and the abort cause', async () => {
    stubFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const err = await postJson('https://x.test', {}, {}, { timeoutMs: 10 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JevTimeoutError);
    expect(err).toMatchObject({ name: 'JevTimeoutError', timeoutMs: 10 });
    expect((err as Error).cause).toBeInstanceOf(Error);
  });

  it('throws JevResponseError for a non-JSON body and a missing answers object', async () => {
    stubFetch(async () => new Response('<html/>', { status: 200 }));
    await expect(postJson('https://x.test', {}, {})).rejects.toBeInstanceOf(JevResponseError);
    expect(() => parseJevResponse({}, {})).toThrow(JevResponseError);
  });

  it('leaves network errors untyped so callers see the original failure', async () => {
    stubFetch(async () => {
      throw new TypeError('fetch failed');
    });
    const err = await postJson('https://x.test', {}, {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect(err).not.toBeInstanceOf(JevError);
  });
});

describe('postJson positional maxAttempts', () => {
  it('reads a bare number as maxAttempts', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('', { status: 529 }));
    vi.stubGlobal('fetch', fetchMock);
    const assertion = expect(postJson('https://x.test', {}, {}, 2)).rejects.toThrow(JevHttpError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
