import { answerValue, minConfidence, type Answer } from '@cmaintz/jev-core';

export interface Columns {
  columns: Record<string, string | number>;
  /** min of the gated (choice/score) confidences; 1 when only nouls are present. */
  confidence: number;
}

/**
 * Flatten Jev answers into output columns. Choice -> its label, Score -> its number,
 * Noul -> its raw probability. Row confidence is the min over the gated answers, so a
 * row is only "confident" if every choice/score cleared the bar.
 */
export function answersToColumns(answers: Record<string, Answer>): Columns {
  const columns: Record<string, string | number> = {};
  for (const [name, a] of Object.entries(answers)) columns[name] = answerValue(a);
  return { columns, confidence: minConfidence(answers) };
}
