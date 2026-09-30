# Contributing

## The Assay (CTS · PCS · BIS · NSS · EPS)

The five metrics and every instrument built on them (Hallmark, Two-Key, Ledger, Tipping Point, masking,
Lineage, Bench) come from one source of truth: `reference/assay/assay.py`. Read
`docs/upgrade/11_THE_ASSAY.md` before touching any of it.

- `apps/api/achp/assay/core.py` is a **byte-for-byte copy** of the reference. `apps/web/lib/assay/assay.ts`
  is a copy of `reference/assay/assay.ts`. Neither is edited in place.
- **Changing a weight** is a five-step change and nothing less: edit the reference → regenerate the vectors
  (`python reference/assay/assay.py --vectors > reference/assay/vectors.json`) → update both copies → bump
  `FORMULA_VERSION` → make the checks below pass → write an ADR in `docs/adr/`.
- Reports render the server's `assay.computed`; the browser port is used only by the what-if Bench.

### Checks (all run in CI: `.github/workflows/assay.yml`)

```bash
ACHP_REPO=$PWD python -m pytest -q reference/assay        # parity with core_pipeline.py must run, not skip
node --experimental-strip-types --test reference/assay/assay.test.mjs apps/web/lib/assay/assay.test.mjs
cd apps/api && python -m pytest -q tests/assay tests/events
python scripts/leverage_lint.py                            # add --no-judge-nss for the NSS_proxy path
```

### Leverage lint

`scripts/leverage_lint.py` recomputes how strongly each non-factual signal moves the composite against the
factual attack (`fA`) and **fails** when any signal exceeds `LEVERAGE_RATIO_MAX` (default 3.6×). Today's
formulas pass at 3.14× (3.49× without the Judge's NSS). A change that adds another framing path fails until an
ADR in `docs/adr/` contains a line `leverage-ratio: <n>` that records why the higher ratio is acceptable.
