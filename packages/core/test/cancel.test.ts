import { afterEach, describe, expect, it, vi } from 'vitest';
import { JevTimeoutError, postJson, TypeSafeProvider } from '../src/index.js';

/** fetch that never settles until its signal aborts. */
function hangingFetch() {
  const fn = vi.fn<typeof fetch>(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cancellation', () => {
  it('never starts a request once the signal has aborted', async () => {
    const fetchMock = hangingFetch();
    const p = postJson('https://x.test', {}, {}, { signal: AbortSignal.abort(new Error('too late')) });
    await expect(p).rejects.toThrow('too late');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects with the caller abort reason, not a timeout', async () => {
    hangingFetch();
    const ctl = new AbortController();
    const p = postJson('https://x.test', {}, {}, { signal: ctl.signal });
    ctl.abort(new Error('user cancelled'));
    await expect(p).rejects.toThrow('user cancelled');
  });

  it('still times out when a signal is passed but not aborted', async () => {
    hangingFetch();
    const p = postJson('https://x.test', {}, {}, { signal: new AbortController().signal, timeoutMs: 20 });
    await expect(p).rejects.toBeInstanceOf(JevTimeoutError);
  });

  it('aborts during retry backoff without another attempt', async () => {
    const fn = vi.fn<typeof fetch>(async () => new Response('', { status: 429 }));
    vi.stubGlobal('fetch', fn);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const ctl = new AbortController();
    const p = postJson('https://x.test', {}, {}, { signal: ctl.signal });
    const assertion = expect(p).rejects.toThrow('stop');
    await vi.advanceTimersByTimeAsync(100); // inside the first 250 ms backoff
    ctl.abort(new Error('stop'));
    await assertion;
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('skips the backoff when the signal aborted during the attempt', async () => {
    const ctl = new AbortController();
    const fn = vi.fn<typeof fetch>(async () => {
      ctl.abort(new Error('early'));
      return new Response('', { status: 529 });
    });
    vi.stubGlobal('fetch', fn);
    await expect(postJson('https://x.test', {}, {}, { signal: ctl.signal })).rejects.toThrow('early');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('providers forward the signal to fetch', async () => {
    const fn = hangingFetch();
    const ctl = new AbortController();
    const p = new TypeSafeProvider('k').evaluate({ state: 1, questions: {} }, { signal: ctl.signal });
    ctl.abort(new Error('bye'));
    await expect(p).rejects.toThrow('bye');
    expect(fn.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
