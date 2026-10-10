# Changelog

## [0.4.0](https://github.com/CMaintz/jev-tools/compare/core-v0.3.0...core-v0.4.0) (2026-10-10)

### Features

* structured prompts and a request timeout setting (9b848f7)

### Bug Fixes

* do not start a request once the signal has aborted (1f618b7)

## 0.4.0

### Features

- Structured prompts: question `instructions` and `criteria` accept a JSON object or array as well as a string (new `JevText` and `JsonValue` types), matching the API. Choice options may map to `null`. The builders take the wider types, and `validateQuestions` treats an empty object or array as empty instructions.
- Request timeout setting: `timeoutMs` on `createProvider`, as the 4th constructor argument of `TypeSafeProvider` and `CloudflareProvider`, per call via `evaluate(req, { timeoutMs })`, and `JEV_TIMEOUT_MS` in `providerFromEnv`. `DEFAULT_TIMEOUT_MS` (30 s) is exported.

### Fixes

- A signal that has already aborted now rejects before any request is sent, instead of starting a fetch that is cancelled straight away.

### Breaking

- Code that reads `Question.instructions` or `criteria` back as a string must now handle objects and arrays too. Code that only builds questions is unaffected.

## 0.3.0

### Features

- `createProvider({ provider, apiKey, model, accountId, baseUrl })`: builds a TypeSafe or Cloudflare provider from plain settings and throws `JevRequestError` when one is missing. On Cloudflare, `jev-latest` maps to `typesafe/jev`, so one model setting works on both backends. `providerFromEnv` now uses it, so `JEV_MODEL=jev-latest` works with `JEV_PROVIDER=cloudflare`.

## 0.2.0

First version intended for npm. Folds in what the standalone copies of the client (leash, Foundry, cmaintz-skills) had that core lacked, so they can switch to this package.

### Features

- `providerFromEnv(env?)`: builds a TypeSafe or Cloudflare provider from `JEV_PROVIDER`, `JEV_API_KEY`, `JEV_MODEL`, `CLOUDFLARE_ACCOUNT_ID` and `TYPESAFE_AI_BASE_URL`; returns `null` when no key (or, for Cloudflare, no account id) is set so callers fail open.
- Typed errors: `JevError` base with `JevHttpError` (`status`, `body`, `retryable`), `JevTimeoutError` (`timeoutMs`) and `JevResponseError`. Messages are unchanged from 0.1.0.
- Cancellation: `evaluate(req, { signal })` and `postJson(..., { signal })` abort the request and any retry backoff, rejecting with the signal's reason.
- Question builders `choice`, `noul`, `score` (moved from jev-sort), and `validateQuestions` to check a batch against the documented API limits before sending (`JevRequestError`).
- Answer helpers `answerValue`, `answerConfidence`, `minConfidence`.
- `createTtlCache` (moved from jev-guard), `RateLimiter` (moved from jev-sort), and the provider wrappers `withCache` and `withRateLimit`.
- Requires Node 20.3 or newer (`AbortSignal.any`).
- `postJson` also accepts a bare number as its 4th argument, read as `maxAttempts`, matching the standalone copies.
- README with install, usage, environment and error reference; package ships this changelog.

## 0.1.0

- Initial workspace-only version: question/answer types, `TypeSafeProvider`, `CloudflareProvider`, retrying `postJson` with per-attempt timeout, `parseJevResponse` validation, `stableStringify`.
