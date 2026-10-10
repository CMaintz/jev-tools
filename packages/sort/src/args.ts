import { parseArgs } from 'node:util';

export const HELP = `Usage: jev-sort [options] < rows.jsonl > out.jsonl

Stream rows through TypeSafe AI's Jev and append typed answer columns plus _confidence.
Each input row is sent as the Jev state. Requires JEV_API_KEY in the environment
(and CLOUDFLARE_ACCOUNT_ID for --provider cloudflare).

Questions (one of):
  -q, --q SPEC            inline question, repeatable: name:choice(a,b,c) | name:noul | name:score(lo,mid,hi)
  --config FILE           YAML config with full instructions/criteria per question

Output:
  --format jsonl|csv      input and stdout format (default jsonl)
  --escalate 'conf<N'     rows below this confidence go to --review-out instead of stdout
  --thresholds FILE       take the --escalate bar from a jev-eval thresholds.json (the
                          composite row gate, or the one gated question's gate)
  --review-out FILE       JSONL file for escalated rows (exit code 2 if any, unless --allow-review)
  --allow-review          exit 0 even when rows were escalated
  --reject-out FILE       JSONL file for rows that failed (bad input line, provider error,
                          incomplete answer); default: report them on stderr. Exit code 3 if any.

Throughput:
  --concurrency N         in-flight requests, positive integer (default 8)
  --rate N                max requests per minute, positive number (default: unlimited)
  --dedupe                reuse the answer for rows with identical content

Provider:
  --provider typesafe|cloudflare   (default typesafe)
  --model NAME            (default jev-latest)

Other:
  --eval FILE             measure agreement against a labeled JSONL sample, then exit
  -h, --help              show this help
`;

export interface CliOptions {
  questions: string[];
  config?: string;
  escalate?: string;
  thresholds?: string;
  reviewOut?: string;
  rejectOut?: string;
  format?: 'jsonl' | 'csv';
  provider?: 'typesafe' | 'cloudflare';
  model?: string;
  concurrency?: number;
  rate?: number;
  dedupe: boolean;
  eval?: string;
  allowReview: boolean;
}

export type ParsedArgs = { help: true } | { help: false; options: CliOptions };

function positive(name: string, raw: string | undefined, integer: boolean): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  const ok = raw.trim() !== '' && Number.isFinite(n) && n > 0 && (!integer || Number.isInteger(n));
  if (!ok) throw new Error(`--${name} must be a positive ${integer ? 'integer' : 'number'}, got "${raw}"`);
  return n;
}

function oneOf<T extends string>(name: string, raw: string | undefined, allowed: readonly T[]): T | undefined {
  if (raw === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new Error(`--${name} must be one of ${allowed.join(', ')}, got "${raw}"`);
  }
  return raw as T;
}

/** Parse and validate argv (without the node/script prefix). Throws with a user-facing message. */
export function parseCliArgs(argv: string[]): ParsedArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      q: { type: 'string', multiple: true, short: 'q' },
      config: { type: 'string' },
      escalate: { type: 'string' },
      thresholds: { type: 'string' },
      'review-out': { type: 'string' },
      'reject-out': { type: 'string' },
      format: { type: 'string' },
      provider: { type: 'string' },
      model: { type: 'string' },
      concurrency: { type: 'string' },
      rate: { type: 'string' },
      dedupe: { type: 'boolean', default: false },
      eval: { type: 'string' },
      'allow-review': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) return { help: true };

  const format = oneOf('format', values.format, ['jsonl', 'csv'] as const);
  const provider = oneOf('provider', values.provider, ['typesafe', 'cloudflare'] as const);
  const concurrency = positive('concurrency', values.concurrency, true);
  const rate = positive('rate', values.rate, false);

  const options: CliOptions = {
    questions: values.q ?? [],
    dedupe: values.dedupe,
    allowReview: values['allow-review'],
    ...(values.config !== undefined ? { config: values.config } : {}),
    ...(values.escalate !== undefined ? { escalate: values.escalate } : {}),
    ...(values.thresholds !== undefined ? { thresholds: values.thresholds } : {}),
    ...(values['review-out'] !== undefined ? { reviewOut: values['review-out'] } : {}),
    ...(values['reject-out'] !== undefined ? { rejectOut: values['reject-out'] } : {}),
    ...(values.model !== undefined ? { model: values.model } : {}),
    ...(values.eval !== undefined ? { eval: values.eval } : {}),
    ...(format ? { format } : {}),
    ...(provider ? { provider } : {}),
    ...(concurrency !== undefined ? { concurrency } : {}),
    ...(rate !== undefined ? { rate } : {}),
  };
  return { help: false, options };
}
