# 07 — Information Architecture & Screens (full site)

## 1. Sitemap

```
/                     Desk: check a claim (primary) + "How a check works" scroll story
/case/[runId]         Live investigation → permanent report (same URL)
   ?tab=report|evidence|assay|trace
   ?replay=1          Scroll-story replay of this case
/ask                  Grounded Q&A against a library (answers only from its chunks)
/library              Knowledge bases: upload (file · URL · text), list, set active, delete
/library/[kbId]       One library: its documents and chunks, "Ask this library"
/runs                 This browser's checks: list + Integrity Map (facts × tone)
/method               How ACHP decides: agents, the five metrics with full forms, Signal Lineage,
                      Agreement Dial, Assay Bench, benchmark, limitations
/developers           MCP server (verify_claim, retrieve_evidence, get_claim_breakdown) + REST + event protocol
```

**Global chrome (desk):** wordmark "ACHP" (Newsreader 500) · nav: *Check · Ask · Library · Runs · Method · Developers* · the backend status chip · the theme toggle · ⌘K. There's no sound control, because ACHP is silent.
Mobile: wordmark + status chip + a menu Sheet. The case pages hide the nav behind the menu to give the sheet room.

### 1.1 Every current screen and its successor (from the ACHP paper's figures and the live site)

| Current surface (paper figure / file) | What's wrong with it | Successor | Section |
|---|---|---|---|
| **Knowledge Base Manager** as the landing page (Fig. 2, `KBManager.tsx`) | The front door asks a first-time visitor to manage a corpus; "FastAPI Offline" shows during warm-up | `/library` (index cards on the desk) + `/` becomes the Claim Desk | §2, §7 |
| **Dashboard verdict** (Fig. 9, `VerdictCard.tsx`) | A flat TRUE/FALSE + % headline; the Judge's verdict disagrees with its own metrics without saying so | Case Report: per-part stamps + overall stamp + **Two-Key** + plain-words summary + confidence band | §3, §4 |
| **System Metrics Radar** (Fig. 11, `MetricsRadar.tsx`) | A pentagon with acronyms; hides direction (BIS inverted), reuse and disagreement | **Assay Hallmark** in the report header + the full **Assay tab** | §4.1 |
| **Transparency Report** (Fig. 12, `TransparencyReport.tsx`) | A wall of panels (Adversary A/B, NIL, Key Evidence) in monospace | The Evidence tab (quote cards vs "ACHP's reading") + the **Integrity Ledger** | §4, §4.1 |
| **Atomic narrative units** with a "CHAIN-OF-THOUGHT" badge (Fig. 10, `AtomicClaims.tsx`) | Labels templated reasoning as chain-of-thought; confidence as bare %; monospace | Claim strips with stamps, marks on exact spans, validated public notes | §3 |
| **Alternative perspectives** (Fig. 10, `PerspectivePanel.tsx`) | Card grid of generated text, "Significance: 80%" | Blue-pencil "missing: …" notes on the strips + a "Voices not heard" list in the Evidence tab | §4 |
| **Grounded Q&A** (Figs. 5–7, `RAGAnswer.tsx`) | Hidden behind a KB toggle inside the dashboard; similarity as a bare % | `/ask`: numbered citations that open quote cards; "Not in this library" state | §6 |
| **Blocked prompt injection** (Fig. 8) | Shows "BIS=100%" and zeroed metrics, which are made-up numbers | A "Not checked" stamp, the reason in words, and only the Gatekeeper lane | §3.3 |
| **Pipeline progress** (`PipelineProgress.tsx`) | A synthetic % bar with "creep" | Event-driven agent lanes | §3 |
| **Monitor / Logs tabs** (`page.tsx`) | A run list without verdict context; fabricated log lines | `/runs` (list + Integrity Map) and the per-case Trace tab | §5, §4.2 |

---

## 2. `/` — the Desk

### Above the fold (desktop, 1440)
```
┌ desk ──────────────────────────────────────────────────────────────────────────────┐
│ ACHP      Check  Ask  Library  Runs  Method  Developers           ● Ready   ◐   ⌘K │
│                                                                                    │
│      Before you forward it, check it.                          (Newsreader 44)    │
│      Seven specialist agents take a claim apart, pin the evidence and argue       │
│      about it in plain sight. You see every step.                (Public Sans 18) │
│                                                                                    │
│   ┌ sheet ───────────────────────────────────────────────────────────────┐         │
│   │ Paste the message you were forwarded…                    (Newsreader)│         │
│   │                                                                      │         │
│   │                                                                      │         │
│   │ ─────────────────────────────────────────────────────────────────── │         │
│   │ ⌂ Drop a screenshot (soon)   Library: none ▾        [ Check it ]     │         │
│   └──────────────────────────────────────────────────────────────────────┘         │
│   Try one:  "Exercise cuts heart disease risk by 30–40%"  ·  "…"  ·  "…"          │
│                                                                                    │
│   ↓ How a check works (1 min read)                                                │
└────────────────────────────────────────────────────────────────────────────────────┘
```
- Example claims: use neutral, checkable, non-inflammatory claims (health stat, historical date, product claim). Retire the immigration demo from the homepage. It can stay in the benchmark.
- The status chip pre-warms the backend on load (`GET /health`). If it's cold: "Waking the desk · 9s". The form still works; the submit queues behind the warm-up.

### Below the fold: the scroll story (Language A)
A stored real case, replayed in 7 steps. **Friction gate** at step 5 (the red pencil on a contradicted strip). Rail on the left: `Claim · Gatekeeper · Sources · Parts · Challenge · Framing · Verdict` + "Skip to the verdict". It ends with a CTA back to the input (scrolls up and focuses the input) and a link to `/method`.

---

## 3. `/case/[id]` — live investigation (desktop ≥1280)

```
┌ desk ─────────────────────────────────────────────────────────────────────────────────────┐
│ ACHP  ‹ New check                           Case r_8f2c · running 12.4s        ● Ready    │
├──────────────────────┬──────────────────────────────────────────────┬──────────────────────┤
│ THE DESK (lanes)     │ ┌ sheet ─────────────────────────────────┐   │ EVIDENCE TRAY        │
│                      │ │ “Regular exercise reduces the risk of   │   │                      │
│ ✎ Gatekeeper   Done  │ │  cardiovascular disease by approx.      │   │ 📎 agency… (card)    │
│   Safe to check 0.3s │ │  30 to 40 percent.”       [seal]        │   │   “…quoted span…”    │
│                      │ │─────────────────────────────────────────│   │   Contradicts · 2024 │
│ 📎 Clipper      Done  │ │ ✂ 1  Regular exercise reduces CVD risk │ ✓ │                      │
│   Pinned 4 sources   │ │ ✂ 2  …by approximately 30–40 percent   │ ~~│ 📎 journal… (card)   │
│                      │ │      ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾ (red strike)  │ ? │   “…”  Supports      │
│ ┌ in parallel ─────┐ │ │      “2 sources say 20–35%” (Kalam)     │   │                      │
│ │✏ Fact Challenger│ │ │ ✂ 3  (applies to adults…)              │ ^ │ 📎 kb chunk 12       │
│ │  Working · 3.1s  │ │ │                                         │   │   “…”  Context       │
│ │  Checking part 2 │ │ │  [stamp slots per strip]                │   │                      │
│ │✏ Narrative Aud. │ │ └─────────────────────────────────────────┘   │                      │
│ │  Working         │ │                                              │                      │
│ │▰ Framing Lens   │ │   Report · Evidence (4) · Assay · Trace       │                      │
│ │  |||  3/5 checks │ │                                              │                      │
│ └──────────────────┘ │                                              │                      │
│ ⚖ Judge       Waiting│                                              │                      │
└──────────────────────┴──────────────────────────────────────────────┴──────────────────────┘
```
(The emoji above only mark wireframe regions. The real UI uses the hand-drawn SVG glyphs.)

### 3.1 Completed state: the Report tab (same URL; the figures are illustrative)
```
│ sheet                                                                             │
│  “claim…”                                              [ MIXED ] (stamp)          │
│                                                        ⌂ ⬡ ◇ ▭ ○  (Hallmark)      │
│                                                        ⚷ Judge ⚷ Formula · agree  │
│  In plain words: Exercise does lower heart-disease risk, but the 30–40% figure   │
│  is higher than what current health-agency sources report (20–35%).              │
│  Evidence strength: Moderate ▰▰▱ · two independent sources agree; one is old.    │
│  Settled: no single signal could flip this verdict by less than 0.25.            │
│                                                                                   │
│  ✂ 1 Supported  ✂ 2 Contradicted  ✂ 3 Missing context       (strip stamps)       │
│                                                                                   │
│  [ Copy summary ] [ Copy link ] [ Share ] [ Replay the investigation ]           │
│  ACHP's reading (interpretation) vs quoted evidence: visually separated          │
│  ▸ How we decided (Assay tab) · ▸ Trace (39 events)                               │
```
The lanes rail collapses into a one-line "7 agents · 18.2s · 1 debate round" summary that expands on click.

---

### 3.2 `/case/[id]` — mobile (<768)

```
┌──────────────────────────────┐
│ ACHP        ● Ready   ☰      │
├──────────────────────────────┤
│ ●●●◐○○○  Fact Challenger:    │  ← sticky lane strip (tap → bottom sheet of lanes)
│          checking part 2…    │
├──────────────────────────────┤
│ sheet                        │
│ “Regular exercise reduces…”  │
│ ✂ 1 Regular exercise…    ✓  │
│ ✂ 2 …30–40 percent      ~~  │
│   3 sources · 2 disagree  ›  │  ← tap → evidence bottom sheet for this strip
│ ✂ 3 …                    ^  │
│ Report · Evidence · Assay ›  │  ← tabs scroll horizontally
└──────────────────────────────┘
```
- The margin column collapses: marks sit inline over the text and notes go below the strip.
- The evidence bottom sheet snaps at 50% and 92% height; it's swipe-to-dismiss with a visible close button.
- Minimum tap target 44×44. The share bar sits fixed at the bottom after completion (with a safe-area inset).

---

### 3.3 System states

| State | Where | Content |
|---|---|---|
| Cold start | Status chip + the case header | A stop-motion lamp + "Waking the desk · 14s. Free-tier servers sleep when idle; this takes up to a minute." |
| Queued | The case header | "Waiting for a free desk · 2 ahead" |
| Interrupted | A banner on the sheet | "Lost connection at step 4. Reconnecting…" → after 3 tries: [Reconnect] [Re-run] |
| Failed | An error card replaces the stamp area | What failed (stage), what's kept (evidence so far), [Retry]. **No verdict** |
| Blocked by the Gatekeeper (paper Fig. 8) | The sheet | A graphite **"Not checked"** stamp, the reason in words ("This message contains instructions aimed at the checker"), only the Gatekeeper lane shown as run, **no metrics and no Hallmark** (never a made-up "BIS 100%"), a link to the method |
| Case expired | `/case/[id]` | "This case is no longer stored. [Run it again]" (claim prefilled) |
| Demo mode | A watermark on the sheet | "Demo data — not a verification" (diagonal, 8% opacity, plus a banner) |
| Empty `/runs` | — | "No checks yet on this browser." + 3 sample public cases |
| Empty `/library` | — | "Libraries let ACHP check claims against your own documents." [Upload] |
| Masking (11 §3.5) | Report, above the Ledger link | The ruled `MaskingNotice`; the Judge's stamp stays the headline |
| Out of library (paper Fig. 7) | `/ask` | "Not in this library." + the 3 nearest chunks as quote cards, and "Check it as a claim instead" |

---

## 4. The Evidence tab and drawer (desktop hover-card → click opens the tray focus)

```
┌ evidence card ─────────────────────────────────────┐
│ 📎  health-agency.example · Fact sheet · Jun 2024   │
│ ┃ “verbatim quote from the page, up to 300 chars”  │  ← Newsreader, left rule in the relation color
│ Contradicts part 2 · strength: strong · verified ✓ │
│ Locator: “Key facts”, paragraph 3   Open source ↗  │
└────────────────────────────────────────────────────┘
ACHP's reading: The source's range is lower than the claim's.   ← interpretation, Public Sans, ink-2
```

Below the cards, **Voices not heard** (Adversary B's missing perspectives, replacing the old "Alternative perspectives" card grid): a plain list, each line "People with physical disabilities: the claim assumes everyone can exercise daily", with no "Significance: 80%" figures.

---

### 4.1 The Assay tab (11_THE_ASSAY)

```
┌ sheet ──────────────────────────────────────────────────────────────────────────────┐
│ The Assay                                                     formula achp-metrics/1.0│
│ How the five scores were reached, and whether they agree with the verdict.           │
│                                                                                      │
│  ⌂ CTS   ⬡ PCS   ◇ BIS   ▭ NSS   ○ EPS          (Hallmark, 28px, full forms below)   │
│  Consensus Truth 61 · Perspective Completeness 52 · Bias Impact 20 (lower is better) │
│  · Narrative Stance 82 · Epistemic Position 46                                       │
│                                                                                      │
│  ⚷ Judge: Mixed    ⚷ Formula: Mixed (0.64)     Judge and formula agree               │
│                                                                                      │
│  Tipping point ─────────────────────────────────────────────────────────────────     │
│  FALSE │ MOSTLY FALSE │   MIXED    ●   │ MOSTLY TRUE │ TRUE                           │
│  0   .30          .50          .64    .70           .85   1                          │
│  Settled: the closest flip needs the calm-certainty score to move 0.40 → 0.80.       │
│                                                                                      │
│  Integrity ledger                                   Debit      Credit   │ margin bars│
│  Opening balance (a claim with every signal at its midpoint)        0.510            │
│  Facts                                                                               │
│    Adversary A factual score        0.62                        +0.010  │ ▏▎         │
│    Judge raw CTS                    0.55                        +0.004  │ ▏          │
│  Wording                                                                             │
│    Framing of the wording           0.18                        +0.089  │ ▏████      │
│    NIL bias score                   0.22                        +0.040  │ ▏██        │
│    …                                                                                 │
│  ═══════════════════════════════════════════════════════════════════                 │
│  Closing balance = overall score                                    0.639            │
│                                                                                      │
│  ▸ Where the numbers come from (Signal Lineage)  ▸ How much humans agreed (Agreement) │
│  ▸ Try the formula (Assay Bench, what-if)                                            │
└──────────────────────────────────────────────────────────────────────────────────────┘
```
- The masking notice (when present) sits directly under the Two-Key and above the ledger.
- The ledger shows 3 decimals; the exact values are in the Trace (`assay.computed`) and the rounding is stated in a footnote.
- Mobile: the Hallmark stays one row (24px marks); the ledger drops the margin bars and keeps signed amounts; the tipping line becomes vertical zone chips.

### 4.2 The Trace tab
Time · agent · event type · summary, virtualized; the `assay.computed` row expands to the full JSON. "Download events.json".

---

## 5. `/runs` — history and the Integrity Map

```
┌ desk ───────────────────────────────────────────────────────────────────────────────┐
│ Your checks (this browser)                                     List · Map            │
│ ┌ sheet: Integrity Map ─────────────────────────────────────────────────────────┐   │
│ │ Reads calm ↑                                                                    │   │
│ │   Quiet falsehood          ·         │          Sound        ● ●              │   │
│ │        ●  (Great Wall…)              │               ●                        │   │
│ │ ─────────────────────────────────────┼──────────────────────────────── 0.5    │   │
│ │   Loud falsehood   ●                 │     True but loaded   ●                 │   │
│ │                                      │                                  Facts →│   │
│ └────────────────────────────────────────────────────────────────────────────────┘   │
│ List: [stamp] [Hallmark 24px] claim excerpt · 3 min ago · Two-Key state             │
└──────────────────────────────────────────────────────────────────────────────────────┘
```
- The run ids live in `localStorage` (try/catch, max 50). The metrics come from each run's stored `assay.computed`.
- Empty: "No checks yet on this browser." + 3 sample cases (labelled "sample").

---

## 6. `/ask` — grounded Q&A (successor of paper Figs. 5–7)

```
┌ desk ───────────────────────────────────────────────────────────────────────────────┐
│ Ask a library        Library: Health KB ▾  (3 documents · 48 chunks)                 │
│ ┌ sheet ─────────────────────────────────────────────────────────────────────────┐   │
│ │ How much exercise does WHO recommend per week?                    (Newsreader) │   │
│ │ ────────────────────────────────────────────────────────────────────────────── │   │
│ │ At least 150 minutes of moderate-intensity activity a week [1].                │   │
│ │                                                                                │   │
│ │ [1] ┃ “…at least 150 minutes of moderate-intensity aerobic physical activity…” │   │
│ │     Chunk 0 · close match                                                      │   │
│ └────────────────────────────────────────────────────────────────────────────────┘   │
│ [ Ask a follow-up… ]                                                  [ Ask ]        │
└──────────────────────────────────────────────────────────────────────────────────────┘
```
- Similarity is shown in words (close / partial / loose match), with the number in the tooltip.
- Out-of-library → "Not in this library." + the nearest chunks + "Check it as a claim instead" (prefills `/`).
- Every sentence of the answer must carry at least one citation; uncited sentences are dropped server-side (the existing citation parser).

## 7. `/library` — knowledge bases (successor of paper Fig. 2)

```
┌ desk ───────────────────────────────────────────────────────────────────────────────┐
│ Libraries                                                   [ Add documents ]        │
│ ┌ index card ─────────────┐ ┌ index card ─────────────┐ ┌ drop zone ────────────┐    │
│ │ Health KB       Active  │ │ Climate reports         │ │ Drop PDF · DOCX · TXT │    │
│ │ 3 docs · 48 chunks      │ │ 5 docs · 210 chunks     │ │ or paste a URL / text │    │
│ │ Ready                   │ │ Embedding 120/210       │ │                       │    │
│ │ Ask · Set active · ⋯    │ │ ⋯                       │ │                       │    │
│ └─────────────────────────┘ └─────────────────────────┘ └───────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────────────┘
```
- `/library/[kbId]`: the documents, then the chunks as a stacked list (chunk index, first 200 chars, token count), a search box, "Ask this library".
- Embedding progress comes from real KB status events or polling. There's no fake progress bar here either.
- Delete asks for confirmation in a dialog (never a browser `confirm()`).

## 8. `/method` — how ACHP decides

A scroll story (Language A, no friction gates), each step on paper:
1. **The seven agents** (lane glyphs, one sentence each, the parallel group shown).
2. **The five metrics, full forms first**: Consensus Truth Score (CTS), Perspective Completeness Score (PCS), Bias Impact Score (BIS, lower is better), Narrative Stance Score (NSS), Epistemic Position Score (EPS), each with its formula and what it measures.
3. **Signal Lineage** with the Paper ↔ Production toggle; framing highlighted.
4. **Agreement Dial** (paper Fig. 13).
5. **Assay Bench** on the reference claim and 3 labelled samples (Sound · Quiet falsehood · True but loaded).
6. **What we found in our own formulas** (11 §2, in plain words): framing leverage, masking, the Judge–formula disagreement, and what we're doing about it.
7. **Benchmark**: one headline number generated from `EVALUATION.md`, the per-benchmark split, and the ablation.
8. **Limitations.**

## 9. `/developers`

Tabs for *MCP · REST · Events*: code blocks in IBM Plex Mono, copy buttons, live `server/discover` output, `curl` for `/runs`, an SSE example with `Last-Event-ID`, and the `assay.computed` schema with a sample payload.
