# Changelog

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
