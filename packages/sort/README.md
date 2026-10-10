# @cmaintz/jev-sort

Stream rows through [TypeSafe AI's Jev](https://typesafe.ai/) and get typed classification/score columns plus a `_confidence` field. Each row is one Jev request carrying all your questions.

```bash
npm install -g @cmaintz/jev-sort   # CLI
npm install @cmaintz/jev-sort      # library
```

```bash
export JEV_API_KEY=...
jev-sort -q 'team:choice(billing,tech,sales)' -q 'urgent:noul' \
  --escalate 'conf<0.6' --review-out review.jsonl --reject-out rejects.jsonl \
  < tickets.jsonl > out.jsonl
```

Each output line is the input row plus one column per question: the chosen label for `choice`, the numeric score for `score`, the yes-probability for `noul`. Then `_confidence`, the lowest choice/score confidence in the row. For example (illustrative values):

```json
{ "id": 1, "text": "I was charged twice", "team": "billing", "urgent": 0.93, "_confidence": 0.87 }
```

A summary goes to stderr: rows written, input tokens with an estimated cost at TypeSafe's list price ($0.042 per million input tokens), elapsed time, and flagged/rejected counts.

## When to use it

It pays off on large jobs: thousands of rows or more, where calling an LLM per row is the expensive part. For a few hundred rows, a one-off LLM script is simpler. If the rule is crisp (a regex or keyword match), plain code beats both.

## CLI

Run `jev-sort --help` for the full list.

- **Questions:** inline `-q 'name:choice(a,b,c)'` · `-q 'name:noul'` · `-q 'name:score(low,mid,high)'`, or `--config jev-sort.yml` for full instructions and criteria per question ([example](examples/jev-sort.yml)). The config is YAML; JSON is valid YAML, so write it as JSON to share one file with jev-eval, which reads only JSON.
- **Escalation:** `--escalate 'conf<0.6'` sends rows below the bar to `--review-out FILE` (JSONL) instead of stdout. A row counts as confident only if every choice/score answer clears the bar. Exit code 2 if any rows were flagged; `--allow-review` makes that 0.
- **Gate from jev-eval:** `--thresholds thresholds.json` takes the escalation bar from [jev-eval](https://github.com/CMaintz/jev-eval) instead of a guess. jev-eval measures Jev on your own labeled rows and writes the cut-point it recommends. With one gated question jev-sort uses that question's own gate; with several, the file's composite (row-level) gate. It refuses a file measured on a different set of choice/score questions, warns when the file's model differs from `--model` or a gated question was reworded since jev-eval measured it, and prints the accuracy and coverage jev-eval measured for that gate. Use it instead of `--escalate`, not with it.
- **Failures:** a row whose Jev call fails, or that comes back without an answer to every question, is written to `--reject-out FILE` (JSONL, the row plus `_error`). So is an input line that isn't a JSON object, with `_line` and `_raw`. The stream keeps going. Without `--reject-out`, rejects are reported on stderr. Exit code 3 if anything was rejected.
- **Throughput:** `--concurrency N` (positive integer, default 8) · `--rate N` (max requests per minute) · `--dedupe` (identical rows reuse one answer). Output order follows completion, not input order.
- **Formats:** `--format jsonl|csv` for input and stdout. CSV fields can't contain embedded newlines.
- **Provider:** `--provider typesafe|cloudflare` · `--model jev-latest` (sent as `typesafe/jev` on Cloudflare; any other model id is passed through). Set `JEV_API_KEY`, plus `CLOUDFLARE_ACCOUNT_ID` for Cloudflare.
- **Measure first:** `--eval labeled.jsonl` reports per-question agreement against a hand-labeled sample (truth columns are stripped from the state), so you know the accuracy on your data before a large run.

## Library

```ts
import { choice, classify, isFailed, noul, TypeSafeProvider } from '@cmaintz/jev-sort';

const provider = new TypeSafeProvider(process.env.JEV_API_KEY!);
const questions = {
  team: choice({ billing: 'payment or charge issues', tech: 'bugs, errors, outages' }, 'Which team?'),
  urgent: noul('Does the message convey urgency?'),
};

for await (const r of classify(rows, questions, { provider, escalateBelow: 0.6, concurrency: 8 })) {
  if (isFailed(r)) console.error(r.row, r.error);
  else console.log(r.columns, r.confidence, r.escalated);
}
```

## Limitations

- **Accuracy:** on [TypeSafe's workflow evals](https://evals.typesafe.ai/) Jev scores 67.8% agreement with frontier-model reference labels. Treat output as pre-labels, spot-check it, and route low confidence to people. `--eval` measures it on your data.
- **Text only**, and each row must fit Jev's request limit (32k tokens for state plus the longest question; [models page](https://docs.typesafe.ai/models)). Long documents need summarizing first.
- **No rationale:** a poor fit when you need an audit trail of why a row got its label.
- **No counting or date arithmetic:** do aggregation downstream.
- Not yet implemented: resumable runs, sampling, and a cost preflight.

MIT © Christoffer Maintz
