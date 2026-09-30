import { describe, expect, it } from 'vitest';
import { decide } from '../src/core/decide.js';
import { noul, score } from '../src/policy.js';
import type { GuardPolicy } from '../src/policy.js';
import type { Answer } from '@cmaintz/jev-core';

const policy: GuardPolicy = {
  dimensions: {
    risk: score(['none', 'local', 'destructive', 'external'], 'blast radius'),
    destructive: noul('permanently deletes data?'),
  },
  decide: (r) => {
    const risk = typeof r.risk?.value === 'number' ? r.risk.value : 0;
    const destructive = typeof r.destructive?.value === 'number' ? r.destructive.value : 0;
    return risk >= 2 && destructive >= 0.8 ? 'block' : 'allow';
  },
  escalateBelow: 0.8,
};

describe('decide', () => {
  it('blocks a confident high-risk destructive call', () => {
    const answers: Record<string, Answer> = {
      risk: { type: 'score', score: 2.9, confidence: 0.9, probabilities: {} },
      destructive: { type: 'noul', noul: 0.94 },
    };
    expect(decide(answers, policy).verdict).toBe('block');
  });

  it('allows a confident safe call', () => {
    const answers: Record<string, Answer> = {
      risk: { type: 'score', score: 0.2, confidence: 0.95, probabilities: {} },
      destructive: { type: 'noul', noul: 0.02 },
    };
    expect(decide(answers, policy).verdict).toBe('allow');
  });

  it('fails safe: an allow leaning on a low-confidence risk score becomes hold', () => {
    const answers: Record<string, Answer> = {
      risk: { type: 'score', score: 0.2, confidence: 0.4, probabilities: {} },
      destructive: { type: 'noul', noul: 0.02 },
    };
    const d = decide(answers, policy);
    expect(d.verdict).toBe('hold');
    expect(d.reasons.join(' ')).toMatch(/fail-safe/);
  });
});

describe('decide fails safe on missing or malformed answers', () => {
  const allowAll: GuardPolicy = { ...policy, decide: () => 'allow' };
  const confidentRisk: Answer = { type: 'score', score: 0.1, confidence: 0.95, probabilities: {} };

  it('holds when a dimension has no answer', () => {
    const d = decide({ risk: confidentRisk }, allowAll);
    expect(d.verdict).toBe('hold');
    expect(d.reasons).toContain('destructive: no valid answer → fail-safe hold');
  });

  it('holds when Jev returns nothing at all', () => {
    expect(decide({}, allowAll).verdict).toBe('hold');
  });

  it('holds when an answer has the wrong type for its dimension', () => {
    const d = decide({ risk: confidentRisk, destructive: { ...confidentRisk } }, allowAll);
    expect(d.verdict).toBe('hold');
    expect(d.readouts.destructive).toBeUndefined();
  });

  it('holds on non-finite numbers', () => {
    const answers: Record<string, Answer> = {
      risk: { type: 'score', score: Number.NaN, confidence: 0.9, probabilities: {} },
      destructive: { type: 'noul', noul: 0.01 },
    };
    expect(decide(answers, allowAll).verdict).toBe('hold');
    const badConf: Record<string, Answer> = {
      risk: { type: 'score', score: 0, confidence: Number.NaN, probabilities: {} },
      destructive: { type: 'noul', noul: Number.NaN },
    };
    expect(decide(badConf, allowAll).reasons).toHaveLength(2);
  });

  it('keeps a block even when some answers are missing', () => {
    expect(decide({}, { ...policy, decide: () => 'block' }).verdict).toBe('block');
  });

  it('reads choice answers as their label', () => {
    const choicePolicy: GuardPolicy = {
      dimensions: { kind: { kind: 'choice', instructions: 'k', options: { read: 'r', write: 'w' } } },
      decide: (r) => (r.kind?.value === 'read' ? 'allow' : 'hold'),
    };
    const d = decide({ kind: { type: 'choice', choice: 'read', confidence: 0.9, probabilities: {} } }, choicePolicy);
    expect(d.verdict).toBe('allow');
  });
});
