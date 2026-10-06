import { JevResponseError } from './errors.js';
import type { Answer, JevResponse, Question } from './jev-provider.js';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isProbability = (v: unknown): v is number => isFiniteNumber(v) && v >= 0 && v <= 1;

/** Returns the answer if it is well-formed for the question it answers, else undefined. */
function validAnswer(raw: unknown, question: Question): Answer | undefined {
  if (!isObject(raw)) return undefined;
  // Some transports omit the `type` tag; the question tells us what to expect.
  const type = raw.type ?? question.type;
  if (type !== question.type) return undefined;
  const probabilities = isObject(raw.probabilities) ? (raw.probabilities as Record<string, number>) : {};

  if (question.type === 'choice') {
    if (typeof raw.choice !== 'string' || !(raw.choice in question.criteria)) return undefined;
    if (!isProbability(raw.confidence)) return undefined;
    return { type: 'choice', choice: raw.choice, confidence: raw.confidence, probabilities };
  }
  if (question.type === 'score') {
    if (!isFiniteNumber(raw.score) || !isProbability(raw.confidence)) return undefined;
    const legend = isObject(raw.legend) ? { legend: raw.legend as Record<string, string> } : {};
    return { type: 'score', score: raw.score, confidence: raw.confidence, probabilities, ...legend };
  }
  if (!isProbability(raw.noul)) return undefined;
  return { type: 'noul', noul: raw.noul };
}

/**
 * Validate a raw provider response against the questions that were asked.
 * Throws if the envelope is unusable; drops individual answers that are missing or
 * malformed, so callers see them as "no answer" and can fail safe.
 */
export function parseJevResponse(json: unknown, questions: Record<string, Question>): JevResponse {
  if (!isObject(json) || !isObject(json.answers)) {
    throw new JevResponseError('Jev response has no answers object');
  }
  const answers: Record<string, Answer> = {};
  for (const [key, question] of Object.entries(questions)) {
    const answer = validAnswer(json.answers[key], question);
    if (answer) answers[key] = answer;
  }
  const usage = json.usage;
  const validUsage =
    isObject(usage) && isFiniteNumber(usage.input_tokens) && isFiniteNumber(usage.output_tokens)
      ? { usage: { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens } }
      : {};
  return { model: typeof json.model === 'string' ? json.model : 'unknown', answers, ...validUsage };
}
