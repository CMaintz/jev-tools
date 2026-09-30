import { describe, expect, it } from 'vitest';
import { parseJevResponse, type Question } from '../src/index.js';

const questions: Record<string, Question> = {
  team: { type: 'choice', instructions: 'team', criteria: { billing: 'b', tech: 't' } },
  severity: { type: 'score', instructions: 'sev', criteria: ['low', 'mid', 'high'] },
  urgent: { type: 'noul', instructions: 'urgent?' },
};

describe('parseJevResponse', () => {
  it('keeps well-formed answers and usage', () => {
    const res = parseJevResponse(
      {
        model: 'jev-1.13.0',
        answers: {
          team: { type: 'choice', choice: 'tech', confidence: 0.9, probabilities: { tech: 0.9 } },
          severity: { type: 'score', score: 1.2, confidence: 0.8, probabilities: {}, legend: { '0': 'low' } },
          urgent: { type: 'noul', noul: 0.3 },
        },
        usage: { input_tokens: 10, output_tokens: 2 },
      },
      questions,
    );
    expect(Object.keys(res.answers)).toEqual(['team', 'severity', 'urgent']);
    expect(res.answers.severity).toMatchObject({ score: 1.2, legend: { '0': 'low' } });
    expect(res.usage).toEqual({ input_tokens: 10, output_tokens: 2 });
    expect(res.model).toBe('jev-1.13.0');
  });

  it('infers the type tag from the question when the answer omits it', () => {
    const res = parseJevResponse({ answers: { urgent: { noul: 0.7 } } }, questions);
    expect(res.answers.urgent).toEqual({ type: 'noul', noul: 0.7 });
    expect(res.model).toBe('unknown');
    expect(res.usage).toBeUndefined();
  });

  it.each([
    ['unknown choice label', { team: { type: 'choice', choice: 'sales', confidence: 0.9 } }],
    ['confidence out of range', { team: { type: 'choice', choice: 'tech', confidence: 1.5 } }],
    ['non-finite score', { severity: { type: 'score', score: null, confidence: 0.9 } }],
    ['score without confidence', { severity: { type: 'score', score: 1 } }],
    ['noul out of range', { urgent: { type: 'noul', noul: 2 } }],
    ['type mismatch', { urgent: { type: 'choice', choice: 'tech', confidence: 1 } }],
    ['not an object', { urgent: 0.5 }],
  ])('drops an answer with %s', (_name, answers) => {
    expect(parseJevResponse({ answers }, questions).answers).toEqual({});
  });

  it('ignores answers to questions that were not asked', () => {
    expect(parseJevResponse({ answers: { other: { type: 'noul', noul: 1 } } }, questions).answers).toEqual({});
  });

  it.each([null, [], 'x', { answers: [] }])('throws on an unusable envelope: %j', (json) => {
    expect(() => parseJevResponse(json, questions)).toThrow('no answers object');
  });
});
