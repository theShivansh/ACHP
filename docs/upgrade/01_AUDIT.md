# 01 — UI/UX & Trust Audit of ACHP (live site + repo)

**Audited:** achp-seven.vercel.app (server render, 23 Sep 2026) · repo `theShivansh/ACHP@main` (`apps/web`, `apps/api`) · backend health at `theshivansh-achp-api.hf.space/health` (online, `pipeline_mode: online`, `kb_count: 0`) · the ACHP paper (NLP submission PDF, 7 pages: metric definitions, Figs. 1–13, Tables I–V)

**Severity:** **P0** breaks trust or correctness · **P1** blocks the persona or mobile · **P2** quality and slop tells · **P3** polish

**Verdict in one line:** the pipeline is genuinely strong (it beats GPT-4 zero-shot on all three benchmarks in the paper's Table III), but the interface undersells it three times over. It *looks* like a generic neon AI dashboard, and in three places it *behaves* dishonestly: fake progress, fabricated logs and silent mock verdicts. And its five metrics are shown without full forms, in a radar that hides a Judge-vs-formula disagreement and calm wording lifting refuted claims (§G). A sharp interviewer finds all of this in five minutes. Fix trust first, then meaning, then taste.

---

## A. Trust & correctness (fix before any visual work)

| # | Sev | Finding | Evidence | Fix (kit ref) |
|---|---|---|---|---|
| A1 | **P0** | **SSE race: live progress usually never arrives.** The client opens the `EventSource` *before* the POST, but the server creates the queue *inside* the POST handler, after KB validation. If the GET wins the race, the stream replies `run_id not found`, and the client's `onerror` closes it for good. | `apps/web/app/page.tsx:559-611` (open SSE, then POST at 618). `apps/api/main.py:722-724` (queue registered late), `:767-771` (not-found → return) | Replace with `POST /runs` → 202 `{run_id}` + `GET /runs/{id}/events` backed by a replayable event log with `Last-Event-ID` (06 §3, IF-01) |
| A2 | **P0** | **Progress % is synthetic.** It's capped at 92%, then an 800ms "creep" timer adds 0.4% so the bar "never looks frozen". Given A1, users mostly watch invented progress. | `components/PipelineProgress.tsx:60-62`, `:105-117` | Delete the % bar. Replace it with event-driven agent lanes (06 §4, IF-02) |
| A3 | **P0** | **Logs tab fabricates execution lines.** Messages like "OpenRouter DeepSeek R1 classification", "PII/toxicity scan passed guardlist" and "NIL override…" are hard-coded strings, printed whether or not they happened. | `app/page.tsx:121-185` (e.g. `:140`, `:164`, `:178`) | A Trace tab rendered from the stored event log (06 §7, IF-09) |
| A4 | **P0** | **Silent mock verdicts in production.** If FastAPI fails, the client falls back to `/api/analyze`, which can fall through to an offline mock, adds a *random 1–1.8s sleep* to feel real, and returns a verdict. | `app/page.tsx:630-642`; `app/api/analyze/route.ts:261-333`, `:386-388` | In production, fail visibly with a retry and a status link. Allow mocks only with `?demo=1`, watermarked "Demo data — not a verification" (IF-12) |
| A5 | **P0** | **Model labels contradict reality.** The sidebar lists DeepSeek R1, Llama 4 Scout and Llama 3.3 70B, but the pipeline runs `openai/gpt-oss-120b` for both adversaries. | `components/Sidebar.tsx:19,29,39,99` vs `apps/api/achp/core/core_pipeline.py:570-571` | Agent cards read `model` from `run.started.agents[]` in the event stream. Nothing is hard-coded (06 §3) |
| A6 | P1 | **Agent count is told three ways.** "7 parallel agents" (they mostly run sequentially), "AGENT n/11" in logs, and 8 steps in the progress bar. | `app/page.tsx:319`, `:138-181`; `PipelineProgress.tsx:6-15` | One registry, `agents.config.ts`. Copy says "7 agents, 3 of them run in parallel" (IF-03) |
| A7 | P1 | **Flat verdict + percentage** ("TRUE · 87%"), which your own v2 PRD FR5 forbids. The UI also treats confidence as a probability, when it's really a model score. | `components/VerdictCard.tsx:15,24` | Per-claim verdict vocabulary + a qualitative confidence band with a stated reason (02 IF-05) |
| A8 | P1 | **"FastAPI Offline" shows while the health check is still loading** (seen in the live server render). On a Hugging Face cold start that's the first thing a visitor reads. | `components/KBManager.tsx:728-773`; live scrape header | Three states: *Waking the desk (cold start, ~30s)* / *Ready* / *Unreachable + retry* (IF-11) |

## B. Information architecture & first impression

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| B1 | P1 | **The landing page is a Knowledge Base Manager** ("Upload documents… Set an active KB"). The primary persona, the *Concerned Sharer*, came to check one forwarded claim, not to manage a corpus. | Live H1 "Knowledge Base Manager"; `app/page.tsx:457` default phase `kb-manager` | `/` becomes the Claim Desk: one input (text or screenshot) and three example claims. KBs move to `/library` (07 §1) |
| B2 | P1 | **No shareable result URL.** Results live only in React state; a refresh loses them. Sharing is the core loop for the persona. | `app/page.tsx:462-463` | `/case/[runId]`: the live run and the permanent report share one URL (IF-06) |
| B3 | P1 | **No OG image or social preview.** Pasting the link into WhatsApp shows a bare URL. | Live scrape: `ogImage: null` | Dynamic `opengraph-image.tsx` per case: the stamped verdict + the claim (IF-13) |
| B4 | P2 | **Jargon-first.** Title "Narrative Integrity System", metrics CTS/PCS/BIS/NSS/EPS on a radar in the main view. Plain-language labels are missing. | `app/layout.tsx:7`; `MetricsRadar.tsx` | Plain language first. The expert metrics move to a "Method" drawer with definitions (IF-07) |
| B5 | P2 | **The Monitor and Logs tabs are mislabeled.** The logs subtitle claims `results.length * 5` entries; the actual count is about 24 per run. | `app/page.tsx:742` | `/runs` (history) plus a per-case Trace tab |

## C. Visual system — the "AI slop" tells

Anthropic's own Opus 5.5 guidance notes the model falls back on default styles when design direction is vague. The current UI stacks almost every tell of 2024–25 AI dashboards:

| # | Sev | Tell | Evidence |
|---|---|---|---|
| C1 | P2 | Near-black background + **neon cyan glow** + purple accent gradient | `globals.css:110-124` (`neon-glow-*`), `PipelineProgress.tsx:125-127` |
| C2 | P2 | **Grid backdrop** + **glassmorphism** (`backdrop-filter: blur(20px) saturate(180%)`) | `globals.css:85-108`, `:256-263` |
| C3 | P2 | **Monospace body text** + uppercase, wide-tracked micro-labels everywhere | `globals.css:79` (`body { font-family: JetBrains Mono }`); dozens of `letterSpacing: '0.15em'` |
| C4 | P2 | "Material-Cyber" token set, copied from a generated reference and mostly unused (410 inline `style={{}}` objects) | `globals.css:5-72`; `grep -c "style={{"` = 410 |
| C5 | P2 | A radar chart as the hero data viz: hard to read, easy to screenshot, says little | `components/MetricsRadar.tsx` |
| C6 | P3 | Material Symbols ligatures leak into text ("upload_fileFile", "arrow_forwardSelect a KB Above") | Live scrape markdown |

**Measured baseline:** the kit's deterministic scanner (`claude/.claude/hooks/anti-slop-check.mjs --all --summary`) finds **1,103 banned-pattern hits** in `apps/web` today: inline-style 410 · neon-cyan 226 · banned-font 169 · mono-label 69 · icon-font 55 · caps-tracking 53 · purple 38 · js-hover 23 · fake-progress 17 · glass 11 · infinite-anim 10 · glow 9 · hard-coded model 5 · radar-chart 4 · grid-backdrop 3 · pure-bw 1. The target by P10 is 0.

## D. Accessibility (WCAG 2.2 AA)

| # | Sev | Finding | Evidence |
|---|---|---|---|
| D1 | P1 | **No ARIA anywhere**: 0 `aria-*` attributes, no live region for pipeline updates | `grep -rn "aria-" apps/web/components apps/web/app` → 0 |
| D2 | P1 | **Illegible type**: 7–8px labels, text at `rgba(255,255,255,0.13–0.30)` on `#0a0a0a` (contrast roughly 1.3–2.6:1) | `PipelineProgress.tsx:217,240,250`; `PipelineTimeline.tsx:75` |
| D3 | P1 | Icon ligatures are read aloud as words ("add_circle") | C6 |
| D4 | P2 | 23 `onMouseEnter`/`onMouseLeave` JS hover handlers: no keyboard or focus equivalent, no `:focus-visible` styles | `grep -c onMouseEnter` = 23 |
| D5 | P2 | No `prefers-reduced-motion` handling; infinite shimmer and pulse animations | `globals.css:156-164`, `PipelineProgress.tsx:260-270` |

## E. Responsive & performance

| # | Sev | Finding | Evidence |
|---|---|---|---|
| E1 | P1 | **Fixed desktop grid** (`1fr 288px`) with no breakpoints, so it breaks on mobile. v2 PRD FR6/FR7 require mobile. | `app/page.tsx:370`, `:789`; only 8 responsive class/grid hits in the whole app |
| E2 | P2 | Fonts load twice (a `<link>` in the layout *and* an `@import` in CSS), render-blocking, and `next/font` isn't used | `app/layout.tsx:16,20`; `globals.css:1-2` |
| E3 | P2 | `html2canvas` + `jspdf` sit in the main bundle for an occasional export | `package.json` |
| E4 | P3 | `framer-motion` is imported by its old package name; Motion now ships as `motion` (`motion/react`) | `package.json` |

## F. What's already good (keep it)

- A real parallel stage (Adversary A + B + NIL via `asyncio.gather`), a semantic cache, KB chunk citations `[CHUNK N]`, and an existing `emit()` hook in `core_pipeline.py`. The event protocol v2 builds on it instead of replacing it.
- Security validation before and after the pipeline, and the atomic-claim decomposition. These are the raw material for the new "cut the claim into strips" moment.
- The Q&A mode with cited chunks becomes Library → Ask, restyled.
- Tailwind v4, Next 16, React 19.2: a modern base, so no framework migration is needed.

---

## G. Metrics & paper consistency (from the ACHP paper PDF and `core_pipeline.py`)

All of these are computed by `reference/assay` (tests included); details in 11_THE_ASSAY §2.

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| G1 | **P0** | **The Judge and the formula disagree on screen with no explanation.** Paper Fig. 9 shows MOSTLY FALSE beside BIS 42 · CTS 52 · PCS 51 · NSS 75 · EPS 30, which compute to C = 0.532 → MIXED | Paper Fig. 9/11; `verdict_from_composite()` returns the Judge's verdict and uses C only for confidence (`core_pipeline.py:189-216`) | **Two-Key Verdict** (11 §3.2, IF-23) |
| G2 | **P0** | **Calm wording lifts refuted claims.** Paper Case 1 (factual 0.05, REFUTED) → composite 0.638 MIXED; Case 3 (0.15, REFUTED) → 0.520 MIXED | Paper Sec. VIII; eq. (6) averages CTS with four narrative metrics | **Truth-first rule + masking notice + QFI** (11 §3.5, §4; IF-24) |
| G3 | P1 | **Framing has about 3× the leverage of the factual attack** on the composite (dC/ds_fr = −0.252 vs dC/dfA = +0.080 in production; 2.3× with the paper's equations). The factual signals hold about 15% of total leverage | `compute_*` functions, `core_pipeline.py:112-186`; reference `leverage()` | **Integrity Ledger, Lineage, Leverage Lint** in CI (11 §3.3, §3.6, §3.10). A formula change is out of scope (ADR proposal in 11 §6) |
| G4 | P1 | **The code differs from the paper's NSS**: `narrative_alignment = 1 − framing_score`, and `NSS_proxy` when the Judge omits NSS, so framing enters NSS 2–3 times | `core_pipeline.py:639-643, 830-832` | Documented in `/method` with the **Paper ↔ Production** toggle; the parity test pins the behavior |
| G5 | P1 | **Three different headline accuracy numbers**: 68.3% (repo/v2 PRD), 69.9% (paper abstract, Sec. IX), and Table III's per-benchmark mean of 62.2% (vs 57.2% for GPT-4 zero-shot) | Paper Table III and Sec. IX-A; `ACHP_v2_PRD.md` | Generate `EVALUATION.md` from one script; `/method` renders one number plus the split |
| G6 | P1 | **"CHAIN-OF-THOUGHT" badge** on atomic claims labels templated reasoning as chain-of-thought | Paper Fig. 10; `components/AtomicClaims.tsx:79` (`CoTBadge`) | Replaced by validated public notes (06 §5); the badge is deleted in P9 |
| G7 | P2 | **Blocked input shows "BIS = 100%" and zeroed metrics**: numbers that weren't measured | Paper Fig. 8 | "Not checked" stamp with no metrics (07 §3.3, S8.5) |
| G8 | P2 | **The product name differs**: "Automated Claim & Hallucination Pipeline" (paper) vs "AI Claim Hardening Pipeline" (site meta description) | Paper title; live `<meta name="description">` | Pick one, and use it in `<title>`, OG and README (P11) |
| G9 | P2 | **Metrics shown as acronyms without full forms** (radar labels "BIS (42)", bars "BIS 42%") | Paper Fig. 11; `MetricsRadar.tsx` | `MetricTerm` + the Hallmark tooltip (IF-31) |

## Scorecard (0–5)

| Dimension | Now | Target after kit |
|---|---|---|
| Trust / honesty of UI | 1 | 5 |
| Metric clarity (full forms, direction, disagreement) | 0.5 | 4.5 |
| Clarity for Concerned Sharer | 1.5 | 4.5 |
| Visual distinctiveness (non-slop) | 1.5 | 4.5 |
| Motion purposefulness | 1 | 4.5 |
| Accessibility | 0.5 | 4 |
| Mobile | 0.5 | 4 |
| Performance | 2.5 | 4.5 |
