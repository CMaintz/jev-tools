import { describe, expect, it } from 'vitest';
import { answerConfidence, answerValue, minConfidence, type Answer } from '../src/index.js';

const c: Answer = { type: 'choice', choice: 'bug', confidence: 0.7, probabilities: {} };
const s: Answer = { type: 'score', score: 2.5, confidence: 0.4, probabilities: {} };
const n: Answer = { type: 'noul', noul: 0.9 };

describe('answer helpers', () => {
  it('answerValue reads the label, score or probability', () => {
    expect([answerValue(c), answerValue(s), answerValue(n)]).toEqual(['bug', 2.5, 0.9]);
  });

  it('answerConfidence is undefined for noul', () => {
    expect([answerConfidence(c), answerConfidence(s), answerConfidence(n)]).toEqual([0.7, 0.4, undefined]);
  });

  it('minConfidence takes the lowest gated answer, 1 when none', () => {
    expect(minConfidence({ c, s, n })).toBe(0.4);
    expect(minConfidence({ n })).toBe(1);
    expect(minConfidence({})).toBe(1);
  });
});
