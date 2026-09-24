# PROGRESS — "The Fact-Checker's Desk" upgrade

Resume rule: open this file, find the first unchecked item, continue from there. Branch: `feat/fact-checkers-desk` (from `main` @ `ff86979`, 2026-08-18).

---

## P0 — Bootstrap & baseline  ✅ 2026-09-24
- [x] Kit installed into the repo (`.claude/`, `CLAUDE.md`, `docs/upgrade/`, `scripts/ui/shoot.mjs`, `reference/assay/`, prototype + its reference screens in `docs/upgrade/prototype-screens/`)
- [x] Audit P0/P1 findings (A–E, G) verified against current code: see "P0 verification" below
- [x] PROGRESS.md created (this file)
- [x] `playwright` added to root devDependencies (1.63.0; the Chromium 1243 build was already installed, so nothing was downloaded)
- [x] Baseline screenshots: `docs/upgrade/screens/P0-baseline/` (current `/` against the live backend)
- [x] Target screenshots: `docs/upgrade/screens/P0-target/` (prototype `#/case`, `#/case/quiet` at done; `#/`, `#/runs`, `#/method`)
- [ ] ~~Lighthouse mobile score for `/`~~: the Lighthouse CLI isn't installed, so this was skipped as the prompt allows. It moves to P10 (Lighthouse CI).
- [x] Moodboard scaffold: `docs/upgrade/moodboard/README.md` (9 empty slots for you to fill from godly.design)
- [x] Fixture plan: `docs/upgrade/fixtures-plan.md`
- [x] Assay reference check: parity **ran and passed** against today's `core_pipeline.py`
- [x] Anti-slop baseline recorded

Gate evidence:
- `ACHP_REPO=$PWD python -m pytest -q reference/assay` → **23 passed, 0 skipped** (the parity test ran)
- `node --experimental-strip-types --test reference/assay/assay.test.mjs` → **14/14 pass**
- `python reference/assay/leverage_lint.py` → **PASS** (code mode: s_fr 3.14× the factual attack, limit 3.6); `--mode paper` → PASS (s_fr 2.27×)
- Anti-slop full scan: **1,103** hits (identical to the kit author's count on 23 Sep)
- Backend `/health` → `{"status":"ok","pipeline_mode":"online","kb_count":0}` (read-only; no write endpoints called)
- Target stillness (prototype, 2s after done): **pass, 0 running animations**

### P0 verification (audit 01 §A–E, §G; P0 and P1 items)
Line numbers were re-located on `ff86979`; paths are relative to `apps/`.

| # | Result | Evidence |
|---|---|---|
| A1 | **confirmed, and worse than described** | `web/app/page.tsx:561` opens `EventSource` *before* the POST at `:619`, so the GET almost always wins. `api/main.py:723-724` registers the queue only inside the POST handler (after KB validation, `:675-700`); `:768-771` answers "run_id not found or already completed" and returns; the client's `onerror` (`page.tsx:610`) then closes for good. The server does honour the client's `X-Run-Id` (`main.py:675`), so the only problem is ordering: there's no log to replay. |
| A2 | confirmed | `web/components/PipelineProgress.tsx:60-61` (cap at 92%), `:105-117` (800ms interval adding 0.4) |
| A3 | confirmed | `web/app/page.tsx:121` `buildDetailedLogs`; hard-coded strings at `:140` ("guardlist"), `:164` ("OpenRouter DeepSeek R1 classification"), "AGENT n/11" at `:138-175` |
| A4 | confirmed | `web/app/page.tsx:630-643` falls back to `/api/analyze`; `web/app/api/analyze/route.ts:261` `buildOfflineMock`, `:386-389` random 1.0–1.8s sleep, then returns a mock verdict |
| A5 | confirmed | `web/components/Sidebar.tsx:19,29,39,99` (Llama 4 Scout, DeepSeek R1, Llama 3.3 70B) vs `api/achp/core/core_pipeline.py:571-572,613` (`openai/gpt-oss-120b`) |
| A6 | confirmed | "AGENT n/11" at `page.tsx:138-175`; 8 steps in `PipelineProgress.tsx:7-14` |
| A7 | confirmed | `web/components/VerdictCard.tsx:15` (`pct()`), `:24` (confidence falls back to `composite_score`, shown as a %) |
| A8 | confirmed (and visible in the baseline screenshot) | `web/components/KBManager.tsx:735` `backendOnline = !!health`, `:773` shows "FastAPI Offline" while `useHealth()` is still loading. `screens/P0-baseline/home-*` show "FASTAPI OFFLINE" although `/health` was OK |
| B1 | confirmed | `page.tsx:28,457` default phase `'kb-manager'`; H1 "Knowledge Base Manager" in the baseline shot |
| B2 | confirmed | The only routes are `app/page.tsx` and `app/api/analyze/route.ts`; results live in React state |
| B3 | confirmed | No `openGraph` in `app/layout.tsx`, no `opengraph-image.*` anywhere |
| D1 | confirmed | `grep -rn "aria-\|role=" web/components web/app` → **0** |
| D2 | confirmed | 11 `fontSize` 7–8px sites; 61 text colours at `rgba(255,255,255,0.1x–0.2x)` |
| D3 | confirmed (visible) | Material Symbols loaded at `app/globals.css:2` and `app/layout.tsx:20`; ligatures render as words ("add_circle", "picture_as_pdf", "cloud_upload") in the baseline shots |
| E1 | confirmed (visible) | `page.tsx:370,789` `gridTemplateColumns: '1fr 288px'`; 2 responsive utility hits, 0 `@media`. At 390px the KB panel overflows off the right edge (`home-mobile-light.png`) |
| G1 | confirmed | `api/achp/core/core_pipeline.py:189-216` `verdict_from_composite()` always returns `judge_verdict`; the composite only sets confidence. Reference: Fig. 9 metrics → C = 0.532 → Mixed (`test_assay.py`, green) |
| G2 | confirmed | Reference tests reproduce paper Case 1 (fA 0.05 → C 0.638 Mixed) and Case 3 (0.15 → 0.520 Mixed); 23/23 green |
| G3 | confirmed | `leverage_lint`: dC/ds_fr is 3.14× dC/dfA in production (|dC/dfA| = 0.080), 2.27× in the paper's equations; `compute_*` at `core_pipeline.py:112-186` |
| G4 | confirmed | `core_pipeline.py:639-643`: `narrative_alignment = 1.0 − framing_sc`; `NSS_proxy(BIS, framing)` at `:830-832` when the Judge omits NSS |
| G5 | **partly confirmed** | The repo README (`README.md:790-815`) shows 68.3 for ACHP and 69.9 for "ACHP + Re-debate", so those two are different variants rather than a contradiction. The paper's Table III 62.2% mean can't be checked from the repo (the paper PDF isn't in it). The fix stands: generate one `EVALUATION.md` and show one number plus the split |
| G6 | confirmed | `web/components/AtomicClaims.tsx:79` `CoTBadge`, label "CHAIN-OF-THOUGHT" at `:100`, used at `:250` |

No finding was refuted. Parity passes, so the formulas haven't changed since the kit was written.

### Baselines
- **Anti-slop (full scan, `apps/web`) = 1,103** → target 0 by P10:
  inline-style 410 · neon-cyan 226 · banned-font 169 · mono-label 69 · icon-font 55 · caps-tracking 53 · purple-gradient 38 · js-hover 23 · fake-progress 17 · glass 11 · infinite-anim 10 · glow-shadow 9 · hardcoded-model 5 · radar-chart 4 · grid-backdrop 3 · pure-bw 1
- **Lighthouse mobile `/`:** not measured (no CLI); first measurement in P10 via Lighthouse CI.
- **Leverage:** s_fr/fA = 3.14 (code), limit 3.6. A formula change that pushes this up fails CI once P5 wires in the lint.

---

## P1 — Foundation
- [ ] Tokens incl. chart tokens (`--mark-*`) in `app/globals.css` `@theme`; token contrast test
- [ ] Fonts via `next/font` (Newsreader, Public Sans, Kalam, IBM Plex Mono); remove the double `<link>`/`@import` and Material Symbols
- [ ] shadcn/ui restyle base; `motion` (from `framer-motion`) + `cn` migration
- [ ] BoilDefs (stepped feTurbulence filters), `lib/agents.config.ts`
- [ ] Test tooling: `typecheck`, `lint`, `test`, `test:e2e` scripts (vitest + Playwright)
- [ ] S1.4 (partial): the registry exists; nothing hard-codes models
- Gate: token contrast test green · old UI still works · anti-slop clean on the new files

## P2 — Event protocol v2
- [ ] S1.1 `POST /runs` → 202 `{run_id}`
- [ ] S1.2 `GET /runs/{id}/events` SSE resume via `Last-Event-ID`
- [ ] S1.3 replay a finished run from the persisted log
- [ ] S1.4 agents/models from `run.started.agents[]`
- [ ] S1.5 Trace data (events → JSON export)
- [ ] S1.6 visible failure; mocks only with `?demo=1` + watermark; delete the production mock fallback
- [ ] S1.7 public-note validation → deterministic templates
- [ ] Frontend types / `reducer.ts` / hook / announcer; delete the fake progress, fabricated logs and mocks
- [ ] Record fixtures per `fixtures-plan.md` (P2 set)
- Gate: pytest contract suite · reducer tests · honesty greps (09 §5) · `event-contract-verifier`

## P3 — Live investigation board
- [ ] S3.1 lane states from events · [ ] S3.2 live action line · [ ] S3.3 parallel group · [ ] S3.4 strips as parts arrive · [ ] S3.5 marks on exact spans · [ ] S3.6 mid-run failure · [ ] S3.7 mobile agent strip · [ ] S9.1 paced announcements
- Gate: `case.live` / `resume` / `failure` e2e · `design-critic` no P0/P1

## P4 — Verdict, evidence, share
- [ ] S4.1 · [ ] S4.2 · [ ] S4.3 · [ ] S4.4 · [ ] S4.5 · [ ] S5.1 · [ ] S5.2 · [ ] S5.3 · [ ] S5.4 · [ ] S6.1 · [ ] S6.2 · [ ] S6.3
- Gate: `/impeccable critique case` + `design-critic` clean · no `%` in the Sharer view

## P5 — The Assay
- [ ] S10.1 Hallmark (replaces radar, OG) · [ ] S10.2 Two-Key · [ ] S10.3 masking notice + Truth-first · [ ] S10.4 Integrity Ledger · [ ] S10.5 Tipping Point · [ ] S10.6 Lineage · [ ] S10.7 Agreement Dial · [ ] S10.8 Bench · [ ] S10.10 Leverage Lint in CI
- [ ] Port to `apps/api/achp/assay` + `assay.computed` event; `apps/web/lib/assay`
- [ ] Record P5 fixtures (quiet-falsehood, true-but-loaded, paper-fig9-metrics)
- Gate: parity + ledger balance + vectors green in both stacks · `assay-auditor` · the 3 fixtures render exactly as 11 §3

## P6 — Scroll story & replay
- [ ] S7.1 · [ ] S7.2 · [ ] S7.3 (`chapters.ts`, replay mode, ≤2 friction gates, rail + skip, Motion fallback)
- Gate: `replay.spec` green in 3 engines + reduced motion

## P7 — Micro-interactions (silent)
- [ ] S2.4 · [ ] S5.2 · [ ] S9.2 (ViewTransition morph, tabs, tooltips, copy, shake, span linking, Assay micro-interactions)
- Gate: `motion-auditor` · no stray durations · `no-audio` clean

## P8 — Stop-motion layer
- [ ] S9.4 glyphs, stepped marks, boil, stamps, Hallmark punches, Two-Key keys, scissors, clip, highlighter, tally, lamp
- Gate: stillness test · low-end gating · `motion-auditor`

## P9 — Full-site IA & pages
- [ ] S2.1 · [ ] S2.2 · [ ] S2.3 · [ ] S8.1 · [ ] S8.2 · [ ] S8.3 · [ ] S8.4 · [ ] S8.5 · [ ] S8.6 · [ ] S10.9 · [ ] ⌘K, status chip, blocked state · [ ] every 07 §1.1 row retired
- Gate: all routes pass screenshot review on mobile + desktop · 07 §1.1 fully checked

## P10 — Hardening
- [ ] S9.1 · [ ] S9.3 · [ ] a11y, perf budgets, Lighthouse CI, e2e matrix, `/impeccable audit` + `harden` · [ ] anti-slop full scan = 0
- Gate: axe clean · budgets met · all Playwright projects green

## P11 — Polish & ship
- [ ] Final critique, `/impeccable polish`, designmd drift check, docs, product name (G8), preview deploy · [ ] production promotion **waits for your approval**
- Gate: every gate green · PROGRESS.md closed

---

## Decisions
- Decision: work in a fresh clone at `Downloads/ACHP_Interface_Upgrade_Kit final/ACHP` because the shell sandbox can't write to `Documents/New project/ACHP`. That older clone is untouched except for an empty `docs/upgrade/.keep` left by a write test.
- Decision: added explicit UTF-8 to the reference's file I/O (`test_assay.py`, `leverage_lint.py` reads, and lint stdout) because Windows defaults to cp1252 and the tests crashed during collection. No formula or vector changed.
- Decision: install `apps/web` with its own lockfile (`pnpm -C apps/web install --frozen-lockfile`) because it has its own `pnpm-workspace.yaml`, so the root install doesn't populate it. P1 should fold it into the root workspace.
- Decision: run `shoot.mjs` with `MSYS_NO_PATHCONV=1` under Git Bash because MSYS rewrites `--routes /` into `C:/Program Files/Git/`.
- Decision: run the anti-slop and gate hooks manually for now because they bind to `$CLAUDE_PROJECT_DIR`, and this session's project folder isn't the repo.

## Deferred
- Lighthouse mobile baseline for `/` → P10 (no CLI available in P0).
- Prototype layout bug to avoid in P4/P5: on the desktop case (`P0-target/achp-site-html-case-desktop-light-done.png`) the Hallmark overlaps the claim headline (the "of" collides with the CTS mark). Give the Hallmark its own row or reserve width for it.
- Moodboard images: you fill these from godly.design (`moodboard/README.md`).
- G5: the paper's Table III mean (62.2%) needs the paper source to reconcile; `EVALUATION.md` generation goes in P9 (`/method`).
