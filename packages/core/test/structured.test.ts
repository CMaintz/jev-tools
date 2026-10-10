import { describe, expect, it } from 'vitest';
import { choice, noul, parseJevResponse, score, validateQuestions } from '../src/index.js';

const candidate = { name: 'John Smith', location: 'Oakland, California' };

describe('structured instructions and criteria', () => {
  it('builders pass objects and arrays through untouched', () => {
    const instructions = { candidate, question: 'Is the resume for the same person as `candidate`?' };
    expect(noul(instructions, { true: { same: 'person' }, false: ['different', 'person'] })).toEqual({
      type: 'noul',
      instructions,
      criteria: { true: { same: 'person' }, false: ['different', 'person'] },
    });
    expect(choice({ dup: null, new: { meaning: 'not seen before' } }, ['Pick', candidate]).criteria).toEqual({
      dup: null,
      new: { meaning: 'not seen before' },
    });
    expect(score([{ level: 'low' }, 'high'], { rate: 'fit' }).criteria).toEqual([{ level: 'low' }, 'high']);
  });

  it('validateQuestions accepts structured instructions and null options', () => {
    const ok = { a: noul({ candidate, question: 'Same?' }), b: choice({ x: null }, ['Pick one']) };
    expect(() => validateQuestions(ok)).not.toThrow();
  });

  it('validateQuestions treats an empty object or array as empty instructions', () => {
    expect(() => validateQuestions({ a: noul({}), b: noul([]) })).toThrow(
      'a: empty instructions; b: empty instructions',
    );
  });

  it('parseJevResponse matches a choice against null-described options', () => {
    const questions = { c: choice({ dup: null, new: null }, 'Pick') };
    const res = parseJevResponse({ answers: { c: { choice: 'dup', confidence: 0.9, probabilities: {} } } }, questions);
    expect(res.answers.c).toMatchObject({ choice: 'dup' });
  });
});
