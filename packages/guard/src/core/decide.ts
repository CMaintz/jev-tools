import type { Answer } from '@cmaintz/jev-core';
import type { Dimension, GuardPolicy, Readout, Verdict } from '../policy.js';

export interface Decision {
  verdict: Verdict;
  readouts: Record<string, Readout>;
  reasons: string[];
}

/**
 * Turn Jev's answers into readouts, run the policy, then apply the fail-safes.
 * Pure — no I/O. This is the inverse of jev-triage's gate: here uncertainty must
 * never resolve to `allow`.
 */
export function decide(answers: Record<string, Answer>, policy: GuardPolicy): Decision {
  const { readouts, missing } = toReadouts(answers, policy);
  const reasons: string[] = [];
  let verdict = policy.decide(readouts);

  // Fail-safe 1: a dimension without a usable answer is unknown risk, never "no risk".
  if (verdict === 'allow' && missing.length > 0) {
    verdict = 'hold';
    for (const key of missing) reasons.push(`${key}: no valid answer → fail-safe hold`);
  }

  // Fail-safe 2: never `allow` while a gated (score/choice) risk dimension is below
  // the confidence floor. Low confidence on a risk question is itself a risk.
  if (verdict === 'allow' && policy.escalateBelow != null) {
    for (const [key, r] of Object.entries(readouts)) {
      const dim = policy.dimensions[key];
      if (dim && dim.kind !== 'noul' && r.confidence < policy.escalateBelow) {
        verdict = 'hold';
        reasons.push(`${key}: confidence ${r.confidence.toFixed(2)} < ${policy.escalateBelow} → fail-safe hold`);
      }
    }
  }

  return { verdict, readouts, reasons };
}

function toReadout(a: Answer | undefined, dim: Dimension): Readout | undefined {
  if (!a || a.type !== dim.kind) return undefined;
  if (a.type === 'noul') return Number.isFinite(a.noul) ? { value: a.noul, confidence: 1, raw: a } : undefined;
  if (!Number.isFinite(a.confidence)) return undefined;
  if (a.type === 'score')
    return Number.isFinite(a.score) ? { value: a.score, confidence: a.confidence, raw: a } : undefined;
  return { value: a.choice, confidence: a.confidence, raw: a };
}

function toReadouts(
  answers: Record<string, Answer>,
  policy: GuardPolicy,
): { readouts: Record<string, Readout>; missing: string[] } {
  const readouts: Record<string, Readout> = {};
  const missing: string[] = [];
  for (const [key, dim] of Object.entries(policy.dimensions)) {
    const r = toReadout(answers[key], dim);
    if (r) readouts[key] = r;
    else missing.push(key);
  }
  return { readouts, missing };
}
