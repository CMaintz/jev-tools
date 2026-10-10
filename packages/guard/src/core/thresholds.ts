import { stableStringify, type Question } from '@cmaintz/jev-core';
import type { GuardPolicy } from '../policy.js';
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

const isGate = (v: unknown): v is Gate =>
  isObject(v) && ['threshold', 'accuracy', 'coverage', 'n'].every((k) => typeof v[k] === 'number');

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

/** Soft warnings for gated questions whose wording differs from what jev-eval measured. */
export function definitionWarnings(doc: ThresholdsFile, questions: Record<string, Question>): string[] {
  const defs = doc.definitions;
  if (!defs) return [];
  return gatedIds(questions)
    .filter((id) => id in defs && stableStringify(defs[id]) !== stableStringify(questions[id]))
    .map((id) => `${id} was reworded since it was measured; re-measure`);
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
  const warnings = definitionWarnings(doc, questions);
  const modelMismatch = model === undefined ? undefined : modelWarning(doc, model);
  if (modelMismatch) warnings.unshift(modelMismatch);
  return { escalateBelow: provenance.threshold, provenance, warnings };
}
