import { afterEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter, withCache, withRateLimit, type JevProvider, type JevRequest } from '../src/index.js';

const res = { model: 'm', answers: { q: { type: 'noul' as const, noul: 0.5 } } };

function stubProvider(...results: Array<'ok' | Error>) {
  const evaluate = vi.fn<JevProvider['evaluate']>();
  for (const r of results) {
    if (r === 'ok') evaluate.mockResolvedValueOnce(res);
    else evaluate.mockRejectedValueOnce(r);
  }
  return { evaluate };
}

const req = (state: unknown): JevRequest => ({ state, questions: { q: { type: 'noul', instructions: 'Q?' } } });

afterEach(() => {
  vi.useRealTimers();
});

describe('withCache', () => {
  it('reuses a response for the same request regardless of key order', async () => {
    const inner = stubProvider('ok');
    const cached = withCache(inner);
    await cached.evaluate(req({ a: 1, b: 2 }));
    await expect(cached.evaluate(req({ b: 2, a: 1 }))).resolves.toBe(res);
    expect(inner.evaluate).toHaveBeenCalledTimes(1);
  });

  it('does not cache failures', async () => {
    const cached = withCache(stubProvider(new Error('boom'), 'ok'));
    await expect(cached.evaluate(req(1))).rejects.toThrow('boom');
    await expect(cached.evaluate(req(1))).resolves.toBe(res);
  });

  it('accepts a caller-supplied cache and forwards evaluate options', async () => {
    const store = new Map();
    const inner = stubProvider('ok');
    const signal = new AbortController().signal;
    await withCache(inner, store).evaluate(req(1), { signal });
    expect(store.size).toBe(1);
    expect(inner.evaluate).toHaveBeenCalledWith(req(1), { signal });
  });
});

describe('withRateLimit', () => {
  it('acquires the limiter before each call', async () => {
    const limiter = new RateLimiter(0);
    const acquire = vi.spyOn(limiter, 'acquire');
    const inner = stubProvider('ok');
    await withRateLimit(inner, limiter).evaluate(req(1));
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(inner.evaluate).toHaveBeenCalledTimes(1);
  });
});

describe('RateLimiter', () => {
  it('spaces acquisitions evenly', async () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter(600); // one per 100 ms
    await limiter.acquire();
    let second = false;
    void limiter.acquire().then(() => (second = true));
    await vi.advanceTimersByTimeAsync(99);
    expect(second).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(second).toBe(true);
  });
});
