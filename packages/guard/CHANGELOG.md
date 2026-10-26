# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Planned

- LangChain **Python** parity (a PyPI package mirroring the core).

## [2.0.0](https://github.com/CMaintz/jev-tools/compare/guard-v1.1.0...guard-v2.0.0) (2026-10-26)

### Breaking

- The re-exported `TypeSafeProvider` and `CloudflareProvider` take an options object: `new TypeSafeProvider({ apiKey })`, `new CloudflareProvider({ accountId, apiToken })`.
- Requires Node 22 or newer, and `@cmaintz/jev-core` ^1.0.0.

### Added

- `escalateBelowFrom(thresholds, policy, model?)` sets `escalateBelow` from a jev-eval thresholds.json, picking the gate the way jev-sort does, and warns on a model mismatch or a reworded dimension.
- `noulCutoffsFrom(thresholds, policy, model?)` reads noul cut-offs from `yesAt`: the strictest precision target sets block, the loosest sets hold. Presets accept `{ cutoffs }`. A single target sets hold only.

### Changed

- `paymentsPolicy` also holds when a transfer is irreversible, not only when it moves money.

## [1.1.0] - 2026-10-09

First release published to npm.

### Changed

- Moved into the [jev-tools](https://github.com/CMaintz/jev-tools) monorepo. The provider code (`TypeSafeProvider`, `CloudflareProvider`, `JevProvider`) and the verdict cache now come from [`@cmaintz/jev-core`](https://www.npmjs.com/package/@cmaintz/jev-core); the exports and their behavior are unchanged.
- Default model is now `jev-latest` (was the pinned `jev-1.13.0`), tracking the recommended model. Pass an explicit model to `TypeSafeProvider` to pin a version for reproducibility.

## [1.0.0] - 2026-09-23

First stable release - a framework-agnostic LLM tool-call guardrail powered by TypeSafe AI's Jev.

### Added

- **Core:** framework-agnostic `guard(toolCall, policy, provider) → Verdict` (`allow` / `block` / `hold`)
  over pure, testable modules (`buildState`, `buildQuestions`, `decide` with a fail-safe wrapper).
- **Typed policy API:** `score` / `noul` / `choice` helpers; a typed `decide` callback (no string DSL);
  `escalateBelow` confidence floor; `perTool` bypass.
- **Enforcement:** `enforce(call, result)` - `allow` proceeds, `block` throws `GuardBlockedError`,
  `hold` asks an `onHold` handler (fail-safe: denies without one); `observe` mode; framework-agnostic `wrapTool()`.
- **Framework adapters** (dependency-free, subpath exports): `jev-guard/langchain`
  (`jevGuardMiddleware` for LangChain JS's `wrapToolCall`) and `jev-guard/vercel`
  (`guardVercelTool` wrapping a Vercel AI SDK tool's `execute`).
- **Policy presets:** `shellPolicy` / `filesystemPolicy` / `sqlPolicy` / `paymentsPolicy`.
- **Verdict caching:** `createCache({ ttlMs, max })` - identical repeat calls skip the Jev round-trip (`fromCache`).
- **Shared `JevProvider` port** (TypeSafe + Cloudflare, `postJson` backoff);
  onboarded onto the Foundry gate.
