# @cmaintz/jev-guard

A guardrail that sends an LLM agent's proposed tool call to [TypeSafe AI's Jev](https://typesafe.ai/) before it runs, and returns `allow`, `block` or `hold`.

Each guarded call costs one Jev request that asks all of the policy's risk questions at once. Your policy turns the typed answers into a verdict in plain TypeScript. Uncertainty never resolves to `allow`:

- a score/choice answer below the `escalateBelow` confidence floor turns `allow` into `hold`;
- a missing, mistyped or malformed answer turns `allow` into `hold`;
- a provider error (timeout, HTTP failure, invalid response) returns `hold` with the error, and that result is not cached.

`enforce` / `wrapTool` / the adapters throw `GuardBlockedError` on `block`, and on `hold` unless an `onHold` handler approves.

```bash
npm install @cmaintz/jev-guard
```

```ts
import { guard, noul, score, TypeSafeProvider, type GuardPolicy } from '@cmaintz/jev-guard';

const provider = new TypeSafeProvider(process.env.JEV_API_KEY!);

const policy: GuardPolicy = {
  dimensions: {
    risk: score(
      ['none', 'local-reversible', 'local-destructive', 'external-or-irreversible'],
      'Blast radius if this runs unintended',
    ),
    destructive: noul('Does this permanently delete or overwrite data?'),
    exfiltrates: noul('Does this send secrets to an external destination?'),
  },
  decide: (r) => {
    if (Number(r.risk?.value) >= 2 && Number(r.destructive?.value) >= 0.8) return 'block';
    if (Number(r.exfiltrates?.value) >= 0.7) return 'hold';
    return 'allow';
  },
  escalateBelow: 0.8, // score/choice answers below this confidence → hold
  perTool: { read_file: 'allow' }, // decided without a Jev call
};

const result = await guard(
  { tool: 'bash', arguments: { cmd: 'rm -rf /var/lib/postgresql/data' }, task: 'Clear the build cache' },
  policy,
  provider,
  { audit: (entry) => console.log(entry) },
);
// result.verdict: 'allow' | 'block' | 'hold'; result.reasons explains any fail-safe
```

## Why Jev

A regex denylist can't tell "delete the temp cache" from "delete prod". A second LLM reviewing every call adds latency and cost and returns prose you have to parse. Jev returns a typed value to branch on and a confidence to gate on, at a price (TypeSafe quotes $0.042 per million input tokens, output free) that makes checking every call affordable.

## Framework adapters

Both adapters use structural types, so they carry no dependency on the framework. Bring your own version.

**LangChain JS**, via the agent's `wrapToolCall` middleware hook:

```ts
import { createMiddleware } from 'langchain';
import { jevGuardMiddleware } from '@cmaintz/jev-guard/langchain';

const guardMw = createMiddleware(jevGuardMiddleware(policy, provider, { onHold: askHuman }));
// createAgent({ ..., middleware: [guardMw] })
```

**Vercel AI SDK**, wrapping a tool's `execute` and keeping `description` / `inputSchema`:

```ts
import { guardVercelTool } from '@cmaintz/jev-guard/vercel';

const safeBash = guardVercelTool('bash', bashTool, policy, provider);
// streamText({ ..., tools: { bash: safeBash } })
```

**Anything else:**

```ts
import { wrapTool } from '@cmaintz/jev-guard';
const safeExecute = wrapTool('bash', bash.execute, policy, provider);
```

## Presets

`shellPolicy()` · `filesystemPolicy()` · `sqlPolicy()` · `paymentsPolicy()`. Each blocks clearly dangerous calls, holds borderline ones and allows the rest. A missing or non-numeric readout counts as maximum risk. Spread a preset to tweak it:

```ts
import { shellPolicy, wrapTool } from '@cmaintz/jev-guard';

const strictShell = { ...shellPolicy(), escalateBelow: 0.9, perTool: { echo: 'allow' as const } };
```

`escalateBelow` gates score/choice answers only (Jev returns no confidence for a noul). So only `shellPolicy`, which has a score dimension, sets it. The noul-only presets gate through their probability thresholds.

## Floors from jev-eval

Instead of guessing `escalateBelow`, measure it with [jev-eval](https://github.com/CMaintz/jev-eval) on labeled tool calls and read its `thresholds.json`:

```ts
import { readFileSync } from 'node:fs';
import { escalateBelowFrom, shellPolicy } from '@cmaintz/jev-guard';

const base = shellPolicy();
const { escalateBelow, provenance, warnings } = escalateBelowFrom(
  readFileSync('thresholds.json', 'utf8'),
  base,
  'jev-latest', // optional: the model you run, to warn if the file was measured on another
);
warnings.forEach((w) => console.warn(w));
console.info('guard floor', provenance); // threshold, accuracy, coverage, n, source, model
const policy = { ...base, escalateBelow };
```

The floor applies to the policy's score/choice dimensions. With one of them it is that dimension's own gate. With several, the floor holds when any of them is below it, which is the same as the lowest confidence being below it, so it takes jev-eval's `composite` gate. The composite must have been measured on exactly those dimensions, or it throws. It also throws on a noul-only policy, a missing gate, or a file that is not contract version 1. It warns (without failing) on a model mismatch or when a dimension's wording differs from what jev-eval measured.

It only sets `escalateBelow`. Noul dimensions and the probability thresholds in `decide` are left as they are.

### Noul cut-offs

The presets' noul cut-offs (block when `destructive >= 0.8`, and so on) can come from jev-eval too. Run `jev-eval thresholds --yes-precision 0.9,0.7` so the file has `yesAt`, then:

```ts
import { noulCutoffsFrom, shellPolicy } from '@cmaintz/jev-guard';

const { cutoffs, provenance, warnings } = noulCutoffsFrom(readFileSync('thresholds.json', 'utf8'), shellPolicy());
const policy = shellPolicy({ cutoffs }); // every preset takes { cutoffs }
```

For each noul dimension, the strictest precision target jev-eval reached sets the `block` cut-off and the loosest sets `hold`. A wrong block costs more than a hold, so blocks get the higher precision and holds the higher recall. A dimension with one measured target uses it for both, and one jev-eval could not measure keeps the preset's built-in value. Both cases come back as warnings, along with a model mismatch or a reworded dimension. It throws on a file without `yesAt`, a policy without noul dimensions, or a file that measured none of them. Without `cutoffs`, presets behave exactly as before.

In your own policy, read `cutoffs.<dimension>?.block ?? <default>` inside `decide`.

## Caching

`createCache({ ttlMs, max })` memoizes verdicts for identical calls (same tool, task and arguments, whatever the key order). Pass it as `{ cache }`. Provider failures are never cached.

## Limitations

- **Not a security boundary.** Jev is probabilistic ([67.8% agreement](https://evals.typesafe.ai/) with frontier-model reference labels on TypeSafe's own evals), and a determined prompt injection can get through. Keep sandboxing, least-privilege credentials and allowlists; this is a cheap semantic layer on top of them.
- **Latency on the hot path.** Each guarded call waits for one round trip (TypeSafe quotes 70–500 ms). Use `perTool` for cheap, safe tools.
- **No rationale.** Jev returns numbers, not reasons. Log every verdict through `audit`, and show a `hold`'s inputs to the human deciding it.
- **No counting.** Keep quantitative limits ("deletes more than N rows") in code.

## Live smoke test

From the repo root (needs `JEV_API_KEY`; see [`.env.example`](.env.example)):

```bash
npm run build
node --env-file=packages/guard/.env packages/guard/examples/smoke.mjs
```

MIT © Christoffer Maintz
