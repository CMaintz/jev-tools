# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1](https://github.com/CMaintz/jev-tools/compare/triage-v1.1.0...triage-v1.1.1) (2026-10-26)

### BREAKING CHANGES

* stable 1.0 API, with guard and sort 2.0 (efd0820)

### Features

* stable 1.0 API, with guard and sort 2.0 (efd0820)

### Bug Fixes

* lock file maintenance, bundling undici 6.29.1 (#38) (7d033f4)
* update all non-major dependencies (#35) (6d1816a)

## [1.1.0](https://github.com/CMaintz/jev-tools/compare/ecddb6f...triage-v1.1.0) (2026-10-11)

First release from the jev-tools monorepo. `CMaintz/jev-triage@v1` picks it up through its pin.

### Changed

- Default model is now `jev-latest` (was the pinned `jev-1.13.0`), tracking the recommended model. Set `model:` in config to pin a version for reproducibility.
- The Action runs on Node 24.

### Fixed

- `model:` is honoured with `provider: cloudflare`; it was dropped before.
- A hung Jev request times out after 30 s per attempt, and a malformed answer counts as no answer instead of being used.
- A failure writing the job summary now fails the run instead of being an unhandled rejection.

## [1.0.0] - 2026-09-24

First stable release - Jev-powered GitHub issue triage: per-issue, backlog sweep, LLM escalation, and duplicate detection.

### Added

- **Per-issue triage:** title+body → Jev `state`, one batched call of choice/score/noul questions →
  typed answers become labels, `priority:` scores, spam/security flags, and deterministic team routing;
  confidence-gated with a `triage:needs-human` fallback and a dry-run mode.
- **Backlog sweep** - on `workflow_dispatch` / `schedule`, map-reduce every open issue (skips PRs and
  `marker_label`-tagged issues; capped by `max_issues`). Sweep a whole backlog for pennies.
- **LLM escalation cascade** - `on_low_confidence: escalate` + `llm-api-key` re-classifies low-confidence
  issues via any OpenAI-compatible endpoint (`llm-model` / `llm-base-url`), then labels + leaves a rationale.
- **Duplicate detection** (`dedupe: true`) - GitHub search retrieves candidates; a Jev Choice picks the
  duplicate (or "none"); a match gets `possible-duplicate` + a link (never auto-closes).
- `GitHubPort` seam keeps Octokit at the edge so the orchestrator (`triageIssue` / `triageBacklog`) is
  fully unit-tested; Step Summary reports labels, escalations, duplicates, skipped, tokens, and cost.
- Shared Jev provider port (TypeSafe + Cloudflare, `postJson` backoff); onboarded onto the Foundry gate.

### Known issues

- 1 high `undici` advisory reaches in via `@actions/github` (the official GitHub toolkit); no upstream fix
  yet, and it's below the `--audit-level=critical` gate. Renovate bumps it when fixed.
- The habits (structural-smell) CI job seeds its comment baseline via the `bootstrap` workflow on first run.
