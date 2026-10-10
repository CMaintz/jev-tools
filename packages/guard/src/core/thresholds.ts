import { stableStringify, type Question } from '@cmaintz/jev-core';
import type { GuardPolicy, NoulCutoffs } from '../policy.js';
import { buildQuestions } from './questions.js';

// Mirrors jev-sort's reader (packages/sort/src/core/thresholds.ts) so both tools pick the
// same gate from the same file.

/** What one jev-eval gate buys: the cut-point and its measured accuracy/coverage on n rows. */
export interface Gate {
  threshold: number;
  accuracy: number;
  coverage: number;
  n: number;
}

/** The parts of jev-eval's `thresholds.json` (contract version 1) that jev-guard reads. */
export interface ThresholdsFile {
  version: 1;
  model: string;
  questions: Record<string, Gate & { type: string }>;
  composite?: Gate & { questions: string[] };
  /** the exact wire question jev-eval sent per id (jev-eval 1.2.0+). */
  definitions?: Record<string, unknown>;
  /** per noul id, raw P(yes) cut-points by precision target, strictest first (jev-eval 1.2.0+). */
  yesAt?: Record<string, YesCut[]>;
}

/** One measured yes cut-point: flag when raw P(yes) >= threshold to get `precision` out-of-bag. */
export interface YesCut {
  target: number;
  threshold: number;
  precision: number;
  recall: number;
  flagged: number;
  n: number;
}

/** Where a derived floor came from, for the audit log. */
export interface ThresholdsProvenance extends Gate {
  /** `composite` for the row-level gate, else the dimension id it came from. */
  source: string;
  /** the model jev-eval measured on. */
  model: string;
}

export interface EscalateBelowFromThresholds {
  escalateBelow: number;
  provenance: ThresholdsProvenance;
  /** soft warnings (model mismatch, reworded dimension); the floor is still usable. */
  warnings: string[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const numbers = (v: unknown, keys: string[]): boolean => isObject(v) && keys.every((k) => typeof v[k] === 'number');

const isGate = (v: unknown): v is Gate => numbers(v, ['threshold', 'accuracy', 'coverage', 'n']);

const isYesCut = (v: unknown): v is YesCut =>
  numbers(v, ['target', 'threshold', 'precision', 'recall', 'flagged', 'n']);

const isYesAt = (v: unknown): boolean =>
  isObject(v) && Object.values(v).every((cuts) => Array.isArray(cuts) && cuts.every(isYesCut));

/** Parse a jev-eval `thresholds.json` (text or already-parsed JSON). Throws unless it is contract version 1. */
export function parseThresholds(input: string | object): ThresholdsFile {
  const doc = (typeof input === 'string' ? JSON.parse(input) : input) as Partial<ThresholdsFile> | null;
  if (doc?.version !== 1) throw new Error(`thresholds file: expected version 1, got ${String(doc?.version)}`);
  if (!isObject(doc.questions)) throw new Error('thresholds file: missing "questions"');
  if (doc.composite !== undefined && !(isGate(doc.composite) && Array.isArray(doc.composite.questions))) {
    throw new Error('thresholds file: malformed "composite"');
  }
  if (doc.definitions !== undefined && !isObject(doc.definitions)) {
    throw new Error('thresholds file: malformed "definitions"');
  }
  if (doc.yesAt !== undefined && !isYesAt(doc.yesAt)) throw new Error('thresholds file: malformed "yesAt"');
  return doc as ThresholdsFile;
}

/** The questions the floor gates (choice and score; a noul carries no confidence), sorted. */
export function gatedIds(questions: Record<string, Question>): string[] {
  return Object.keys(questions)
    .filter((id) => questions[id]?.type !== 'noul')
    .sort();
}

const pickGateFields = ({ threshold, accuracy, coverage, n }: Gate): Gate => ({ threshold, accuracy, coverage, n });

function compositeGate(doc: ThresholdsFile, ids: string[]): ThresholdsProvenance {
  const measured = [...(doc.composite?.questions ?? [])].sort();
  if (measured.join(',') !== ids.join(',')) {
    throw new Error(
      `thresholds file gates [${measured.join(', ')}] but this policy gates [${ids.join(', ')}]; ` +
        're-run jev-eval thresholds with these questions',
    );
  }
  return { ...pickGateFields(doc.composite as Gate), source: 'composite', model: doc.model };
}

function questionGate(doc: ThresholdsFile, id: string): ThresholdsProvenance {
  const gate = doc.questions[id];
  if (!isGate(gate)) {
    throw new Error(
      `thresholds file has no gate for "${id}" (jev-eval refused it or found no gate meeting the goal; see its report)`,
    );
  }
  return { ...pickGateFields(gate), source: id, model: doc.model };
}

/**
 * The gate for these questions: with one gated question, its own gate; with several, the
 * composite (row-level, min-confidence) gate. A per-dimension floor holds when ANY gated
 * confidence is below it, which is exactly min confidence < floor, so the composite maps
 * directly onto `escalateBelow`.
 */
export function pickGate(doc: ThresholdsFile, questions: Record<string, Question>): ThresholdsProvenance {
  const ids = gatedIds(questions);
  if (ids.length === 0) throw new Error('thresholds file: nothing to gate on (every question is a noul)');
  if (ids.length === 1) return questionGate(doc, ids[0] as string);
  if (doc.composite) return compositeGate(doc, ids);
  throw new Error(
    `thresholds file has no composite gate for [${ids.join(', ')}] ` +
      '(jev-eval refused or found the row gate unstable; see its report)',
  );
}

/** A soft warning when the file was measured on a different model than the caller uses. */
export function modelWarning(doc: ThresholdsFile, model: string): string | undefined {
  if (doc.model === model) return undefined;
  return `thresholds were measured on ${doc.model} but this policy uses ${model}; re-measure after a model change`;
}

/** Soft warnings for the given questions whose wording differs from what jev-eval measured. */
export function definitionWarnings(doc: ThresholdsFile, questions: Record<string, Question>, ids: string[]): string[] {
  const defs = doc.definitions;
  if (!defs) return [];
  return ids
    .filter((id) => id in defs && stableStringify(defs[id]) !== stableStringify(questions[id]))
    .map((id) => `${id} was reworded since it was measured; re-measure`);
}

function withModelWarning(doc: ThresholdsFile, model: string | undefined, warnings: string[]): string[] {
  const mismatch = model === undefined ? undefined : modelWarning(doc, model);
  return mismatch ? [mismatch, ...warnings] : warnings;
}

/**
 * Derive a policy's `escalateBelow` from a jev-eval `thresholds.json`. Pure: pass the file's
 * text (or parsed JSON), then spread the result into the policy and log `provenance`.
 * Only score/choice dimensions are gated; noul dimensions and `decide` are untouched.
 * Pass `model` to get a warning when the file was measured on a different one.
 */
export function escalateBelowFrom(
  thresholds: string | object,
  policy: GuardPolicy,
  model?: string,
): EscalateBelowFromThresholds {
  const doc = parseThresholds(thresholds);
  const questions = buildQuestions(policy);
  const provenance = pickGate(doc, questions);
  const warnings = withModelWarning(doc, model, definitionWarnings(doc, questions, gatedIds(questions)));
  return { escalateBelow: provenance.threshold, provenance, warnings };
}

export interface NoulCutoffsFromThresholds {
  /** per noul dimension: the raw P(yes) at which it counts toward `block` and toward `hold`. */
  cutoffs: NoulCutoffs;
  /** the jev-eval measurement behind each cut-off, for the audit log. */
  provenance: Record<string, { block: YesCut; hold: YesCut }>;
  model: string;
  /** soft warnings (model mismatch, reworded or unmeasured dimension); the cut-offs are still usable. */
  warnings: string[];
}

/** The noul dimensions of a policy (the ones a yes cut-point applies to), sorted. */
export function noulIds(questions: Record<string, Question>): string[] {
  return Object.keys(questions)
    .filter((id) => questions[id]?.type === 'noul')
    .sort();
}

/** Strictest measured target for `block` (a wrong block is costly), loosest for `hold` (fail-safe, favors recall). */
function rolesFor(cuts: YesCut[]): { block: YesCut; hold: YesCut } {
  const sorted = [...cuts].sort((a, b) => b.target - a.target);
  return { block: sorted[0] as YesCut, hold: sorted[sorted.length - 1] as YesCut };
}

function coverageWarning(id: string, cuts: YesCut[] | undefined): string | undefined {
  if (!cuts || cuts.length === 0) return `${id} has no yesAt cut-point; keeping the policy's own cut-off`;
  if (cuts.length === 1) return `${id} has one yesAt target (${cuts[0]?.target}); it serves both block and hold`;
  return undefined;
}

/**
 * Derive a policy's noul cut-offs from a jev-eval `thresholds.json` (`yesAt`, written by
 * `thresholds --yes-precision`). Pure: pass the result's `cutoffs` to a preset
 * (`shellPolicy({ cutoffs })`) or read them in your own `decide`. Each noul dimension's
 * strictest measured precision target sets its `block` cut-off and its loosest sets `hold`.
 * A dimension jev-eval did not measure is left out, so the policy keeps its own cut-off.
 */
export function noulCutoffsFrom(
  thresholds: string | object,
  policy: GuardPolicy,
  model?: string,
): NoulCutoffsFromThresholds {
  const doc = parseThresholds(thresholds);
  if (!doc.yesAt) throw new Error('thresholds file has no "yesAt"; re-run jev-eval thresholds with --yes-precision');
  const questions = buildQuestions(policy);
  const ids = noulIds(questions);
  if (ids.length === 0) throw new Error('thresholds file: nothing to cut (the policy has no noul dimension)');
  const cutoffs: NoulCutoffs = {};
  const provenance: NoulCutoffsFromThresholds['provenance'] = {};
  const gaps: string[] = [];
  for (const id of ids) {
    const cuts = doc.yesAt[id];
    const gap = coverageWarning(id, cuts);
    if (gap) gaps.push(gap);
    if (!cuts || cuts.length === 0) continue;
    provenance[id] = rolesFor(cuts);
    cutoffs[id] = { block: provenance[id].block.threshold, hold: provenance[id].hold.threshold };
  }
  if (Object.keys(cutoffs).length === 0) {
    throw new Error(
      `thresholds file has no yesAt cut-point for [${ids.join(', ')}] (jev-eval could not reach a target; see its report)`,
    );
  }
  const measured = Object.keys(cutoffs);
  const warnings = withModelWarning(doc, model, [...definitionWarnings(doc, questions, measured), ...gaps]);
  return { cutoffs, provenance, model: doc.model, warnings };
}
