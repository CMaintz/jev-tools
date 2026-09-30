# @cmaintz/jev-core

The Jev client shared by [`@cmaintz/jev-guard`](../guard), [`jev-triage`](../triage) and [`@cmaintz/jev-sort`](../sort). You only need it directly to write your own tool on the same provider port.

> Not yet published to npm. See the [root README](../../README.md#install).

- **Types:** `Question` (`choice` / `score` / `noul`), `Answer`, `JevRequest`, `JevResponse`, and the `JevProvider` port.
- **Providers:** `TypeSafeProvider(apiKey, model = 'jev-latest', baseUrl?)` for the first-party API, and `CloudflareProvider(accountId, apiToken, model = 'typesafe/jev')` for Workers AI. Both validate the response with `parseJevResponse`.
- **`postJson(url, headers, body, { maxAttempts, timeoutMs })`:** retries 429/529 with exponential backoff (as [TypeSafe's API docs](https://docs.typesafe.ai/api) recommend), aborts each attempt after `timeoutMs` (default 30 s), and rejects non-JSON bodies.
- **`parseJevResponse(json, questions)`:** throws if there is no `answers` object, and drops any answer that is missing, has the wrong type for its question, names an unknown choice, or has a non-finite or out-of-range number. Callers see those as "no answer" and can fail safe.
- **`stableStringify(value)`:** JSON with object keys sorted recursively, used for cache and dedupe keys.

```ts
import { TypeSafeProvider } from '@cmaintz/jev-core';

const jev = new TypeSafeProvider(process.env.JEV_API_KEY!);
const { answers } = await jev.evaluate({
  state: { message: 'My card was charged twice' },
  questions: { billing: { type: 'noul', instructions: 'Is this about a payment problem?' } },
});
```

MIT © Christoffer Maintz
