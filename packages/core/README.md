# @cmaintz/jev-core

A small, zero-dependency TypeScript client for [TypeSafe AI's Jev](https://typesafe.ai/): typed questions in, typed answers out, over the TypeSafe API or Cloudflare Workers AI. It is the shared client behind [`@cmaintz/jev-guard`](../guard), [`jev-triage`](../triage) and [`@cmaintz/jev-sort`](../sort).

Unofficial: not affiliated with TypeSafe AI.

## Install

```bash
npm install @cmaintz/jev-core
```

ESM only, Node 20.3 or newer (uses the global `fetch`). No runtime dependencies.

## Usage

Build a provider from the environment and fail open when no key is configured:

```ts
import { providerFromEnv } from '@cmaintz/jev-core';

const jev = providerFromEnv(); // null when JEV_API_KEY is unset
if (jev) {
  const { answers } = await jev.evaluate({
    state: { message: 'My card was charged twice' },
    questions: { billing: { type: 'noul', instructions: 'Is this about a payment problem?' } },
  });
  const billing = answers.billing; // missing if Jev's answer was malformed: treat as "no answer"
  if (billing?.type === 'noul' && billing.noul > 0.8) routeToBilling();
}
```

Or construct a provider explicitly:

```ts
import { CloudflareProvider, TypeSafeProvider } from '@cmaintz/jev-core';

const typesafe = new TypeSafeProvider(process.env.JEV_API_KEY!); // model 'jev-latest'
const workersAi = new CloudflareProvider(accountId, apiToken); // model 'typesafe/jev'
```

### Building blocks

```ts
import {
  choice,
  minConfidence,
  noul,
  RateLimiter,
  validateQuestions,
  withCache,
  withRateLimit,
} from '@cmaintz/jev-core';

const questions = {
  team: choice({ billing: 'payments, invoices', tech: 'bugs, outages' }, 'Which team owns this?'),
  urgent: noul('Does the customer need an answer today?'),
};
validateQuestions(questions); // throws JevRequestError on a batch the API would reject

const jev = withCache(withRateLimit(provider, new RateLimiter(600))); // 600/min, repeats served from cache
const { answers } = await jev.evaluate({ state: ticket, questions }, { signal: AbortSignal.timeout(5_000) });
if (minConfidence(answers) < 0.6) sendToHuman(ticket);
```

### Environment

`providerFromEnv(env = process.env)` reads:

| Variable                | Meaning                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `JEV_API_KEY`           | TypeSafe API key, or Cloudflare API token. Unset: returns `null`.                          |
| `JEV_PROVIDER`          | `typesafe` (default) or `cloudflare`.                                                      |
| `JEV_MODEL`             | Model override. Defaults: `jev-latest` (TypeSafe), `typesafe/jev` (CF).                    |
| `CLOUDFLARE_ACCOUNT_ID` | Required for `cloudflare`. Unset: returns `null`.                                          |
| `TYPESAFE_AI_BASE_URL`  | TypeSafe base URL override (proxy, self-host, mock). Default `https://api.typesafe.ai/v1`. |
| `JEV_TIMEOUT_MS`        | Per-attempt request timeout in ms. Default 30 000.                                         |

Empty strings count as unset, and so does a `JEV_TIMEOUT_MS` that is not a positive number.

## API

- **Types:** `Question` (`choice` / `score` / `noul`), `Answer`, `JevRequest`, `JevResponse`, the `JevProvider` port, `JevEnv`, and `JevText` / `JsonValue`.
- **Structured prompts:** instructions and criteria are `JevText`: a string, or a JSON object or array, as the API allows. Put the data a question refers to next to it and name it in backticks, e.g. ``noul({ candidate, question: 'Is this the same person as `candidate`?' })``. Choice options may map to `null` when the label needs no description.
- **`TypeSafeProvider(apiKey, model = 'jev-latest', baseUrl = 'https://api.typesafe.ai/v1', timeoutMs = 30_000)`** and **`CloudflareProvider(accountId, apiToken, model = 'typesafe/jev', timeoutMs = 30_000)`**. Both validate the response with `parseJevResponse`. `evaluate(req, { timeoutMs })` overrides the timeout for one call.
- **`providerFromEnv(env?)`:** see above.
- **`createProvider({ provider, apiKey, model, accountId, baseUrl, timeoutMs })`:** the same choice from plain settings (CLI flags, Action inputs). Throws `JevRequestError` when the key, or the Cloudflare account id, is missing. On Cloudflare, `jev-latest` maps to `typesafe/jev`.
- **`postJson(url, headers, body, { maxAttempts, timeoutMs } | maxAttempts)`:** retries 429/529 with exponential backoff (250 ms, 500 ms, 1 s, as [TypeSafe's API docs](https://docs.typesafe.ai/api) recommend), aborts each attempt after `timeoutMs` (default 30 s), and rejects non-JSON bodies. `maxAttempts` defaults to 4.
- **`parseJevResponse(json, questions)`:** throws if there is no `answers` object, and drops any answer that is missing, has the wrong type for its question, names an unknown choice, or has a non-finite or out-of-range number. Callers see those as "no answer" and can fail safe.
- **`choice(options, instructions?)`, `noul(instructions, criteria?)`, `score(levels, instructions?)`:** question builders. **`validateQuestions(questions)`:** throws a `JevRequestError` listing every question that breaks the documented limits (choice 1 to 255 options, score 2 to 10 levels, non-empty instructions). Providers do not call it for you.
- **`answerValue(a)`** (label, score or probability), **`answerConfidence(a)`** (undefined for noul), **`minConfidence(answers)`** (lowest choice/score confidence, 1 if none).
- **Cancellation:** every `evaluate(req, { signal })` and `postJson(..., { signal })` call takes an `AbortSignal`; aborting also stops retry backoff and rejects with the signal's reason.
- **`withCache(provider, { ttlMs, max } | cache)`:** serves identical requests from a TTL cache; only successful responses are cached. **`createTtlCache({ ttlMs, max })`** is the cache it uses (60 s, 1000 entries by default).
- **`withRateLimit(provider, new RateLimiter(perMinute))`:** spaces calls evenly under a per-minute budget.
- **`stableStringify(value)`:** JSON with object keys sorted recursively, for cache and dedupe keys.

### Errors

Every error the client raises extends `JevError`, so `catch (e) { if (e instanceof JevError) ... }` covers them all:

| Class              | When                                             | Extra fields                  |
| ------------------ | ------------------------------------------------ | ----------------------------- |
| `JevHttpError`     | Non-2xx status, after retries for 429/529        | `status`, `body`, `retryable` |
| `JevTimeoutError`  | An attempt exceeded `timeoutMs`                  | `timeoutMs`                   |
| `JevResponseError` | 2xx with a non-JSON body, or no `answers` object |                               |

Network failures from `fetch` itself (DNS, connection refused) are rethrown unchanged.

MIT © Christoffer Maintz
