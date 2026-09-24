---
name: achp-assay
description: Rules and procedure for any ACHP code or UI that computes, shows or explains CTS, PCS, BIS, NSS, EPS or the composite score — the Assay instruments (Hallmark, Two-Key Verdict, Integrity Ledger, Tipping Point, masking/QFI, Signal Lineage, Agreement Dial, Assay Bench, Integrity Map). Use before touching metric math, metric UI, the OG image, /method or /runs.
---

# The Assay — working rules

Spec: `docs/upgrade/11_THE_ASSAY.md`. Math: `reference/assay/assay.py` (source of truth) and its port `assay.ts`.

## Names (always, on first use in any view)
Consensus Truth Score (CTS) · Perspective Completeness Score (PCS) · Bias Impact Score (BIS), **lower is better** · Narrative Stance Score (NSS) · Epistemic Position Score (EPS) · overall score (the composite C).

## Math
1. **Never re-implement a formula.** Server: `apps/api/achp/assay` (a copy of the reference). Client: `apps/web/lib/assay` (a copy of `assay.ts`), for the Bench only. Reports render the server's `assay.computed` values.
2. Changing any weight means: change the reference → regenerate `vectors.json` (`python assay.py --vectors > vectors.json`) → update both copies → bump `FORMULA_VERSION` → pass parity + `leverage_lint.py` → write an ADR. There's no other path.
3. The Ledger uses exact Shapley values against the declared reference claim; it must balance (< 1e-9). Show the opening balance and say what the reference is.
4. Tipping distances are in signal units (counts ÷ 10); bands: fragile < 0.10 ≤ firm < 0.25 ≤ settled.

## Display (the Truth-first rule)
- The headline is the Judge's stamp plus the per-part stamps. The composite C appears only in context: the Two-Key sentence, the masking notice, the Tipping Point line, the Ledger and the Bench. It's never in a heading, a stat tile or the OG image.
- Masking (CTS < 0.40 and formula verdict ≥ Mixed) → `MaskingNotice`. QFI and the quiet-falsehood flag are **experimental** until 11 §5 validation passes.
- Two-Key copy: agree → "Judge and formula agree"; adjacent → "Close call: Judge {v1} · Formula {v2} ({C})"; split → "Split decision: Judge {v1} · Formula {v2}. See the ledger."
- Human agreement r (CTS .81 · EPS .78 · PCS .74 · NSS .72 · BIS .69, paper Fig. 13, n = 200) is "agreement", never accuracy or confidence.
- Blocked input → no metrics, no Hallmark.
- The Bench is what-if: persistent label, real-value ticks, Reset, no share/copy/stamp.

## Visuals
- The Hallmark replaces every radar: shield (CTS), hexagon (PCS), hatched diamond (BIS), level (NSS), circle (EPS). Fill = value; 1px outline when r < 0.75.
- Charts use `--mark-credit/--mark-debit/--mark-neutral/--mark-focus`; text uses text tokens; ≤ 24px bars; 8px dots with 24px hit areas; every chart has a table twin; no dual axes; no radar.
- Numbers update without easing (achp-motion §6).

## Verify
`pytest reference/assay` (with `ACHP_REPO` set so parity runs) · the node test for `assay.ts` · `python reference/assay/leverage_lint.py` · then ask the `assay-auditor` subagent.
