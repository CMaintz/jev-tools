import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Answer } from '@cmaintz/jev-core';
import { escalateBelowFrom, noulCutoffsFrom } from '../src/index.js';
import { decide } from '../src/core/decide.js';
import { parseThresholds } from '../src/core/thresholds.js';
import { choice, noul, type GuardPolicy, type Readout } from '../src/policy.js';
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
    expect(() => parseThresholds('{"version": 1, "questions": {}, "yesAt": {"x": [{"target": 0.9}]}}')).toThrow(
      /yesAt/,
    );
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

describe('noulCutoffsFrom', () => {
  const ro = (value: number): Readout => ({ value, confidence: 1, raw: { type: 'noul', noul: value } });

  it('maps the strictest target to block and the loosest to hold, skipping score/choice', () => {
    const { cutoffs, provenance, model } = noulCutoffsFrom(fixture, shellPolicy());
    expect(cutoffs).toEqual({ destructive: { block: 0.86, hold: 0.64 }, exfiltrates: { block: 0.93, hold: 0.93 } });
    expect(provenance['destructive']?.block).toMatchObject({ target: 0.9, precision: 0.912, n: 412 });
    expect(provenance['destructive']?.hold.target).toBe(0.7);
    expect(model).toBe('jev-latest');
  });

  it('does not depend on the order of the yesAt entries', () => {
    const doc = parsed();
    const yesAt = doc['yesAt'] as Record<string, unknown[]>;
    yesAt['destructive'] = [...(yesAt['destructive'] ?? [])].reverse();
    expect(noulCutoffsFrom(doc, shellPolicy()).cutoffs['destructive']).toEqual({ block: 0.86, hold: 0.64 });
  });

  it('warns about single-target and unmeasured dimensions, and leaves the unmeasured out', () => {
    const doc = parsed();
    delete (doc['yesAt'] as Record<string, unknown>)['exfiltrates'];
    const one = noulCutoffsFrom(fixture, shellPolicy()).warnings;
    expect(one).toEqual(['exfiltrates has one yesAt target (0.9); it serves both block and hold']);
    const none = noulCutoffsFrom(doc, shellPolicy());
    expect(none.cutoffs).not.toHaveProperty('exfiltrates');
    expect(none.warnings).toEqual(["exfiltrates has no yesAt cut-point; keeping the policy's own cut-off"]);
  });

  it('warns on a model mismatch and a reworded noul', () => {
    const doc = parsed();
    (doc['definitions'] as Record<string, unknown>)['destructive'] = { type: 'noul', instructions: 'Deletes?' };
    expect(noulCutoffsFrom(doc, shellPolicy(), 'jev-1.13.0').warnings.slice(0, 2)).toEqual([
      'thresholds were measured on jev-latest but this policy uses jev-1.13.0; re-measure after a model change',
      'destructive was reworded since it was measured; re-measure',
    ]);
  });

  it('refuses a file without yesAt, a policy without nouls, and a file measuring none of them', () => {
    expect(() => noulCutoffsFrom(without('yesAt'), shellPolicy())).toThrow(/no "yesAt".*--yes-precision/);
    expect(() => noulCutoffsFrom('{"version": 2}', shellPolicy())).toThrow(/version 1/);
    const scoreOnly: GuardPolicy = { dimensions: { target }, decide: () => 'allow' };
    expect(() => noulCutoffsFrom(fixture, scoreOnly)).toThrow(/no noul dimension/);
    const other: GuardPolicy = { dimensions: { urgent: noul('Is it urgent?') }, decide: () => 'allow' };
    expect(() => noulCutoffsFrom(fixture, other)).toThrow(/no yesAt cut-point for \[urgent\]/);
  });

  it('feeds a preset: measured cut-offs replace the built-in ones', () => {
    const { cutoffs } = noulCutoffsFrom(fixture, shellPolicy());
    const measured = shellPolicy({ cutoffs });
    const call = { risk: ro(2), destructive: ro(0.82), exfiltrates: ro(0.1) };
    expect(shellPolicy().decide(call)).toBe('block');
    expect(measured.decide(call)).toBe('allow');
    expect(measured.decide({ ...call, destructive: ro(0.9) })).toBe('block');
  });
});
