export interface TtlCache<V> {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
}

export interface TtlCacheOptions {
  /** how long an entry lives, in ms. Default 60 000. */
  ttlMs?: number;
  /** max entries; the least recently used is evicted on overflow. Default 1000. */
  max?: number;
}

/** In-memory TTL cache with a size cap. Reads refresh recency; expired entries are dropped on read. */
export function createTtlCache<V>(opts: TtlCacheOptions = {}): TtlCache<V> {
  const ttlMs = opts.ttlMs ?? 60_000;
  const max = opts.max ?? 1000;
  const store = new Map<string, { value: V; expires: number }>();
  return {
    get(key) {
      const hit = store.get(key);
      if (!hit) return undefined;
      store.delete(key);
      if (hit.expires <= Date.now()) return undefined;
      store.set(key, hit); // refresh recency
      return hit.value;
    },
    set(key, value) {
      store.delete(key);
      if (store.size >= max) store.delete(store.keys().next().value as string);
      store.set(key, { value, expires: Date.now() + ttlMs });
    },
  };
}
