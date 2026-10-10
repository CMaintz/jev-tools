/**
 * The Jev provider port. jev-guard, jev-triage and jev-sort depend only on this
 * interface, never on a concrete backend (Cloudflare Workers AI vs. TypeSafe first-party).
 *
 * Shapes follow https://docs.typesafe.ai/api and Cloudflare's model page (checked 2026-09).
 */

/** Any JSON value. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * Prompt text the API accepts: a plain string, or a structured object or array. Structured
 * instructions carry the data a question refers to, e.g. `{ candidate, question }` where the
 * question names `` `candidate` `` in backticks.
 */
export type JevText = string | JsonValue[] | { [key: string]: JsonValue };

type ChoiceQuestion = {
  type: 'choice';
  instructions: JevText;
  /** label -> description of when to pick it, or null when the label says it all. Up to 255 options. */
  criteria: Record<string, JevText | null>;
};

type ScoreQuestion = {
  type: 'score';
  instructions: JevText;
  /** ordered rubric levels, low -> high (2..10 levels). */
  criteria: JevText[];
};

type NoulQuestion = {
  type: 'noul';
  instructions: JevText;
  /** optional descriptions of what true/false mean; improves calibration. */
  criteria?: { true: JevText; false: JevText };
};

export type Question = ChoiceQuestion | ScoreQuestion | NoulQuestion;

type ChoiceAnswer = {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};

type ScoreAnswer = {
  type: 'score';
  /** may be fractional, e.g. 1.04 */
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
  legend?: Record<string, string>;
};

/** Noul returns a bare probability in [0,1] that the statement is true. No confidence field. */
type NoulAnswer = {
  type: 'noul';
  noul: number;
};

export type Answer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

export interface JevRequest {
  /** structured or unstructured program state; text only (no images). */
  state: unknown;
  /** batch of narrow, well-scoped questions evaluated in parallel against `state`. */
  questions: Record<string, Question>;
}

export interface JevResponse {
  model: string;
  answers: Record<string, Answer>;
  usage?: { input_tokens: number; output_tokens: number };
}

export interface EvaluateOptions {
  /** cancels the call, including any retry backoff; the promise rejects with the signal's reason. */
  signal?: AbortSignal;
  /** per-attempt timeout in ms for this call, overriding the provider's. */
  timeoutMs?: number;
}

export interface JevProvider {
  /** One round-trip. Adding questions is near-free: they are evaluated in parallel. */
  evaluate(req: JevRequest, opts?: EvaluateOptions): Promise<JevResponse>;
}
