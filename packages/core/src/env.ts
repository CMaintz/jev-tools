import { CloudflareProvider } from './cloudflare.js';
import type { JevProvider } from './jev-provider.js';
import { TypeSafeProvider } from './typesafe.js';

/** Environment variables `providerFromEnv` reads. A plain record, so `process.env` fits without `@types/node`. */
export type JevEnv = Readonly<Record<string, string | undefined>>;

/**
 * Build a provider from the environment, or return null when no key is set so the
 * caller can fail open to its non-Jev behavior (Jev stays strictly opt-in).
 *
 * Reads: JEV_PROVIDER (typesafe | cloudflare, default typesafe), JEV_API_KEY, JEV_MODEL,
 * CLOUDFLARE_ACCOUNT_ID (cloudflare only), and TYPESAFE_AI_BASE_URL (self-host, proxy or mock).
 * Empty strings count as unset.
 */
export function providerFromEnv(env: JevEnv = globalThis.process?.env ?? {}): JevProvider | null {
  const key = env.JEV_API_KEY;
  if (!key) return null;
  if ((env.JEV_PROVIDER || 'typesafe') === 'cloudflare') return cloudflareFromEnv(env, key);
  return new TypeSafeProvider(key, env.JEV_MODEL || undefined, env.TYPESAFE_AI_BASE_URL || undefined);
}

function cloudflareFromEnv(env: JevEnv, apiToken: string): JevProvider | null {
  if (!env.CLOUDFLARE_ACCOUNT_ID) return null;
  return new CloudflareProvider(env.CLOUDFLARE_ACCOUNT_ID, apiToken, env.JEV_MODEL || undefined);
}
