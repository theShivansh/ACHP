# ACHP Bench

A benchmark ACHP runs on itself, end to end, through the same public API the site uses. Results are in
`EVALUATION.md` and on `/method`, generated from `bench/results/latest.json`.

## Suites

| Suite | Items | Source | What it asks |
|---|---|---|---|
| `averitec` | 120 | A fixed, stratified sample of the AVeriTeC dev set (40 Supported, 40 Refuted, 20 Conflicting/Cherry-picking, 20 Not Enough Evidence; seed 20261001) | Does ACHP's verdict match professional fact-checkers' label? |
| `safety` | 40 | Written for this benchmark | Are 20 prompt injections blocked, and are 20 ordinary claims that use words like "ignore" or "override" left alone? |
| `metamorphic` | 60 (30 pairs) | Written for this benchmark | Do a claim and its negation get opposite verdicts? Do two wordings of one claim get the same one? |
| `abstention` | 20 | Written for this benchmark | Are claims nobody can check (invented people, private events, the future, the unfalsifiable) called Unverifiable? |

AVeriTeC: Schlichtkrull, Guo and Vlachos, *AVeriTeC: A Dataset for Real-world Claim Verification with Evidence from the
Web*, NeurIPS 2023 Datasets and Benchmarks. https://github.com/MichSchli/AVeriTeC. CC BY-NC 4.0. Only the claim, its
date, its label and the fact-check address are kept here.

How ACHP's labels are scored against AVeriTeC's: Supported = Supported; Contradicted = Refuted; Mixed and Missing
context = Conflicting evidence/Cherry-picking; Unverifiable = Not enough evidence. Not checked (blocked) is wrong for
every label. A run that fails is "no verdict" and counts as wrong.

## Run, score, publish

```bash
python bench/build_suites.py --averitec path/to/AVeriTeC/data/dev.json   # only to rebuild the sample
python bench/run.py --tag 2026-10-01                                    # resumable; logs go to bench/runs/<tag>/
python bench/run.py --tag 2026-10-01 --retry-failed                     # try failed runs again (first attempts are kept)
python bench/score.py --tag 2026-10-01                                  # offline; writes bench/results/
python scripts/gen_evaluation.py                                        # EVALUATION.md and the site's data
python -m pytest -q bench reference/benchmark                           # scorer tests, and that everything is current
```

Every run's complete event log is stored gzipped in `bench/runs/<tag>/<suite>/<id>.json.gz`, so the scores can be
recomputed, audited or re-scored differently without calling the backend again. `reference/benchmark` fails if
`latest.json` does not match a fresh scoring of its logs.

## What is measured

- AVeriTeC: four-label agreement (headline; Wilson 95% interval), the same weighted back to the dev set's label mix,
  macro-F1 (bootstrap interval), coverage, per-label recall, the confusion table, true-called-false errors, the Judge
  against the formula (the reference Assay, `from_metrics`, on the run's own five scores) on the same items, two-key
  states, and refuted claims the masking check flags.
- Safety: injections blocked; ordinary claims wrongly blocked.
- Metamorphic: negation flips; paraphrase agreement, with and without cache hits.
- Abstention: called Unverifiable; called true or false with strong confidence instead.
- Grounding, on every run: citations that point to a source not in the run's log; decisive parts with a cited source.
- Operations: completed, failed, first-attempt completion, cache hits, seconds per check (median and 90th percentile).

## Limits

- The AVeriTeC claims are from 2020 to 2022 and their fact-checks are online. ACHP searches the web, so it can find them.
  This measures the deployed system, search included, not reasoning from scratch.
- The written suites were authored and labelled by one annotator. They test behaviour, not world knowledge.
- One run per item, on one day, against a free-tier deployment that is slow and rate-limited.
- No other system was re-run here; the baselines are the trivial ones (commonest label, a uniform guess).
