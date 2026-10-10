import { CloudflareProvider } from './cloudflare.js';
import type { JevProvider } from './jev-provider.js';
import { JevRequestError } from './questions.js';
import { TypeSafeProvider } from './typesafe.js';

export interface ProviderConfig {
  /** which backend to call. Default `typesafe`. */
  provider?: 'typesafe' | 'cloudflare';
  /** TypeSafe API key, or Cloudflare API token. */
  apiKey: string;
  /** model id. Defaults per backend; `jev-latest` maps to `typesafe/jev` on Cloudflare. */
  model?: string;
  /** Cloudflare account id. Required for `cloudflare`. */
  accountId?: string;
  /** TypeSafe base URL override (proxy, self-host, mock). Ignored for `cloudflare`. */
  baseUrl?: string;
  /** per-attempt request timeout in ms. Default 30 000. */
  timeoutMs?: number;
}

/** TypeSafe model aliases and their Workers AI ids, so one config works on either backend. */
const CLOUDFLARE_MODEL_ALIASES: Readonly<Record<string, string>> = { 'jev-latest': 'typesafe/jev' };

/**
 * Build a provider from plain settings, for callers that read their own config (CLI flags,
 * Action inputs). Throws `JevRequestError` when a required setting is missing or the backend
 * is unknown. See `providerFromEnv` for the fail-open, environment-driven variant.
 */
export function createProvider(config: ProviderConfig): JevProvider {
  const { provider = 'typesafe', apiKey, model, timeoutMs } = config;
  if (!apiKey) throw new JevRequestError('Jev provider needs an API key');
  if (provider === 'typesafe') {
    return new TypeSafeProvider(apiKey, model || undefined, config.baseUrl || undefined, timeoutMs);
  }
  if (provider !== 'cloudflare') throw new JevRequestError(`unknown Jev provider "${String(provider)}"`);
  if (!config.accountId) throw new JevRequestError('Cloudflare Jev provider needs an account id');
  return new CloudflareProvider(config.accountId, apiKey, cloudflareModel(model), timeoutMs);
}

function cloudflareModel(model: string | undefined): string | undefined {
  if (!model) return undefined;
  return CLOUDFLARE_MODEL_ALIASES[model] ?? model;
}
