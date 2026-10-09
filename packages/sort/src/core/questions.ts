import { choice, noul, score, type Question } from '@cmaintz/jev-core';

/** Library helpers to declare questions (the Jev question shapes), shared with @cmaintz/jev-core. */
export { choice, noul, score };

/** Parse one inline spec: `name:choice(a,b,c)` | `name:noul` | `name:score(low,mid,high)`. */
export function parseQuestion(spec: string): [name: string, question: Question] {
  const colon = spec.indexOf(':');
  if (colon < 1) throw new Error(`bad -q "${spec}": expected name:type(...)`);
  const name = spec.slice(0, colon).trim();
  const body = spec.slice(colon + 1).trim();
  const m = /^(\w+)(?:\(([^)]*)\))?$/.exec(body);
  if (!m?.[1]) throw new Error(`bad -q "${spec}"`);
  const kind = m[1];
  const args = (m[2] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (kind === 'noul') return [name, noul(name)];
  if (kind === 'choice') {
    if (args.length < 2) throw new Error(`choice "${name}" needs >= 2 options`);
    return [name, choice(Object.fromEntries(args.map((a) => [a, a])), name)];
  }
  if (kind === 'score') {
    if (args.length < 2) throw new Error(`score "${name}" needs >= 2 levels`);
    return [name, score(args, name)];
  }
  throw new Error(`unknown question type "${kind}" in "${spec}"`);
}

export function parseQuestions(specs: string[]): Record<string, Question> {
  const out: Record<string, Question> = {};
  for (const s of specs) {
    const [name, q] = parseQuestion(s);
    out[name] = q;
  }
  if (Object.keys(out).length === 0) throw new Error('no questions; use -q name:type(...)');
  return out;
}
