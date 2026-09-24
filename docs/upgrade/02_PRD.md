# 02 — PRD: ACHP Interface Upgrade ("The Fact-Checker's Desk")

**Owner:** Shivansh · **Status:** Ready for build · **Builds on:** `ACHP_v2_PRD.md` (FR1–FR9) and `ACHP X` (FR-001…FR-007, NFR-001…003)
**Surface:** `apps/web` (Next.js 16, React 19.2, Tailwind v4) + the event layer in `apps/api` (FastAPI)

---

## 1. Problem

ACHP's pipeline outperforms GPT-4o zero-shot by 9.5 points, but its interface does three things that cost it credibility:

1. **It hides the work.** A 20–90 second pipeline sits behind a loader and a synthetic % bar. The adversarial debate, which is the most interesting and most defensible part of the system, is invisible while it happens.
2. **It misreports the work.** The Logs tab prints fabricated lines, the model labels are wrong, and a silent mock can return a verdict (01_AUDIT A1–A5).
3. **It looks like every other AI dashboard.** Neon cyan on black, glass cards, a grid backdrop and monospace everything. Visitors pattern-match it to "AI slop" before they read a word.
4. **It shows five scores without explaining them.** CTS, PCS, BIS, NSS and EPS appear as a radar and bare percentages, with no full forms, no direction (BIS is inverted), and no warning when they disagree with the verdict. Computed against the paper's own formulas, the composite lets calm wording lift refuted claims (paper Cases 1 and 3 → MIXED) and already contradicts the Judge on screen (paper Fig. 9). See 11_THE_ASSAY §2.

## 2. Thesis

> **The investigation *is* the interface.** Every second of latency should show a real, legible step of the fact-check: a claim being cut into parts, a source being pinned, a red-pencil challenge, a stamped verdict. That turns waiting into the product's best demo.

## 3. Goals

| # | Goal | Measure |
|---|---|---|
| G1 | Replace hidden latency with real, event-driven progress | 100% of rendered progress originates from server events; no client-side timers fake progress |
| G2 | Make the verdict understandable by a non-expert in under a minute | Hallway test (n=5): "Which part is false, and why?" answered correctly by ≥4 people within 60s |
| G3 | Make results shareable | Every run has a permalink that survives refresh, and a social preview |
| G4 | A distinctive, non-generic visual identity | 0 violations from the anti-slop gate; the `design-critic` subagent and `/impeccable critique` both pass |
| G5 | Accessible and mobile-ready | axe: 0 serious/critical; Lighthouse mobile ≥90 on `/` and `/case/[id]` |
| G6 | Interview-ready honesty | A trace for every run, derived from real events; model names come from runtime data |
| G7 | Make CTS · PCS · BIS · NSS · EPS understandable and auditable, not decorative | Every metric shows its full form on first use; the Ledger balances to C for every run (|Δ| < 1e-9); Two-Key and masking states render for 100% of completed runs; 4 of 5 hallway testers can say why the composite is what it is |

## 4. Non-goals

- No user accounts or auth (still stateless and anonymous, as in v2).
- No new ML models and no pipeline accuracy work. This PRD is interface plus event layer only.
- **No audio of any kind** (no UI sounds, no ambient sound, no sound toggle). All feedback is visual and text, which also keeps the site usable in public places and with screen readers.
- No WebGL/3D, no chatbot-style conversation UI.
- No changes to how the pipeline *computes* CTS/PCS/BIS/NSS/EPS in this upgrade. The Assay instruments *audit and explain* the existing formulas; formula changes (e.g. the factual gate, 11 §6) need their own ADR and benchmark run.
- No scroll-jacking and no motion that blocks input. "Intentional friction" means lengthening a scroll track, never stealing the wheel.
- No marketing site beyond `/` and `/method`.

## 5. Personas

| Persona | Job to be done | What they need from the UI |
|---|---|---|
| **Concerned Sharer** (primary) | "Before I forward this WhatsApp claim, is it true?" | One input, plain words, which part is wrong, sources they can open, a link they can send back |
| **Technical Reviewer / Interviewer** (secondary) | "Is this engineer's system real and well-built?" | A live view of the agents working, the trace, the method, the benchmark, honest limits |
| **MCP Client Developer** (tertiary) | "Can I call this from my agent?" | `/developers`: tools, schema, example calls (v2 FR4) |
| **Maintainer** (you) | "Why did this verdict happen?" | Trace per run, replay, event log export |

## 6. Requirements

Priority: **P0** = ships in this upgrade, blocks release · **P1** = ships in this upgrade · **P2** = behind a flag or stubbed

### 6.1 Event layer & truthfulness

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| **IF-01** | P0 | Run lifecycle: `POST /runs` returns `202 {run_id, events_url}` immediately; the pipeline runs as a background task; `GET /runs/{id}/events` streams SSE from a persisted, append-only event log and honors `Last-Event-ID` | Connecting after a run has started or finished replays every event in order. A dropped connection resumes without gaps. 15s heartbeat. Old `/analyze` stays as a thin compatibility wrapper |
| **IF-02** | P0 | Agent lanes driven only by events (`queued → working → done / skipped / failed / waiting`), with a live action line and a public note | No client timer advances or invents progress state (timers that only drive decorative animation are fine). Killing the backend mid-run shows *Interrupted* within 20s (heartbeat miss), never a frozen bar |
| **IF-03** | P0 | One agent registry: `run.started` carries `agents[]` (id, display name, role, model, parallel group). The UI maps ids to visual identity through `agents.config.ts` | No model name string literals in `apps/web/components`. Adding an agent (e.g. Evidence Verifier) needs only a config entry |
| **IF-09** | P0 | A Trace tab renders the stored events (timestamp, agent, type, payload summary) and offers a JSON export | Byte-for-byte derived from the event log; the fabricated `buildDetailedLogs` is deleted |
| **IF-11** | P0 | Honest backend status: `Waking the desk…` (cold start, with elapsed seconds) / `Ready` / `Unreachable — retry` | A cold start never shows "Offline". Status polling backs off (2s → 5s → 10s) |
| **IF-12** | P0 | No mock verdicts in production | Without `?demo=1`, a backend failure shows an error state with retry. Demo mode shows a persistent "Demo data — not a verification" watermark on the sheet and the OG image |

### 6.2 The investigation & report

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| **IF-04** | P0 | Progressive case sheet: the claim appears at once; atomic claims, evidence, adversary marks, NIL highlights and verdict stamps are added as their events arrive, all on the **same page** that becomes the report | The first meaningful content (the claim set on the sheet, plus the Gatekeeper lane working) renders ≤300ms after submit. Atomic claims appear within 1s of `claim.extracted`. No skeleton blocks bigger than one line |
| **IF-05** | P0 | Verdict model: each atomic claim gets **Supported / Contradicted / Mixed / Missing context / Unverifiable**. The overall summary is written in words. Confidence is a band (*Strong / Moderate / Weak evidence*) with a one-line reason | No bare TRUE/FALSE and no bare % anywhere in the Sharer view. Evidence quotes are visually distinct from model interpretation (ACHP X FR-007) |
| **IF-06** | P0 | Case permalink `/case/[runId]`: the live view while running, the report when done, safe to refresh | Opening the URL on another device mid-run shows the same live state via replay. A completed case loads in <1.5s (LCP) from cache |
| **IF-07** | P1 | Plain language first; a **Method drawer** holds CTS/PCS/BIS/NSS/EPS with full forms, definitions, formulas and caveats, and links to the Assay tab (6.5) | The Sharer view uses no metric acronyms. The drawer passes the Reviewer walkthrough |
| **IF-08** | P1 | Replay mode (`/case/[id]?replay=1`): a scroll-driven story of the investigation, with **at most 2 friction points** (the first contradiction, the missing context) and a "Skip to verdict" control at all times | CSS scroll-driven animations with a Motion `useScroll` fallback (Firefox). Reduced motion: a static, fully readable document with no pinning |
| **IF-13** | P1 | Share: the OG image per case (stamp + claim excerpt), a "Copy summary" giving a WhatsApp-friendly text with the link, and the native share sheet on mobile | The preview renders in WhatsApp, X and LinkedIn validators. The summary is ≤400 characters and includes the link |
| **IF-20** | P2 | Human-review lane: when the overall confidence is *Weak* or the adversaries disagree above a threshold, show an "Editor's desk" callout. The request-review action is a stub for ACHP X FR-005 | Behind the flag `NEXT_PUBLIC_FF_HUMAN_REVIEW` |

### 6.3 Interaction, motion & identity

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| **IF-10** | P1 | Utility micro-interactions: evidence↔claim-span hover linking, copy feedback, view transitions between Desk → Case (05 §4). **Silent**: no audio anywhere | Every hover cue has a `:focus-visible` twin. Every confirmation is visible (icon morph + text) and announced to screen readers. The anti-slop hook's `no-audio` rule finds nothing |
| **IF-19** | P1 | Stop-motion layer: hand-drawn marks (12fps stepped), line boil on active agent glyphs, the 4-frame verdict stamp | The boil filter is removed from the DOM at rest (true stillness). With reduced motion, marks appear fully drawn |
| **IF-18** | P0 | Design system adoption: tokens from `04_DESIGN.md` in `@theme`; shadcn primitives (Radix/Base UI) for dialog, sheet, tabs, tooltip, hover-card, command, toast | New or changed components contain no inline `style={{}}` except CSS custom-property plumbing. The anti-slop hook passes |

### 6.4 IA, input & platform

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| **IF-14** | P2 | Screenshot intake UI: drop or paste an image → the OCR text is "typed" onto the sheet → low-confidence words are dotted-underlined and editable → confirm → run (depends on v2 FR1) | Behind the flag `NEXT_PUBLIC_FF_IMAGE_INTAKE`. OCR failure degrades to "type the text" with no silent verdict |
| **IF-15** | P1 | **Full-site IA** (07): `/` Desk · `/case/[id]` (Report · Evidence · Assay · Trace) · `/ask` (grounded Q&A) · `/library` (KB manager) · `/runs` (history + Integrity Map) · `/method` (metrics, Lineage, Bench, calibration) · `/developers`. Every surface in the paper's Figs. 2, 5–12 has a redesigned successor (07 §1.1) | Every route has a title, meta description, a mobile layout and designed empty, loading-by-event, error and blocked states |
| **IF-16** | P0 | Accessibility: WCAG 2.2 AA; a polite `aria-live` log for agent updates (throttled to 1 message per 2s); full keyboard support; visible focus | axe clean; a screen reader reads the lane updates at a sensible pace; tab order follows the visual order |
| **IF-17** | P1 | Performance budgets (09 §3) | CI Lighthouse is green on budgets; `html2canvas`/`jspdf` are removed (print stylesheet plus server OG instead) |

### 6.5 The Assay: metric instruments (11_THE_ASSAY)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| **IF-21** | P0 | Server-side Assay: port the reference implementation to `apps/api/achp/assay/`; after `verdict.final`, emit `assay.computed` (06 §3.1) with the raw signals, the five metrics, C, the formula verdict, Two-Key, Ledger, Tipping Point, masking and Integrity Map values | The parity test (reference vs production formulas) passes; the Ledger check < 1e-9 on every fixture; the event validates against `events.v2.json` |
| **IF-22** | P0 | **Assay Hallmark** replaces the radar everywhere (case header, `/runs`, OG image): five cartouches with distinct shapes, fill = value, BIS hatched and labelled "lower is better", full forms on hover/focus, a table twin | No radar component remains; the Hallmark reads correctly in grayscale and at 24px height; axe clean |
| **IF-23** | P0 | **Two-Key Verdict** under the overall stamp: agree / adjacent / split / not applicable, with plain-language copy | A split opens the Ledger by default; the paper Fig. 9 metrics fixture renders "Close call: Judge Mostly false · Formula Mixed (0.53)" |
| **IF-24** | P0 | **Truth-first rule + masking notice** (11 §4): C is never the headline; when masking fires, a ruled notice explains the narrative lift | The `quiet_falsehood` fixture shows the notice and keeps the Judge's FALSE stamp as the headline |
| **IF-25** | P1 | **Integrity Ledger** in the Assay tab: opening balance, per-signal credits/debits (facts pinned first), closing balance = C; diverging margin bars in validated tokens | Rows sum to the closing balance on screen (rounded display, exact data); the table is keyboard navigable |
| **IF-26** | P1 | **Tipping Point**: a sentence in the Report ("Fragile: …") and a number line with verdict zones in the Assay tab | The band and the lever match the reference output for all 6 fixtures |
| **IF-27** | P1 | **Signal Lineage** diagram (paper ↔ production toggle) and **Agreement Dial** (paper Fig. 13 r values) on `/method` and in the Assay tab drawer | Each node is focusable and lists its inputs/outputs; the table twin matches |
| **IF-28** | P1 | **Assay Bench** (what-if) on `/method` and in a case drawer, powered by `apps/web/lib/assay` | Persistent "What-if. This doesn't re-run the agents." label; the case's real values stay marked; nothing from the Bench can be shared or stamped; recompute ≤ 50ms per change |
| **IF-29** | P1 | **Integrity Map** on `/runs`: CTS × Calm scatter with four named quadrants and a table twin | Dots ≥ 8px with 24px hit areas; clicking opens the case; single neutral series + highlight only |
| **IF-30** | P2 | **Leverage Lint** in CI (`scripts/leverage_lint.py`) | CI fails when a non-factual signal exceeds the configured ratio without an ADR |
| **IF-31** | P1 | **Metric vocabulary**: every metric's full form on first use per view; BIS always marked "lower is better"; human agreement labelled as agreement, never as accuracy or confidence | A copy test scans rendered pages for bare acronyms on first use |

## 7. User flows (happy paths)

1. **Check a claim (warm backend):** land on `/` → paste the claim → **Check it** (the claim text morphs into the case sheet header via View Transition) → watch 7 lanes work, while the claim is cut into strips, sources are pinned, red and blue marks appear and each strip is stamped → read the plain-words summary → tap a contradicted strip → the evidence drawer opens → **Share**.
2. **Cold backend:** submit → "Waking the desk… 12s" (the lamp flickers, a stop-motion loop, and the claim is already set on the sheet) → proceeds as in flow 1 with no restart.
3. **Reviewer:** open a shared case → **Replay** → scroll the story (the page slows at the first contradiction) → open the **Assay** tab (Hallmark, Two-Key, Ledger, Tipping Point) → open **Trace** → open **/method** and drag the Bench.
4. **Ask a library:** `/ask` → pick a library → ask → the answer arrives with numbered chunk citations as quote cards → an out-of-library question gets "Not in this library" with the closest chunks, never an invented answer (paper Fig. 7).
5. **Manage a library:** `/library` → drop a PDF → chunks appear as index cards as they're embedded → set it active for the Desk and Ask.
6. **Failure:** backend unreachable → an error card with the last received event, a **Retry** button, and a status link. No verdict is shown.

## 8. Dependencies & decisions

| Decision | Default | Alternatives |
|---|---|---|
| Event store | SQLite at `ACHP_DATA_DIR` (HF Spaces persistent `/data` if enabled), with a 72h TTL cleanup | Supabase Postgres (free tier) via `EVENT_STORE_URL` for durable permalinks |
| Transport | SSE (`text/event-stream`) with `id:` fields | WebSocket (rejected: more infrastructure for no benefit here) |
| Motion library | `motion` (`motion/react`) plus native CSS scroll-driven animations and React `<ViewTransition>` | GSAP (rejected: heavier, less React-idiomatic) |
| Metric instruments | One reference implementation (`reference/assay/assay.py`) ported to `apps/api/achp/assay/` (server, emits `assay.computed`) and `apps/web/lib/assay/` (client, Bench only), pinned by `vectors.json` | Computing everything client-side (rejected: the server must own the numbers the report shows) |
| Component primitives | shadcn/ui + AI Elements (Chain of Thought, Task, Sources) **restyled** to DESIGN.md | Headless from scratch |

## 9. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| HF Spaces cold start (20–60s) | High | IF-11 states. The claim is set on the sheet immediately. A health ping fires on page load to pre-warm |
| A proxy buffers SSE | Medium | `X-Accel-Buffering: no`, 15s heartbeat comments, and a client fallback to polling `GET /runs/{id}` every 2s after 2 failed reconnects |
| Permalinks lost when the Space restarts | Medium | Persist completed runs. When the store misses, show "Case expired — re-run?" with the claim prefilled |
| SVG filters janky on low-end Android | Medium | Boil only on ≤3 small elements at once, stepped at 8–12fps; turned off when `navigator.hardwareConcurrency ≤ 4` or `saveData` is set |
| Narrative motion reads as gimmick | Medium | Every motion has a trigger list (05). Reviewer path via Trace/Method. Friction limited to 2 points, always skippable |

## 10. Release plan

Phases P0–P11 in `claude/PHASES.md` (~14 working days). Release behind `NEXT_PUBLIC_FF_DESK=1` on a Vercel preview. Promote once the gates in `09_ACCEPTANCE_AND_QA.md` are green.
