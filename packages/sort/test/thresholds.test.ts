import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { choice, noul, score, type Question } from '@cmaintz/jev-core';
import {
  gatedIds,
  modelWarning,
  parseThresholds,
  pickGate,
  provenance,
  type ThresholdsFile,
} from '../src/core/thresholds.js';

const fixture = readFileSync(new URL('./fixtures/thresholds.json', import.meta.url), 'utf8');
const doc = () => parseThresholds(fixture);
const withoutComposite = (): ThresholdsFile => {
  const { composite: _, ...rest } = doc();
  return rest;
};

const team = choice({ billing: 'Billing', tech: 'Tech' });
const sentiment = score(['negative', 'neutral', 'positive']);
const urgent = noul('Is it urgent?');

describe('parseThresholds', () => {
  it('reads a jev-eval contract v1 file', () => {
    expect(doc().composite?.threshold).toBe(0.82);
    expect(doc().questions['team']?.threshold).toBe(0.8);
  });

  it('refuses other versions and malformed files', () => {
    expect(() => parseThresholds('{"version": 2, "questions": {}}')).toThrow(/version 1/);
    expect(() => parseThresholds('null')).toThrow(/version 1/);
    expect(() => parseThresholds('{"version": 1}')).toThrow(/questions/);
    expect(() => parseThresholds('{"version": 1, "questions": {}, "composite": {"threshold": 1}}')).toThrow(
      /composite/,
    );
  });
});

describe('gatedIds', () => {
  it('keeps choice and score, sorted, and drops noul', () => {
    expect(gatedIds({ urgent, team, sentiment })).toEqual(['sentiment', 'team']);
  });
});

describe('pickGate', () => {
  it('uses the composite gate when the gated questions match', () => {
    const picked = pickGate(doc(), { team, urgent, sentiment });
    expect(picked).toMatchObject({ source: 'composite', model: 'jev-latest' });
    expect(picked.gate.threshold).toBe(0.82);
  });

  it('refuses a composite measured on other questions', () => {
    expect(() => pickGate(doc(), { team, other: sentiment })).toThrow(/gates \[sentiment, team\] but this run gates/);
  });

  it("uses a single gated question's own gate even when the file has a composite", () => {
    expect(pickGate(doc(), { team, urgent })).toMatchObject({ source: 'team', gate: { threshold: 0.8 } });
  });

  it("uses the single gated question's own gate when there is no composite", () => {
    const picked = pickGate(withoutComposite(), { team, urgent });
    expect(picked.source).toBe('team');
    expect(picked.gate.threshold).toBe(0.8);
  });

  it('explains a missing per-question gate', () => {
    expect(() => pickGate(withoutComposite(), { region: team })).toThrow(/no gate for "region"/);
  });

  it('explains a missing composite for several gated questions', () => {
    expect(() => pickGate(withoutComposite(), { team, sentiment })).toThrow(/refused or found the row gate unstable/);
  });

  it('refuses when every question is a noul', () => {
    const questions: Record<string, Question> = { urgent };
    expect(() => pickGate(doc(), questions)).toThrow(/nothing to gate on/);
  });
});

describe('modelWarning and provenance', () => {
  it('warns only on a model mismatch', () => {
    expect(modelWarning(doc(), 'jev-latest')).toBeUndefined();
    expect(modelWarning(doc(), 'jev-1.13.0')).toMatch(/re-measure after a model change/);
  });

  it('says where the gate came from and what it buys', () => {
    expect(provenance(pickGate(doc(), { team, sentiment }), 'thresholds.json')).toBe(
      'gate 0.82 from thresholds.json (jev-eval: 94.0% at 61.0% coverage, n=300, model jev-latest)',
    );
    expect(provenance(pickGate(withoutComposite(), { team }), 't.json')).toContain('from t.json "team"');
  });
});
