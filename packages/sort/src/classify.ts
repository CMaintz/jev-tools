import { stableStringify, type JevProvider, type Question } from '@cmaintz/jev-core';
import { mapPool } from './map.js';
import { answersToColumns } from './core/columns.js';
import type { RateLimiter } from './rate-limit.js';

export interface ClassifyOptions {
  provider: JevProvider;
  /** rows whose confidence is below this are marked `escalated`. Default 0 (never). */
  escalateBelow?: number;
  /** in-flight Jev calls. Default 8. */
  concurrency?: number;
  /** skip re-calling Jev for rows with an identical state (token savings on repetitive corpora). */
  dedupe?: boolean;
  /** pace requests under Jev's req/min ceiling. */
  limiter?: RateLimiter;
}

type Usage = { input_tokens: number; output_tokens: number };

export interface ClassifiedRow {
  row: Record<string, unknown>;
  columns: Record<string, string | number>;
  confidence: number;
  escalated: boolean;
  fromCache?: boolean;
  usage?: Usage;
}

/** A row Jev could not classify: the provider call failed or an answer was missing. */
export interface FailedRow {
  row: Record<string, unknown>;
  error: string;
}

export type ClassifyResult = ClassifiedRow | FailedRow;

export const isFailed = (r: ClassifyResult): r is FailedRow => 'error' in r;

type Cached = { columns: Record<string, string | number>; confidence: number; usage?: Usage };

/**
 * Stream rows through Jev, one batched call each, yielding typed columns + a row
 * confidence. Bounded concurrency keeps memory flat over huge inputs; `dedupe`
 * caches identical states and `limiter` paces requests. A row that fails is yielded
 * as a `FailedRow` and the stream continues.
 */
export async function* classify(
  rows: Iterable<Record<string, unknown>> | AsyncIterable<Record<string, unknown>>,
  questions: Record<string, Question>,
  opts: ClassifyOptions,
): AsyncGenerator<ClassifyResult> {
  const threshold = opts.escalateBelow ?? 0;
  const cache = opts.dedupe ? new Map<string, Cached>() : undefined;

  const classifyRow = async (row: Record<string, unknown>): Promise<ClassifiedRow> => {
    const key = cache ? stableStringify(row) : undefined;
    const hit = key !== undefined ? cache?.get(key) : undefined;
    if (hit) {
      const { usage } = hit;
      return {
        row,
        columns: hit.columns,
        confidence: hit.confidence,
        escalated: hit.confidence < threshold,
        fromCache: true,
        ...(usage ? { usage } : {}),
      };
    }
    await opts.limiter?.acquire();
    const { answers, usage } = await opts.provider.evaluate({ state: row, questions });
    const missing = Object.keys(questions).filter((q) => !(q in answers));
    if (missing.length > 0) throw new Error(`no valid answer for: ${missing.join(', ')}`);
    const { columns, confidence } = answersToColumns(answers);
    if (cache && key !== undefined) cache.set(key, { columns, confidence, ...(usage ? { usage } : {}) });
    return { row, columns, confidence, escalated: confidence < threshold, ...(usage ? { usage } : {}) };
  };

  yield* mapPool(rows, opts.concurrency ?? 8, async (row): Promise<ClassifyResult> => {
    try {
      return await classifyRow(row);
    } catch (err) {
      return { row, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
