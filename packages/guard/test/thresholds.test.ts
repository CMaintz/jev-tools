import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Answer } from '@cmaintz/jev-core';
import { escalateBelowFrom } from '../src/index.js';
import { decide } from '../src/core/decide.js';
import { parseThresholds } from '../src/core/thresholds.js';
import { choice, noul, type GuardPolicy } from '../src/policy.js';
import { shellPolicy } from '../src/presets.js';

const fixture = readFileSync(new URL('./fixtures/thresholds.json', import.meta.url), 'utf8');
const parsed = (): Record<string, unknown> => JSON.parse(fixture) as Record<string, unknown>;
const without = (key: string): Record<string, unknown> => {
  const { [key]: _, ...rest } = parsed();
  return rest;
};

const target = choice({ local: 'Local', remote: 'Remote' }, 'Where does it write?');
const twoGated = (): GuardPolicy => ({
  ...shellPolicy(),
  dimensions: { ...shellPolicy().dimensions, target },
});

describe('parseThresholds', () => {
  it('reads contract v1 from text or parsed JSON', () => {
    expect(parseThresholds(fixture).composite?.threshold).toBe(0.85);
    expect(parseThresholds(parsed()).questions['risk']?.threshold).toBe(0.75);
  });

  it('refuses other versions and malformed files', () => {
    expect(() => parseThresholds('{"version": 2, "questions": {}}')).toThrow(/version 1/);
    expect(() => parseThresholds('null')).toThrow(/version 1/);
    expect(() => parseThresholds('{"version": 1}')).toThrow(/questions/);
    expect(() => parseThresholds('{"version": 1, "questions": {}, "composite": {"threshold": 1}}')).toThrow(
      /composite/,
    );
    expect(() => parseThresholds('{"version": 1, "questions": {}, "definitions": 3}')).toThrow(/definitions/);
  });
});

describe('escalateBelowFrom', () => {
  it("uses a single gated dimension's own gate, ignoring nouls and the composite", () => {
    const { escalateBelow, provenance, warnings } = escalateBelowFrom(fixture, shellPolicy());
    expect(escalateBelow).toBe(0.75);
    expect(provenance).toEqual({
      threshold: 0.75,
      accuracy: 0.93,
      coverage: 0.64,
      n: 300,
      source: 'risk',
      model: 'jev-latest',
    });
    expect(warnings).toEqual([]);
  });

  it('works without a composite or definitions (the shellPolicy case)', () => {
    const { composite: _, definitions: __, ...bare } = parsed();
    expect(escalateBelowFrom(bare, shellPolicy()).escalateBelow).toBe(0.75);
  });

  it('uses the composite gate for several gated dimensions', () => {
    const { escalateBelow, provenance } = escalateBelowFrom(fixture, twoGated());
    expect(escalateBelow).toBe(0.85);
    expect(provenance.source).toBe('composite');
  });

  it('refuses a composite measured on other dimensions, naming both lists', () => {
    const policy = { ...twoGated(), dimensions: { ...shellPolicy().dimensions, where: target } };
    expect(() => escalateBelowFrom(fixture, policy)).toThrow(
      /gates \[risk, target\] but this policy gates \[risk, where\]; re-run jev-eval thresholds/,
    );
  });

  it('explains a missing composite for several gated dimensions', () => {
    expect(() => escalateBelowFrom(without('composite'), twoGated())).toThrow(
      /no composite gate for \[risk, target\].*row gate unstable/,
    );
  });

  it('explains a missing per-dimension gate', () => {
    const policy: GuardPolicy = { dimensions: { region: target }, decide: () => 'allow' };
    expect(() => escalateBelowFrom(fixture, policy)).toThrow(/no gate for "region"/);
  });

  it('refuses a noul-only policy', () => {
    const policy: GuardPolicy = { dimensions: { destructive: noul('Does this delete data?') }, decide: () => 'allow' };
    expect(() => escalateBelowFrom(fixture, policy)).toThrow(/nothing to gate on/);
  });

  it('warns on a model mismatch only when a model is given', () => {
    expect(escalateBelowFrom(fixture, shellPolicy(), 'jev-latest').warnings).toEqual([]);
    expect(escalateBelowFrom(fixture, shellPolicy(), 'jev-1.13.0').warnings).toEqual([
      'thresholds were measured on jev-latest but this policy uses jev-1.13.0; re-measure after a model change',
    ]);
  });

  it('warns when a gated dimension was reworded, ignoring key order and nouls', () => {
    const doc = parsed();
    const defs = doc['definitions'] as Record<string, Record<string, unknown>>;
    defs['target'] = {
      criteria: { remote: 'Remote', local: 'Local' },
      instructions: 'Where does it write?',
      type: 'choice',
    };
    defs['destructive'] = { type: 'noul', instructions: 'reworded noul' };
    expect(escalateBelowFrom(doc, twoGated()).warnings).toEqual([]);

    const reworded = {
      ...twoGated(),
      dimensions: { ...twoGated().dimensions, target: { ...target, instructions: 'Where?' } },
    };
    expect(escalateBelowFrom(doc, reworded as GuardPolicy).warnings).toEqual([
      'target was reworded since it was measured; re-measure',
    ]);
  });

  it('feeds decide: a below-floor allow fails safe to hold', () => {
    const policy = { ...shellPolicy(), escalateBelow: escalateBelowFrom(fixture, shellPolicy()).escalateBelow };
    const answers = (confidence: number): Record<string, Answer> => ({
      risk: { type: 'score', score: 0.2, confidence, probabilities: {} },
      destructive: { type: 'noul', noul: 0.05 },
      exfiltrates: { type: 'noul', noul: 0.05 },
    });
    expect(decide(answers(0.8), policy).verdict).toBe('allow');
    expect(decide(answers(0.72), policy).verdict).toBe('hold');
  });
});
