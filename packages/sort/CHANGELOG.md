# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1](https://github.com/CMaintz/jev-tools/compare/sort-v1.1.0...sort-v1.1.1) (2026-10-10)

### Bug Fixes

* honor the model setting for Cloudflare in sort and triage (65352cd)

## [1.1.0] - 2026-10-09

First release published to npm.

### Changed

- Moved into the [jev-tools](https://github.com/CMaintz/jev-tools) monorepo. The provider code, question builders and `RateLimiter` now come from [`@cmaintz/jev-core`](https://www.npmjs.com/package/@cmaintz/jev-core); the exports and their behavior are unchanged.
- Default model is now `jev-latest` (was the pinned `jev-1.13.0`), tracking the recommended model. Use `--model` or `model:` in config to pin a version for reproducibility.

## [1.0.0] - 2026-09-25

First stable release — "jq for judgment": stream rows through Jev and get typed columns + confidence, at scale.

### Added

- **CLI + library:** JSONL rows on stdin → typed columns + a `_confidence` field, one batched Jev call each.
- **Questions** inline (`-q 'name:choice/noul/score'`) **or** via a richer **YAML `--config`** (full instructions + criteria).
- **CSV + JSONL** for input and stdout (`--format`); `--escalate 'conf<0.6'` splits uncertain rows to a review file, pipeline-safe non-zero exit (`--allow-review` opts out).
- **`--eval labeled.jsonl`** — per-question agreement against a hand-labeled sample (truth stripped from the state); measure accuracy on your own data before a large run.
- **`--dedupe`** (skip identical states) and a **`--rate` limiter** (token bucket) for large jobs.
- Pure tested core (`parseQuestions`, `answersToColumns`, `parseEscalate`, `matches`), a bounded-concurrency streaming mapper (`mapPool`), and the `classify()` library API.
- Shared `JevProvider` port (TypeSafe + Cloudflare); onboarded onto the Foundry gate.

### Deferred to v1.x (see the spec)

- `--resume` checkpointing; glob/RSS sources; sampling + cost preflight; a live-key end-to-end run.
