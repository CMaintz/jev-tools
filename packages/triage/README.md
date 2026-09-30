# jev-triage (GitHub Action)

Issue triage powered by [TypeSafe AI's Jev](https://typesafe.ai/). When an issue opens, its title and body go to Jev in one request with your configured questions. Confident answers become labels, a priority and a team mention. Low-confidence answers are never applied: they get a `triage:needs-human` label, or are re-asked to an LLM.

```yaml
# .github/workflows/triage.yml
on:
  issues:
    types: [opened, edited, reopened]
permissions:
  issues: write
  contents: read
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - uses: CMaintz/jev-tools/packages/triage@main # pin a jev-triage-v* tag or a full commit SHA
        with:
          jev-api-key: ${{ secrets.JEV_API_KEY }}
```

Plus a config file at `.github/jev-triage.yml`. [`examples/jev-triage.yml`](examples/jev-triage.yml) shows every option.

## Using the Action from the monorepo

The Action lives in a subdirectory, so the `uses:` path includes it: `CMaintz/jev-tools/packages/triage@<ref>`. GitHub runs the committed bundle at `packages/triage/dist/index.js`, which needs no install step.

- **Pinning:** releases are tagged per package as `jev-triage-vX.Y.Z` (release-please). Until the first monorepo release is tagged, pin a full commit SHA rather than `main`.
- **Existing users:** `uses: CMaintz/jev-triage@v1` still points at the old repo's `v1` tag and keeps working. New fixes land here only.

## How it works

1. Title + body (truncated to 8,000 characters) and existing labels become the Jev `state`.
2. Every question in the config goes out in one request.
3. `choice` answers at or above `escalate_below` confidence become labels (`apply_as_label`). `score` answers map to the nearest level (`label_prefix`, e.g. `priority:major`). `noul` answers apply a label above `min`, and `alert: true` also emits a workflow warning.
4. Routing is a deterministic map from the chosen type to a team handle. Jev never picks the team.
5. The run's job summary lists labels, escalations, duplicates, input tokens and an estimated cost, computed from TypeSafe's list price of $0.042 per million input tokens.

## Beyond per-issue triage

- **Backlog sweep:** on `workflow_dispatch` / `schedule` it walks every open issue, skipping PRs and anything already carrying `marker_label`, up to `max_issues` per run. See [`examples/backlog-workflow.yml`](examples/backlog-workflow.yml).
- **LLM escalation:** with `on_low_confidence: escalate` and an `llm-api-key`, low-confidence issues are re-asked to any OpenAI-compatible chat endpoint (`llm-model`, `llm-base-url`). Its answers are validated against the same questions, and it leaves a one-line rationale comment.
- **Duplicate detection** (`dedupe: true`): GitHub search finds candidate issues by title. Jev picks the duplicate or `none` from that bounded set, and a confident match gets `possible-duplicate` plus a link. Nothing is auto-closed.

## Inputs

| Input                                        | Required       | Default                  | Notes                                                               |
| -------------------------------------------- | -------------- | ------------------------ | ------------------------------------------------------------------- |
| `jev-api-key`                                | yes            |                          | TypeSafe key, or a Cloudflare API token when `provider: cloudflare` |
| `cloudflare-account-id`                      | for Cloudflare |                          |                                                                     |
| `github-token`                               | no             | `github.token`           | needs `issues: write`                                               |
| `config-path`                                | no             | `.github/jev-triage.yml` |                                                                     |
| `llm-api-key` / `llm-model` / `llm-base-url` | no             | `gpt-4o-mini`, OpenAI    | enables escalation                                                  |
| `dry-run`                                    | no             | `false`                  | comment the suggested labels instead of applying them               |

Outputs: `applied-labels` (single-issue runs) and `escalated`.

## Limitations

- **First pass, not a decision-maker.** On [TypeSafe's workflow evals](https://evals.typesafe.ai/) Jev scores 67.8% agreement with frontier-model reference labels. The confidence gate is the point.
- **Text only.** Screenshots and attachments carry no signal.
- **No arithmetic or dates.** Those stay in code, as routing does.

## Development

Built with [`@vercel/ncc`](https://github.com/vercel/ncc) from the repo root: `npm run build`. Commit the updated `dist/`; CI fails if it is stale. `test/live.test.ts` classifies a sample issue against the real API when `JEV_API_KEY` is set, and is skipped otherwise.

MIT © Christoffer Maintz
