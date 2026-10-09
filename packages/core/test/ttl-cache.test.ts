import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTtlCache } from '../src/index.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('createTtlCache', () => {
  it('expires entries after ttlMs', () => {
    vi.useFakeTimers();
    const cache = createTtlCache<number>({ ttlMs: 100 });
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    vi.advanceTimersByTime(100);
    expect(cache.get('a')).toBeUndefined();
  });

  it('evicts the least recently used entry on overflow', () => {
    const cache = createTtlCache<number>({ max: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // a is now most recent
    cache.set('c', 3);
    expect([cache.get('a'), cache.get('b'), cache.get('c')]).toEqual([1, undefined, 3]);
  });

  it('overwrites an existing key without evicting another', () => {
    const cache = createTtlCache<number>({ max: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10);
    expect([cache.get('a'), cache.get('b')]).toEqual([10, 2]);
  });
});
