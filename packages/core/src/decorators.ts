import type { EvaluateOptions, JevProvider, JevRequest, JevResponse } from './jev-provider.js';
import type { RateLimiter } from './rate-limit.js';
import { stableStringify } from './stable-stringify.js';
import { createTtlCache, type TtlCache, type TtlCacheOptions } from './ttl-cache.js';

/**
 * Wrap a provider so identical requests (same state and questions, any key order) reuse
 * the last successful response until it expires. Only settled successes are cached:
 * failures and aborted calls are never shared between callers.
 */
export function withCache(provider: JevProvider, opts: TtlCacheOptions | TtlCache<JevResponse> = {}): JevProvider {
  const cache = 'get' in opts ? opts : createTtlCache<JevResponse>(opts);
  return {
    async evaluate(req: JevRequest, evalOpts?: EvaluateOptions) {
      const key = stableStringify({ state: req.state, questions: req.questions });
      const hit = cache.get(key);
      if (hit) return hit;
      const res = await provider.evaluate(req, evalOpts);
      cache.set(key, res);
      return res;
    },
  };
}

/** Wrap a provider so every call first waits its turn on `limiter`. */
export function withRateLimit(provider: JevProvider, limiter: RateLimiter): JevProvider {
  return {
    async evaluate(req: JevRequest, evalOpts?: EvaluateOptions) {
      await limiter.acquire();
      return provider.evaluate(req, evalOpts);
    },
  };
}
