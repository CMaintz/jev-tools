#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { appendFileSync, readFileSync } from 'node:fs';
import { createProvider, type JevProvider, type Question } from '@cmaintz/jev-core';
import { classify, isFailed } from './classify.js';
import { evaluate } from './eval.js';
import { RateLimiter } from './rate-limit.js';
import { parseConfig, type SortConfig } from './config.js';
import { parseQuestions } from './core/questions.js';
import { parseEscalate } from './core/escalate.js';
import { definitionWarnings, modelWarning, parseThresholds, pickGate, provenance } from './core/thresholds.js';
import { csvHeader, rowFromCells, splitCsvLine, toCsvLine } from './csv.js';
import { HELP, parseCliArgs, type CliOptions } from './args.js';

type Row = Record<string, unknown>;
type Reject = (record: Row) => void;

async function* readRows(stream: NodeJS.ReadableStream, format: 'jsonl' | 'csv', reject: Reject): AsyncGenerator<Row> {
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let lineNo = 0;
  if (format === 'csv') {
    let header: string[] | undefined;
    for await (const line of rl) {
      lineNo++;
      if (!line.trim() && !header) continue;
      const cells = splitCsvLine(line);
      if (!header) header = cells;
      else if (line.trim()) yield rowFromCells(header, cells);
    }
    return;
  }
  for await (const line of rl) {
    lineNo++;
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      reject({ _line: lineNo, _raw: trimmed, _error: 'invalid JSON' });
      continue;
    }
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) yield parsed as Row;
    else reject({ _line: lineNo, _raw: trimmed, _error: 'row is not a JSON object' });
  }
}

function makeProvider(kind: string, model: string): JevProvider {
  const key = process.env.JEV_API_KEY;
  if (!key) throw new Error('set JEV_API_KEY in the environment');
  if (kind !== 'cloudflare') return createProvider({ apiKey: key, model });
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) throw new Error('set CLOUDFLARE_ACCOUNT_ID for --provider cloudflare');
  return createProvider({ provider: 'cloudflare', apiKey: key, model, accountId });
}

function readJsonlFile(file: string): Row[] {
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Row);
}

async function runEval(file: string, questions: Record<string, Question>, provider: JevProvider): Promise<void> {
  const report = await evaluate(readJsonlFile(file), questions, provider);
  process.stderr.write(`eval: ${report.total} rows · overall ${(report.overall * 100).toFixed(1)}%\n`);
  for (const [k, s] of Object.entries(report.perQuestion)) {
    process.stderr.write(`  ${k}: ${(s.accuracy * 100).toFixed(1)}% (${s.correct}/${s.total})\n`);
  }
}

/** Read the gate from a jev-eval thresholds.json, reporting its provenance on stderr. */
function gateFromFile(file: string, questions: Record<string, Question>, model: string): number {
  const doc = parseThresholds(readFileSync(file, 'utf8'));
  const picked = pickGate(doc, questions);
  const warnings = [modelWarning(doc, model), ...definitionWarnings(doc, questions)].filter(Boolean);
  for (const warning of warnings)
    process.stderr.write(`jev-sort: warning: ${warning}
`);
  process.stderr.write(`jev-sort: ${provenance(picked, file)}
`);
  return picked.gate.threshold;
}

/** The escalation bar: --escalate, else --thresholds, else the config's escalate_below. */
function escalationBar(
  o: CliOptions,
  cfg: Partial<SortConfig>,
  questions: Record<string, Question>,
  model: string,
): number {
  if (o.escalate && o.thresholds) throw new Error('use --escalate or --thresholds, not both');
  if (o.escalate) return parseEscalate(o.escalate);
  if (o.thresholds) return gateFromFile(o.thresholds, questions, model);
  return cfg.escalate_below ?? 0;
}

async function run(o: CliOptions): Promise<void> {
  const cfg: Partial<SortConfig> = o.config ? parseConfig(readFileSync(o.config, 'utf8')) : {};
  const questions: Record<string, Question> = cfg.questions ?? parseQuestions(o.questions);
  const model = o.model ?? cfg.model ?? 'jev-latest';
  const provider = makeProvider(o.provider ?? cfg.provider ?? 'typesafe', model);

  if (o.eval) return runEval(o.eval, questions, provider);

  const format = o.format ?? cfg.format ?? 'jsonl';
  const threshold = escalationBar(o, cfg, questions, model);
  const limiter = o.rate ? new RateLimiter(o.rate) : undefined;

  let rows = 0;
  let flagged = 0;
  let rejected = 0;
  let tokens = 0;
  let columns: string[] = [];
  const startedAt = Date.now();

  const reject: Reject = (record) => {
    rejected++;
    const line = JSON.stringify(record) + '\n';
    if (o.rejectOut) appendFileSync(o.rejectOut, line);
    else process.stderr.write(`jev-sort: rejected ${line}`);
  };

  for await (const r of classify(readRows(process.stdin, format, reject), questions, {
    provider,
    escalateBelow: threshold,
    concurrency: o.concurrency ?? cfg.concurrency ?? 8,
    dedupe: o.dedupe,
    ...(limiter ? { limiter } : {}),
  })) {
    if (isFailed(r)) {
      reject({ ...r.row, _error: r.error });
      continue;
    }
    rows++;
    tokens += r.usage?.input_tokens ?? 0;
    const record = { ...r.row, ...r.columns, _confidence: Number(r.confidence.toFixed(4)) };

    if (r.escalated && o.reviewOut) {
      appendFileSync(o.reviewOut, JSON.stringify(record) + '\n');
      flagged++;
      continue;
    }
    if (format === 'csv') {
      if (columns.length === 0) {
        columns = Object.keys(record);
        process.stdout.write(csvHeader(columns) + '\n');
      }
      process.stdout.write(toCsvLine(record, columns) + '\n');
    } else {
      process.stdout.write(JSON.stringify(record) + '\n');
    }
  }

  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  // TypeSafe list price: $0.042 per million input tokens, output free (typesafe.ai pricing).
  const cost = ((tokens / 1_000_000) * 0.042).toFixed(4);
  const review = o.reviewOut ? ` -> ${o.reviewOut}` : '';
  const rejects = o.rejectOut ? ` -> ${o.rejectOut}` : '';
  process.stderr.write(
    `${rows} rows · ${tokens} input tokens (est. $${cost}) · ${secs}s · ${flagged} flagged${review} · ${rejected} rejected${rejects}\n`,
  );
  if (rejected > 0) process.exitCode = 3;
  else if (flagged > 0 && !o.allowReview) process.exitCode = 2;
}

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(HELP);
    return;
  }
  await run(parsed.options);
}

main().catch((err: unknown) => {
  process.stderr.write(`jev-sort: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
