import { describe, expect, it } from 'vitest';
import { choice, JevError, JevRequestError, noul, score, validateQuestions } from '../src/index.js';

describe('question builders', () => {
  it('build the wire shapes', () => {
    expect(choice({ a: 'A', b: 'B' }, 'Pick')).toEqual({
      type: 'choice',
      instructions: 'Pick',
      criteria: { a: 'A', b: 'B' },
    });
    expect(score(['low', 'high'])).toEqual({ type: 'score', instructions: '', criteria: ['low', 'high'] });
    expect(noul('Spam?')).toEqual({ type: 'noul', instructions: 'Spam?' });
    expect(noul('Spam?', { true: 'ad', false: 'real' })).toEqual({
      type: 'noul',
      instructions: 'Spam?',
      criteria: { true: 'ad', false: 'real' },
    });
  });
});

function thrown(fn: () => void): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

describe('validateQuestions', () => {
  it('accepts questions within the documented limits', () => {
    const ok = { a: choice({ x: 'X' }, 'Pick'), b: score(['1', '2'], 'Rate'), c: noul('Ok?') };
    expect(() => validateQuestions(ok)).not.toThrow();
  });

  it('rejects an empty batch', () => {
    expect(() => validateQuestions({})).toThrow('no questions');
  });

  it('names every problem in one JevRequestError', () => {
    const many = Object.fromEntries(Array.from({ length: 256 }, (_, i) => [`o${i}`, '']));
    const bad = { a: choice({}, 'Pick'), b: score(['1'], 'Rate'), c: noul(' '), d: choice(many, 'Pick') };
    const err = thrown(() => validateQuestions(bad));
    expect(err).toBeInstanceOf(JevRequestError);
    expect(err).toBeInstanceOf(JevError);
    expect((err as Error).message).toBe(
      'invalid Jev questions: a: choice needs 1..255 options, got 0; b: score needs 2..10 levels, got 1; ' +
        'c: empty instructions; d: choice needs 1..255 options, got 256',
    );
  });

  it('rejects more than 10 score levels', () => {
    expect(() => validateQuestions({ s: score(Array.from({ length: 11 }, String), 'Rate') })).toThrow('got 11');
  });
});
