import { createTtlCache, stableStringify } from '@cmaintz/jev-core';
import type { GuardResult } from './guard.js';
import type { ToolCall } from './policy.js';

export interface GuardCache {
  get(key: string): GuardResult | undefined;
  set(key: string, value: GuardResult): void;
}

/** Deterministic cache key for a tool call, stable regardless of argument key order. */
export function keyOf(call: ToolCall): string {
  return `${call.tool}\u0000${call.task ?? ''}\u0000${stableStringify(call.arguments)}`;
}

/**
 * In-memory TTL cache with a size cap (evicts the oldest on overflow, refreshes
 * recency on read). Default 60s TTL, 1000 entries. Pass to `guard`/`wrapTool` via
 * `{ cache }` so identical repeated tool calls skip the Jev round-trip.
 */
export function createCache(opts: { ttlMs?: number; max?: number } = {}): GuardCache {
  return createTtlCache<GuardResult>(opts);
}
