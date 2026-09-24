# P5 — The Assay: metric instruments for CTS · PCS · BIS · NSS · EPS

**Effort:** high · **Mode:** plan mode first · **Stories:** S10.1–S10.8, S10.10 · **Requirements:** IF-21 … IF-28, IF-30, IF-31 · **Est.:** 2 days
**Read first:** `docs/upgrade/11_THE_ASSAY.md` (all), `reference/assay/assay.py` + `test_assay.py` + `assay.ts` + `vectors.json`, `06_AGENT_STATE_SPEC.md` §3.1 (`assay.computed`), `04_DESIGN.md` §7.1–7.2, `05_MOTION_SPEC.md` §4.2, `apps/api/achp/core/core_pipeline.py` (the `compute_*` functions and where they're called), and the prototype's working instruments: `docs/upgrade/achp-site.html#/case/quiet` (Report + Assay tab: Hallmark, Two-Key split, masking notice, Tipping Point, Ledger) and `#/method` (Lineage, Agreement Dial, Bench). Copy its behavior, not its code: the prototype inlines `assay.ts` and uses plain DOM.

<goal>
Make the five metrics understandable and auditable: the server computes the Assay from the raw signals and emits it; the report shows the Hallmark, the Two-Key Verdict, the masking notice, the Integrity Ledger and the Tipping Point, with every metric named in full. The composite is never the headline.
</goal>

<why>
Computed against the paper's own formulas, framing moves the composite about 3× more than the factual attack, calm wording lifts refuted claims to MIXED (paper Cases 1 and 3), and the Judge already contradicts the formula on screen (paper Fig. 9). A radar hides all of that. These instruments show it honestly, without changing the formulas.
</why>

<backend_tasks>
1. Copy `reference/assay/assay.py` to `apps/api/achp/assay/core.py` **unchanged**, and add `__init__.py` exporting `assay, compute, Signals`. Copy `test_assay.py` into `apps/api/tests/assay/` and point `ACHP_REPO` at the repo root in `conftest.py`, so the **parity test runs in CI** (a formula change without a matching reference change must fail).
2. In `core_pipeline.py`, right after the metrics are computed, build `Signals` from the values already in scope (06 §6 lists them), call `assay(signals, judge_verdict, mode="code")`, attach it to the output, and emit `assay.computed` through the event bus. Trim `tipping_point.flips` to 5. **Don't change how any metric is computed.**
3. Add the `assay.computed` pydantic model to `achp/events/models.py` and regenerate `schemas/events.v2.json`.
4. Record 3 new fixtures with `scripts/record_run.py`, or synthesize them from the reference `SAMPLES` if the live pipeline won't produce them on demand (label them `synthetic` in the fixture header): `quiet-falsehood`, `true-but-loaded`, `paper-fig9-metrics`.
5. `scripts/leverage_lint.py` (copy from the reference) runs in CI with the default ratio; document it in `CONTRIBUTING.md`.
</backend_tasks>

<frontend_tasks>
6. `apps/web/lib/assay/`: `assay.ts` (copy of the reference) + its node test against `vectors.json`. It's used **only** by the Bench; reports render the server's `assay.computed` values (add a reducer case).
7. **Hallmark** (`components/assay/Hallmark.tsx`): the 5 cartouches from 04 §7.1 (shield, hexagon, hatched diamond, level, circle), fill = value, line weight from human agreement, compact 24px and regular 28px variants, a tooltip with the full form ("Bias Impact Score (BIS) · 20 · lower is better"), and a visually hidden table. Replace `MetricsRadar` everywhere and add the Hallmark to the OG image.
8. **TwoKey** + **MaskingNotice**: copy from 04 §7.1. Enforce the Truth-first rule (11 §4) in `CaseReport`: the Judge's stamp is the headline; C appears only in context (the Two-Key sentence, the masking notice, the Tipping Point line, the Ledger, the Bench), never in a heading, stat tile or the OG image.
9. **Assay tab** (`?tab=assay`, layout in 07 §4.1): the Hallmark with full forms, TwoKey, MaskingNotice, **TippingLine**, **IntegrityLedger** (facts first, the opening and closing balances, margin bars in `--mark-credit/--mark-debit`), plus drawers for **LineageDiagram**, **AgreementDial** and **AssayBench**. Report tab: one Tipping sentence under the confidence band.
10. **MetricTerm**: every first use of a metric acronym in a view renders its full form. Add a rendered-text test that fails on a bare acronym at first use.
11. **Bench**: grouped sliders with real-value ticks, a persistent what-if label, Reset, recompute on `requestAnimationFrame` (≤ 50ms), and no share/copy affordances. Test that the Bench can't change the stored report.
12. Tests: unit (Hallmark fill math, TwoKey copy states, Ledger rows sum to the closing balance), e2e on the 3 new fixtures (the masking notice shows for quiet-falsehood; "Close call: Judge Mostly false · Formula Mixed (0.53)" for paper-fig9; a split for true-but-loaded), and axe on the Assay tab.
</frontend_tasks>

<constraints>
- No formula changes. The factual gate and decorrelation are proposals (11 §6) that need an ADR and a benchmark run.
- QFI and the quiet-falsehood flag are labelled **experimental** until 11 §5 validation lands.
- Charts follow the dataviz rules in 04 §7.2: validated tokens, text in text tokens, 2px gaps, ≤ 24px bars, 8px dots with 24px hit areas, a table twin for every chart, and no radar.
- Human agreement is labelled "agreement with 200 human-annotated claims", never accuracy or confidence.
</constraints>

<verification>
- `cd apps/api && pytest -q tests/assay tests/events` green (the parity test must run, not skip); `pnpm -C apps/web test` green; `python scripts/leverage_lint.py` passes.
- `node scripts/ui/shoot.mjs --phase P5 --routes "/case/fixture-quiet-falsehood?speed=50&tab=assay","/case/fixture-paper-fig9-metrics?speed=50","/case/fixture-exercise-mixed?speed=50&tab=assay" --at done`. Look at them yourself.
- Delegate to `assay-auditor` ("Verify P5 against 11_THE_ASSAY and the reference vectors"), then to `design-critic` and `a11y-auditor` for the Assay tab.
</verification>

<done_when>
Every task is checked in PROGRESS.md, all the gates are green, and the three fixtures render exactly the states listed in 11 §3.
</done_when>
