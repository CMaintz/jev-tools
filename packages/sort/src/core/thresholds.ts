import type { Question } from '@cmaintz/jev-core';

/** What one jev-eval gate buys: the cut-point and its measured accuracy/coverage on n rows. */
export interface Gate {
  threshold: number;
  accuracy: number;
  coverage: number;
  n: number;
}

/** The parts of jev-eval's `thresholds.json` (contract version 1) that jev-sort reads. */
export interface ThresholdsFile {
  version: 1;
  model: string;
  questions: Record<string, Gate & { type: string }>;
  composite?: Gate & { questions: string[] };
}

export interface PickedGate {
  gate: Gate;
  /** `composite` for the row-level gate, else the question id it came from. */
  source: string;
  model: string;
}

const isGate = (v: unknown): v is Gate =>
  typeof v === 'object' &&
  v !== null &&
  ['threshold', 'accuracy', 'coverage', 'n'].every((k) => typeof (v as Record<string, unknown>)[k] === 'number');

/** Parse a jev-eval `thresholds.json`. Throws unless it is contract version 1. */
export function parseThresholds(text: string): ThresholdsFile {
  const doc = JSON.parse(text) as Partial<ThresholdsFile> | null;
  if (doc?.version !== 1) throw new Error(`thresholds file: expected version 1, got ${String(doc?.version)}`);
  if (typeof doc.questions !== 'object' || doc.questions === null) {
    throw new Error('thresholds file: missing "questions"');
  }
  if (doc.composite !== undefined && !(isGate(doc.composite) && Array.isArray(doc.composite.questions))) {
    throw new Error('thresholds file: malformed "composite"');
  }
  return doc as ThresholdsFile;
}

/** The questions a row is gated on (choice and score; a noul carries no gate confidence), sorted. */
export function gatedIds(questions: Record<string, Question>): string[] {
  return Object.keys(questions)
    .filter((id) => questions[id]?.type !== 'noul')
    .sort();
}

function compositeGate(doc: ThresholdsFile, ids: string[]): PickedGate {
  const measured = [...(doc.composite?.questions ?? [])].sort();
  if (measured.join(',') !== ids.join(',')) {
    throw new Error(
      `thresholds file gates [${measured.join(', ')}] but this run gates [${ids.join(', ')}]; ` +
        're-run jev-eval thresholds with these questions',
    );
  }
  return { gate: doc.composite as Gate, source: 'composite', model: doc.model };
}

function questionGate(doc: ThresholdsFile, id: string): PickedGate {
  const gate = doc.questions[id];
  if (!isGate(gate)) {
    throw new Error(
      `thresholds file has no gate for "${id}" (jev-eval refused it or found no gate meeting the goal; see its report)`,
    );
  }
  return { gate, source: id, model: doc.model };
}

/**
 * The cut-point for this run's questions: the composite (row-level) gate when the file has
 * one, else the single gated question's own gate. jev-sort escalates confidence < threshold,
 * the complement of jev-eval's "covered at confidence >= threshold", so it maps directly.
 */
export function pickGate(doc: ThresholdsFile, questions: Record<string, Question>): PickedGate {
  const ids = gatedIds(questions);
  if (ids.length === 0) throw new Error('--thresholds: nothing to gate on (every question is a noul)');
  if (doc.composite) return compositeGate(doc, ids);
  if (ids.length === 1) return questionGate(doc, ids[0] as string);
  throw new Error(
    `thresholds file has no composite gate for [${ids.join(', ')}] ` +
      '(jev-eval refused or found the row gate unstable; see its report)',
  );
}

/** A soft warning when the file was measured on a different model than this run uses. */
export function modelWarning(doc: ThresholdsFile, model: string): string | undefined {
  if (doc.model === model) return undefined;
  return `thresholds were measured on ${doc.model} but this run uses ${model}; re-measure after a model change`;
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

/** One line saying where the gate came from and what jev-eval measured it buys. */
export function provenance(picked: PickedGate, file: string): string {
  const { gate } = picked;
  const from = picked.source === 'composite' ? '' : ` "${picked.source}"`;
  return (
    `gate ${gate.threshold} from ${file}${from} ` +
    `(jev-eval: ${pct(gate.accuracy)} at ${pct(gate.coverage)} coverage, n=${gate.n}, model ${picked.model})`
  );
}
