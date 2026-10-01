# Resuming ACHP Bench

ACHP Bench run `2026-10-01` is part-way through. This file says where it stopped, why, and exactly how to finish it
over the next few days. Methodology: `bench/README.md`.

## Where it stands (2026-10-01)

| Suite | Planned | With a verdict | Failed: model quota ran out |
|---|---|---|---|
| averitec (real claims, AVeriTeC dev sample) | 120 | 39 | 81 |
| safety (injections and look-alikes) | 40 | 8 | 32 |
| metamorphic (negation and paraphrase pairs) | 60 | 1 | 59 |
| abstention (claims nobody can check) | 20 | 0 | 20 |
| **Total** | **240** | **48** | **192** |

The 120 AVeriTeC claims are a fixed sample of the 500 in the AVeriTeC dev set (see `bench/README.md`).

**Why it stopped.** By the backend's own counters, a check costs roughly 10,000 model tokens across its two models
(`openai/gpt-oss-120b` and its fallback `openai/gpt-oss-20b`). The hosted backend runs on Groq's free tier, which allows
about 200,000 tokens a day per model. After about 45 checks both models were out of quota (254,000 and 234,000 tokens
by then). Every later check failed within seconds at the claim-splitting
step (`error_code: exhausted`), before any agent judged anything. Those failures are stored but are not results.

**What is published meanwhile.** `bench/score.py` marks a run `complete` only when every item has been tried and at
least 90% of each suite has a verdict. Until then, `EVALUATION.md` and `/method` lead with the earlier figures,
labelled "not re-run here", plus a line saying how far ACHP Bench has got. A quota outage is never shown as accuracy.

**Side effect to know about.** While the quota is used up, the live site cannot finish checks either. Run the benchmark
when nobody needs the site, and keep to the daily cap below.

## The daily routine (about 35 checks a day, about 6 days)

Run these from the repository root. The runner checks one claim at a time. It stops by itself after
`--max-checks`, or when 3 checks in a row fail because the quota ran out. Finished items are never run again. Failed
items are retried, and their first attempt is kept in the log.

```bash
curl -s https://theshivansh-achp-api.hf.space/health
curl -s https://theshivansh-achp-api.hf.space/health/llm
```

```bash
python bench/run.py --tag 2026-10-01 --retry-failed --max-checks 35
```

```bash
python bench/score.py --tag 2026-10-01
```

```bash
python scripts/gen_evaluation.py
```

```bash
python -m pytest -q bench reference/benchmark
```

```bash
git add bench/runs/2026-10-01 bench/results EVALUATION.md apps/web/lib/benchmark.generated.json
```

```bash
git commit -m "chore(bench): ACHP Bench run 2026-10-01, day N [S8.4]"
```

In `/health/llm`, look at `runtime.models.*.remaining_tokens` and `cooldown_s`. If a model shows a long cooldown, wait.

The runner goes suite by suite: AVeriTeC first (the headline), then safety, metamorphic and abstention. To finish the
headline suite sooner, add `--suites averitec`.

## When it is complete

`python bench/score.py` reports `"completeness": {"complete": true}`, and `scripts/gen_evaluation.py` then publishes the
measured results: EVALUATION.md's first paragraph and `/method` switch to "N of 120 real-world claims got the same
label as professional fact-checkers", with intervals, the confusion table and the other suites. Then:

1. `node scripts/ui/shoot-p9.mjs --phase P9.5 --only method-benchmark,developers-mcp` and look at the captures.
2. Ask the `design-critic` and `assay-auditor` subagents to review `/method#benchmark` (the Judge against the formula is shown there).
3. Run the `/method` e2e: `E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/method.spec.ts e2e/routes.spec.ts` in `apps/web`.
4. Fill in the ACHP Bench line in `docs/upgrade/PROGRESS.md` (P9.5), then commit and push.

## Going faster (optional)

A Groq key on a paid tier, used with a local backend, finishes all 240 checks in about 3 hours. Two caveats:

- The hosted backend may be running older code than this repository. Do not mix backends in one tag. Start a new tag
  and run every suite on the local backend:
  `cd apps/api && GROQ_API_KEY=... uvicorn main:app --port 8000`, then
  `python bench/run.py --api http://localhost:8000 --tag <new-date> --concurrency 1`.
- The key stays in your shell. It is never committed and never goes in a `NEXT_PUBLIC_*` variable.

## A prompt to give Claude

Paste this into a Claude Code session in this repository on each day you want to continue:

> Continue ACHP Bench run 2026-10-01 by following bench/RESUME.md. First check /health and /health/llm on the hosted
> backend. If both models have quota, run `python bench/run.py --tag 2026-10-01 --retry-failed --max-checks 35`, then
> score it, regenerate EVALUATION.md, and run `python -m pytest -q bench reference/benchmark`. Commit the new logs and
> results with a `chore(bench)` message, push, and tell me the new counts per suite. If the run is now complete, do the
> "When it is complete" steps as well. Do not raise the cap, do not run checks in parallel, and stop if the quota runs
> out.
