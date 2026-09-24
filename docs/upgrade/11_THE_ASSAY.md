# 11 — The Assay: turning CTS · PCS · BIS · NSS · EPS into instruments nobody else ships

> An assay office tests precious metal and punches a **hallmark** into it: a row of small stamps that certify what the metal is, who tested it and how pure it is. ACHP should do the same for a claim: *judge* it (the agents), and *assay* it (the formulas), and print the result so anyone can audit it.

Everything in this document is computed by a tested reference implementation: `reference/assay/assay.py` (source of truth, 23 tests including a **parity test against the production formulas in `apps/api`**) and `reference/assay/assay.ts` (a browser/Node port, 14 tests pinned to `vectors.json`). The numbers quoted below come from running that code, not from estimates.

---

## 1. The five metrics (full forms, meaning, formulas)

All scores are in [0, 1]. From the ACHP paper, Sec. IV, equations (1)–(6), and `apps/api/achp/core/core_pipeline.py`.

| Code | Full form | What it measures | Direction | Paper formula | Human agreement r (paper Fig. 13, n=200) |
|---|---|---|---|---|---|
| **CTS** | **Consensus Truth Score** | How well the claim survives factual attack by the adversarial council | higher = better supported | 0.40·fA + 0.35·jCTS + 0.15·(1−BIS) + 0.10·EPS | **0.81** (highest) |
| **PCS** | **Perspective Completeness Score** | How many relevant stakeholder viewpoints the claim accounts for | higher = more complete | 0.50·fB + 0.30·s_pcs + 0.20·(1 − min(n_miss/10, 1)) | 0.74 |
| **BIS** | **Bias Impact Score** | How much loaded language, framing and slant the claim carries | **higher = more bias** (enters C as 1−BIS) | 0.55·s_nil + 0.25·s_fr + 0.12·\|pol\| + b_frame (b = 0.15 conspiracy/delegitimize, 0.05 alarm) | **0.69** (lowest) |
| **NSS** | **Narrative Stance Score** | How neutral the claim's narrative stance is | higher = more neutral | 0.40·(1−s_fr) + 0.35·a_narr + 0.25·jNSS | 0.72 |
| **EPS** | **Epistemic Position Score** | Whether the certainty of the language matches the evidence (hedging vs overclaiming) | higher = better calibrated | 0.70·v_eps + 0.20·(1−s_fr) + 0.10·min(3·hr, 1) | 0.78 |
| **C** | Composite | Average of the five (BIS inverted) | — | (CTS + PCS + (1−BIS) + NSS + EPS) / 5 → TRUE ≥ .85 · MOSTLY TRUE ≥ .70 · MIXED ≥ .50 · MOSTLY FALSE ≥ .30 · FALSE | — |

**Raw signals** (the 13 inputs everything is built from): fA Adversary A factual score · jCTS Judge raw CTS · s_nil NIL bias score · s_fr FramingCosine framing score · |pol| VADER polarity · frame dominant frame · fB Adversary B perspective score · s_pcs NIL perspective score · n_miss missing perspectives · a_narr narrative alignment · jNSS Judge raw NSS · v_eps VADER epistemic score · hr hedge ratio.

**Code differs from the paper in one place:** `core_pipeline.py` passes `narrative_alignment = 1 − framing_score` ("simpler alignment proxy") and, when the Judge omits `nss_raw`, uses `NSS_proxy = 1 − 0.6·BIS − 0.4·framing`. The reference implementation supports both (`mode="paper"` and `mode="code"`), and its parity test proves `mode="code"` matches production byte for byte on 2,000 random inputs.

---

## 2. What the formulas actually do (computed findings)

These findings are the reason the instruments exist. Each is reproducible with `python reference/assay/assay.py` and covered by a test.

### 2.1 Framing outweighs facts in the composite

Local sensitivity of C to each raw signal (`leverage()`, interior point):

| Signal | dC/dsignal, paper eqs | dC/dsignal, production code (Judge NSS present · Judge NSS missing) |
|---|---|---|
| s_fr: framing score | **−0.182** | **−0.252 · −0.279** |
| v_eps: VADER epistemic score | +0.154 | +0.154 |
| s_nil: NIL bias score | −0.127 | −0.127 · −0.143 |
| fB: Adversary B perspective | +0.100 | +0.100 |
| **fA: Adversary A factual score** | **+0.080** | **+0.080** |
| jCTS: Judge raw CTS | +0.070 | +0.070 |

**Moving the framing score by 0.1 moves the composite 3.1× more than moving the factual attack score by 0.1** in production (3.5× when the Judge omits its NSS and the proxy kicks in; 2.3× with the paper's equations). The two factual signals together hold about **15% of total leverage**. In the paper's own ablation, the adversarial *roles* drive accuracy, yet the composite formula mostly listens to tone.

### 2.2 One signal feeds four of the five metrics

`lineage()`: the framing score feeds **BIS, EPS, NSS** directly and **CTS** indirectly (through BIS and EPS). In production it enters NSS a second time as the alignment proxy (1 − framing), and a third time through NSS_proxy when the Judge omits its NSS, so it has **4–5 direct paths** into the metrics. No other signal has more than one.

### 2.3 Narrative masking is real, including in the paper's own case studies

Because C averages CTS with four narrative metrics, **a refuted claim written calmly can earn a passing composite.**
- Paper Case 1 ("Climate change is a hoax invented by China"): Adversary A factual score **0.05, verdict REFUTED**, yet **composite 0.638 → MIXED**.
- Paper Case 3 ("Immigrants are destroying the economy…"): factual **0.15, REFUTED**, composite **0.520 → MIXED**.
- Reference sample `quiet_falsehood` (fA 0.08, calm wording): **CTS 0.29, yet C 0.72 → MOSTLY TRUE**, while the Judge says **FALSE**. The Integrity Ledger shows *why*: framing earned **+0.117**, bias score **+0.057**, calm certainty **+0.034**, while the refuted facts cost only **−0.034** and **−0.027**.

The reverse also happens: `true_but_loaded` (fA 0.85) is dragged down to **MOSTLY FALSE (0.41)** by loaded wording while the Judge says MOSTLY TRUE.

### 2.4 The Judge and the formula already disagree on screen

Paper Fig. 9/11 shows **MOSTLY FALSE** beside BIS 42, CTS 52, PCS 51, NSS 75, EPS 30. Those five numbers give **C = 0.532 → MIXED**. The code explains why: `verdict_from_composite()` always returns the **Judge's** verdict and uses C only for confidence. The UI prints two different answers without saying so.

### 2.5 Honest numbers

- The CTS/PCS/BIS/NSS/EPS **radar** in the current UI hides all of the above. A pentagon can't show direction (BIS is inverted), reuse, leverage or disagreement.
- The published headline accuracy differs across sources: **68.3%** (repo and v2 PRD), **69.9%** (paper abstract/Sec. IX), and the paper's Table III per-benchmark mean of **62.2%** (74.8, 48.6, 63.1) vs **57.2%** for GPT-4 zero-shot. `/method` must render one number, generated from `EVALUATION.md` by a script, with the benchmark split shown (see 01_AUDIT §G).

---

## 3. The instruments

Nine user-facing instruments and one developer tool. Every one is a **pure function of data the pipeline already produces** (no new model calls), deterministic, and testable.

### 3.1 Assay Hallmark: the signature (replaces the radar)

**What:** a row of five punched marks, like silver hallmarks, one per metric, printed beside the verdict stamp, in the OG image and in the `/runs` list. Each mark has its own **cartouche shape** so it's recognisable without color, and an **ink fill level** for its value.

| Mark | Shape | Fill means | Reads |
|---|---|---|---|
| CTS | Shield | Supported by consensus | fuller = stronger facts |
| PCS | Hexagon (many sides) | Viewpoints present | fuller = more complete |
| BIS | Diamond with **hatched** fill | **Bias present** (hatching = impurity) | fuller = *more* bias, labelled "lower is better" |
| NSS | Level (a wide rectangle with a centre tick) | Neutral stance | fuller = more neutral |
| EPS | Circle | Calibrated certainty | fuller = better calibrated |

Each mark carries its letters (CTS…), the value as a whole number on hover/focus and in a table view, and its full form in the tooltip. The line weight of each cartouche encodes **human agreement** (§3.7): solid for r ≥ 0.75 (CTS, EPS), a finer line for r < 0.75 (PCS, NSS, BIS), so the least-trusted measure literally looks lighter.

**Why unique:** hallmarks are a centuries-old trust signal for *assayed* material. It's compact (a 5×24px strip works in a table row), printable, shareable, and it can't be mistaken for a generic dashboard chart.

### 3.2 Two-Key Verdict: Judge × Formula

**What:** like a two-person rule, a verdict is "sealed" only when both keys turn: key 1 is the Judge agent's verdict, key 2 is the published formula's verdict (C mapped to the scale).

**Algorithm:** `steps = |rank(judge) − rank(formula)|` on FALSE…TRUE. `agree` (0), `adjacent` (1), `split` (≥2). UNVERIFIABLE or BLOCKED → not applicable.

**UI:** two small keys under the stamp. Agree → both keys turned, the stamp prints solid. Adjacent → "Close call: the Judge says Mostly false, the formula says Mixed (0.53)". Split → the stamp prints with a gap ("Split decision") and the report opens the Ledger automatically to show why.

**Why it matters:** it surfaces the disagreement the current UI (and paper Fig. 9) hides, and it's the natural place to explain masking.

### 3.3 Integrity Ledger: double-entry accounting for a score

**What:** "Why 0.72?" answered as a ledger. An **opening balance** (a neutral reference claim, every signal at its midpoint: C = 0.510), then one line per raw signal with a **credit** (pushed C up) or **debit** (pulled it down), then the **closing balance** = C. The books always balance.

**Algorithm:** **exact Shapley values** of C over the free signals (11–13 players, 2ⁿ coalitions, about 25ms in the browser). Shapley values are *efficient* (they sum exactly to C − C_ref) and *symmetric*, and a signal that didn't move gets exactly 0, so the ledger is honest by construction even with clamps and the categorical frame boost. The reference claim is declared on screen ("compared with a claim where every signal sits at its midpoint").

**UI:** a real ledger layout on the sheet: date-free rows, a signal name in plain words ("Framing of the wording"), the raw value, and debit and credit columns with a hairline rule under the total. Diverging bars sit in the margin (credit `--mark-credit`, debit `--mark-debit`, palette validated for color-blind separation in both themes). The factual rows (fA, jCTS) are pinned to the top with a "Facts" subheading, so "facts moved it −0.06, wording moved it +0.21" is visible in one glance.

### 3.4 Tipping Point: how close is this verdict to flipping?

**What:** the smallest change to *one* signal, all others fixed, that would change the formula verdict. Reported as a distance, a band and the specific lever.

**Algorithm:** for each free signal, scan its domain (0.001 grid; counts 0–10; frames by category) in both directions from the current value, then bisect to 1e-6 at the first verdict change. Distance is in signal units (counts ÷10). Band: **fragile** < 0.10 · **firm** 0.10–0.25 · **settled** ≥ 0.25 (or no single-signal flip exists).

**UI:** a horizontal number line from 0 to 1 with the five verdict bands as labelled zones, the case's C as a dot, and a leader to the nearest boundary: "Fragile: if the framing score rose from 0.08 to 0.15, this would read Mixed." The line is shown only in the Assay tab and the Method bench; the Sharer view gets one sentence.

**Why it matters:** it's a direct, honest trust-calibration signal (the paper's own future work lists "user studies quantifying trust calibration"). A *fragile* verdict tells readers to open the evidence.

### 3.5 Narrative Lift and the Quiet Falsehood Index (QFI)

**What:** detects the §2.3 failure: weak facts dressed in calm language.

**Definitions:**
- **Calm** = mean(1 − BIS, NSS, EPS): how measured and neutral the claim *reads*.
- **Narrative Lift** = C − CTS = ⅘·(mean of the other four − CTS): how far the narrative metrics carried the composite above the factual one.
- **QFI** = (1 − CTS) × Calm ∈ [0, 1]: high when facts are weak **and** the tone is calm.
- **Masking flag** = CTS < 0.40 **and** the formula verdict is MIXED or better.
- **Quiet-falsehood flag** = CTS < 0.40 **and** QFI ≥ 0.45 (an experimental threshold, calibrated in §5).

**UI (the Truth-first rule, §4):** when masking fires, the report shows a ruled notice above the Ledger: "The wording is calm and balanced, but the facts didn't hold up. The composite (0.72) is lifted by tone, not evidence." The factual stamp keeps the headline.

**Why it's grounded:** research on misinformation style finds false health narratives that "mimic authoritative communication" with a restrained tone, and readers preferring a neutral, professional tone even when content lacks rigor (sources in §7). A calm falsehood is the one most likely to be forwarded.

### 3.6 Signal Lineage: where every number comes from

**What:** a left-to-right flow diagram: 13 raw signals → 5 metrics → C, with edge thickness = weight. Shared signals are highlighted: framing lights up 4–5 paths in production. A toggle switches **Paper formulas ↔ Production code**, so a reviewer sees exactly where the implementation diverges from the paper.

**UI:** `/method` and the Assay tab's "How it's computed" drawer. It's static SVG, keyboard-navigable (each node focusable, listing its inputs and outputs), with a table twin.

### 3.7 Agreement Dial: how much humans agreed with each measure

**What:** the paper's calibration (Pearson r vs 200 human-annotated claims) shown with each metric: CTS 0.81 · EPS 0.78 · PCS 0.74 · NSS 0.72 · BIS 0.69. BIS gets a plain note: "Bias is the hardest to measure; humans agreed least with it."

**UI:** small single-hue horizontal bars in the Method page and the Hallmark tooltip (value label at the tip, 0–1 axis). It also drives the Hallmark line weight (§3.1). It's labelled as *agreement*, never as "accuracy" or "confidence".

### 3.8 Assay Bench: what-if, with the published formulas

**What:** an explorable explanation. Sliders for the raw signals (grouped: Facts · Perspectives · Wording), live-recomputing the five metrics, the Hallmark, C, the formula verdict, the Ledger and the Tipping Point with `assay.ts` in the browser. A reset returns to the case's real values.

**Honesty rules:** a persistent label ("What-if. This doesn't re-run the agents."); the case's real values stay marked on each slider; nothing from the bench can be shared as a verdict.

**Where:** `/method` (on the reference claim and three sample claims) and a "Try the formula" drawer in each case's Assay tab.

### 3.9 Integrity Map: every run on one plane

**What:** a scatter on `/runs`: x = CTS (facts), y = Calm (tone). Four named quadrants:

| | Calm ≥ 0.5 | Calm < 0.5 |
|---|---|---|
| **CTS ≥ 0.5** | Sound | True but loaded |
| **CTS < 0.5** | **Quiet falsehood** (the dangerous one) | Loud falsehood |

**UI:** a single series in a neutral ink, with the hovered/current run in `--pencil-blue`. The quadrant labels are text on the plot; dots are ≥ 8px with a 24px hit area; a table twin lists every run. Clicking a dot opens its case.

### 3.10 Leverage Lint (developer tool, CI)

**What:** a CI check (`scripts/leverage_lint.py`, P5) that recomputes §2.1 from the reference implementation and **fails the build** if any non-factual signal's leverage exceeds `LEVERAGE_RATIO_MAX` × the factual attack's leverage without an ADR in `docs/adr/`. The default for today's formulas is 3.6 (today it passes at 3.14, or 3.49 on the Judge-NSS-missing path with `--no-judge-nss`, and fails as soon as someone adds another framing path). It turns the metric framework into something you can't silently make worse.

---

## 4. The Truth-first display rule (policy)

1. **The headline is the per-part stamps and the Judge's overall stamp.** The composite C is never the headline and is never shown alone.
2. **The factual stamp beats tone.** If masking fires (§3.5), the overall stamp prints the Judge's verdict, the Two-Key shows the split, and the masking notice explains the lift. There's no "MIXED" for a refuted claim without that explanation.
3. **Every number has a full form on first use per view** (e.g. "Bias Impact Score (BIS)"), and BIS always says "lower is better".
4. **Agreement ≠ confidence.** Human-agreement r is labelled as such.
5. **What-if never leaks.** Bench states can't be copied, shared or stamped.

## 5. Validation plan (before any claim of effectiveness)

| Question | Data | Test | Ship criterion |
|---|---|---|---|
| Does QFI flag the claims people find *most misleading*? | The paper's 200-claim annotated subset (add a 1–5 "how misleading" rating) + `ucsbai/liar` (Hugging Face) statements labelled false/pants-fire | Spearman ρ(QFI, rating) among claims with CTS < 0.4; precision@k of the quiet-falsehood flag | ρ ≥ 0.3 and flag precision ≥ 0.7 → keep the threshold; else re-fit QFI_FLAG |
| Does Tipping Point predict verdict instability? | Re-run 100 claims 3× (LLM sampling variance) | Do *fragile* verdicts change more often across runs than *settled* ones? | Flip rate(fragile) > 2× flip rate(settled) |
| Does the Two-Key "split" flag errors? | The 200-claim subset | Accuracy on agree vs split cases | Split cases significantly less accurate (McNemar p < 0.05) |
| Does missing context (PCS) match half-truth labels? | PolitiFact-Hidden (arXiv 2508.00489, 15k half-truths) | PCS on half-true vs true | AUROC ≥ 0.65 |
| Do people understand the Ledger? | 5-person hallway test (09 §7) + 3 reviewers | "Why is the score what it is?" answered correctly | ≥ 4 of 5 |

Results go into `EVALUATION.md` (generated), and `/method` renders them. Until then the UI labels QFI and the flags **"experimental"**.

## 6. Research follow-ups (proposals, not part of this UI upgrade)

- **Factual gate** (an ADR candidate): cap the composite by facts, `C_gated = min(C, CTS + 0.15)`. On the samples this turns `quiet_falsehood` from MOSTLY TRUE (0.72) into MOSTLY FALSE (0.44) and leaves the sound claims unchanged. Evaluate on the benchmark before adopting.
- **Decorrelated framing:** use the framing score once (in BIS) and replace NSS's alignment proxy with the Judge's value.
- **Report QFI and Two-Key as metrics in the paper's next revision**, with the calibration from §5.

## 7. Novelty and related work (honest)

Related systems explain *why a claim is false* (counterfactual explanations for fake claims, arXiv 2206.04869), attribute claims to evidence (ClaimVer, arXiv 2403.09724; FACTS&EVIDENCE, NAACL 2025 demo), or explain sources of uncertainty in fact-checking (arXiv 2505.17855). In our search (Sep 2026) we found **no fact-checking interface that audits its own scoring formula**: none shows a verdict's flip distance on a published composite, a double-entry Shapley ledger of the score, a Judge-vs-formula two-key, or a flag for *tone lifting weak facts*. Treat this as "not found in our search", not a guarantee. Style research that grounds QFI: Frontiers in AI 2025 (restrained, authoritative tone in COVID misinformation), arXiv 2505.08143 (readers prefer a neutral, professional tone even when content lacks rigor), Humanities & Social Sciences Communications 2022 ("fingerprints of misinformation").
