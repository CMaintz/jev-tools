# jev-tools

TypeScript tools built on [TypeSafe AI's Jev](https://typesafe.ai/), a model that takes text state and returns typed answers (`choice` / `score` / `noul`) with a probability or confidence instead of prose.

Unofficial: not affiliated with TypeSafe AI.

All three tools use Jev the same way: ask narrow questions, branch on the typed answer in code, and send anything Jev is unsure about to a human or a larger model.

| Package                                  | What it does                                                                                                                                                                            | Distribution      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| [`@cmaintz/jev-guard`](packages/guard)   | Vets an LLM agent's tool calls before they run: `allow` / `block` / `hold`. Fails safe on low confidence, missing answers and provider errors. LangChain JS and Vercel AI SDK adapters. | npm library       |
| [`@cmaintz/jev-triage`](packages/triage) | GitHub Action that labels, prioritises, routes and dedupes issues; low-confidence answers go to a human label or an LLM.                                                                | GitHub Action     |
| [`@cmaintz/jev-sort`](packages/sort)     | CLI + library that streams JSONL/CSV rows through Jev and appends typed columns and a `_confidence` field.                                                                              | npm CLI / library |
| [`@cmaintz/jev-core`](packages/core)     | Shared Jev client used by the three above: question/answer types, TypeSafe and Cloudflare providers, retries, timeouts, response validation.                                            | npm library       |

## Install

The npm packages are **not yet published**. They are set up for publishing (`publishConfig` with public access and npm provenance), but until the first release, install from source:

```bash
git clone https://github.com/CMaintz/jev-tools.git
cd jev-tools
npm ci
npm run build
```

Once published: `npm install @cmaintz/jev-guard` or `npm install -g @cmaintz/jev-sort`.

The Action needs no install. Reference it by path:

```yaml
- uses: CMaintz/jev-tools/packages/triage@main # pin a jev-triage-v* tag or a commit SHA
  with:
    jev-api-key: ${{ secrets.JEV_API_KEY }}
```

Every tool needs a Jev key: a first-party key from [TypeSafe](https://typesafe.ai/), or a Cloudflare API token for [Workers AI (`typesafe/jev`)](https://developers.cloudflare.com/ai/models/typesafe/jev/).

## Usage

Guard an agent's shell tool:

```ts
import { shellPolicy, TypeSafeProvider, wrapTool } from '@cmaintz/jev-guard';

const provider = new TypeSafeProvider(process.env.JEV_API_KEY!);
const safeBash = wrapTool('bash', bash.execute, shellPolicy(), provider, {
  audit: (entry) => console.log(entry.verdict, entry.reasons),
});
await safeBash({ cmd: 'rm -rf /var/lib/postgresql/data' }); // throws GuardBlockedError unless allowed
```

Classify a JSONL file from the command line:

```bash
export JEV_API_KEY=...
jev-sort -q 'team:choice(billing,tech,sales)' -q 'urgent:noul' \
  --escalate 'conf<0.6' --review-out review.jsonl --reject-out rejects.jsonl \
  < tickets.jsonl > labeled.jsonl
```

Triage issues as they open: see [`packages/triage/examples/`](packages/triage/examples).

## What Jev is and isn't

Figures below are TypeSafe's own published numbers; this repo does not benchmark them.

- **Speed and price.** TypeSafe quotes 70–500 ms end to end, $0.042 per million input tokens, and free output tokens ([announcement](https://typesafe.ai/blog/introducing-system-one-models-and-jev)).
- **Accuracy.** On [TypeSafe's workflow evals](https://evals.typesafe.ai/), Jev scores 67.8%, measured as agreement with reference labels averaged from two frontier models across four example workflows. That is agreement with other models, not verified ground truth. Either way, treat answers as first-pass judgments; that is why every tool here gates on confidence.
- **Limits.** Text only. 64k tokens per request, 32k for state plus the longest question; 40 requests/s ([models page](https://docs.typesafe.ai/models)). No rationale, no generation, no arithmetic: counting, dates and routing tables stay in code.

## Status

- `jev-guard` 1.0, `jev-triage` 1.0 and `jev-sort` 1.0 were built as separate repos and merged here with their history (`git log -- packages/<name>`). `jev-core` is new: it replaces three identical copies of the provider code.
- Unit tests run against a stubbed provider. The triage package has a live smoke test (`packages/triage/test/live.test.ts`) and the guard package a live smoke script (`packages/guard/examples/smoke.mjs`); both need `JEV_API_KEY` and are skipped in CI.
- Not a security boundary: see the guard README.

## Development

```bash
npm ci
npm run lint        # eslint
npm run typecheck   # tsc per workspace
npm run test:coverage   # vitest across all packages, with the coverage floor
npm run build       # core → guard/sort (tsc) → triage (ncc bundle into packages/triage/dist)
```

`mise run gate` runs lint, typecheck, test and audit in the same order CI does. If you change `packages/triage` or `packages/core`, rebuild and commit `packages/triage/dist`: the Action runs the bundled file, and CI fails if it's out of date.

Releases use [release-please](https://github.com/googleapis/release-please) in manifest mode, with one version and changelog per package.

## Other languages

Jev clients for other ecosystems live in their own repos: [jev-java](https://github.com/CMaintz/jev-java) (Java SDK), [jev-dotnet](https://github.com/CMaintz/jev-dotnet) (.NET SDK) and [jev-rerank](https://github.com/CMaintz/jev-rerank) (Python RAG reranker).

## License

[MIT](LICENSE) © Christoffer Maintz
