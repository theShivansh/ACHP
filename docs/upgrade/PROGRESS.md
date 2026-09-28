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

## P1 — Foundation  ✅ 2026-09-24
- [x] Test tooling: `typecheck`, `test` (vitest), `test:e2e` (Playwright, the 5 projects from 09 §6), `@axe-core/playwright` (f5b63e8)
- [x] `motion` replaces `framer-motion` (no imports existed); `cn` replaces `clsx` + `tailwind-merge` via `shadcn migrate cn`; shadcn primitives added: button, dialog, sheet, tabs, tooltip, hover-card, command, sonner, collapsible, table, scroll-area (7aa417f)
- [x] Fonts via `next/font` (Newsreader with opsz, Public Sans, Kalam and IBM Plex Mono not preloaded); both Google Fonts `<link>`/`@import`s and Material Symbols removed (f9103e4)
- [x] Tokens incl. chart tokens (`--mark-*`) in `app/globals.css`, light + dark via `[data-theme]` and `prefers-color-scheme`, type roles, radii, elevation, breakpoints, motion tokens (mirrored in `lib/motion.ts`), `.paper` grain, boil keyframes/classes, reduced-motion / transparency / contrast rules; legacy classes moved to `app/legacy.css`; token contrast test (f9103e4, 9c66f75)
- [x] shadcn primitives restyled to desk/paper tokens (6px buttons, global 2px focus outline, paper overlays, desk tooltips/toasts); `Chip` and `StatusChip` added (213ea8c, 9c66f75)
- [x] `BoilDefs` in the root layout; `lib/agents.config.ts` (7 server agents + `evidence_verifier`, `media_integrity`) with placeholder glyphs in `components/glyphs/` (f9103e4, 8b3bdef)
- [x] Flagged shell `app/(desk)/layout.tsx` (wordmark, nav, live `/health` status chip, theme toggle, menu sheet) + placeholder `app/(desk)/case/[id]/page.tsx` (8b3bdef, 9c66f75)
- [x] S1.4 (partial): the registry holds look only; a unit test asserts no model names in it

Gate evidence:
- `pnpm -C apps/web typecheck` ✓ · `lint` ✓ (0 errors; 20 warnings, all in legacy files) · `test` **84/84** ✓ (token contrast in both themes incl. desk accents, primitives, registry)
- e2e **15/15** ✓ in desktop-light, desktop-dark, mobile-reduced (shell + axe with 0 violations, status chip waking/ready/unreachable via mocked `/health`, case nav behind the menu). mobile-light (WebKit) and firefox-fallback: browsers not installed (see Deferred)
- `pnpm -C apps/web build` ✓. Production server without the flag: `/` 200, `/case/x` 404
- Old UI smoke test (flag irrelevant to `/`): KB manager → "Analyze without KB" → claim analyzed against the live backend, verdict "Mostly true". The Next server logged no `POST /api/analyze`, so the mock fallback (A4) wasn't involved
- Screenshots: `docs/upgrade/screens/P1/` (case shell 390/1440 × light/dark + reduced; chip waking/ready; menu open)
- Anti-slop: every new or changed file clean (`--strict`); full scan 1,103 → **1,094** (all remaining hits are legacy; `app/legacy.css` holds 43 of them, moved verbatim)
- `design-critic`: 0 P0, 5 P1, all fixed (desk-context accents, status dots, nav hidden on case pages, 44px targets, state captures); P2s fixed: desk-surface menu, paper radius conflict, `aria-current`, graphite "Ready", toasts pinned dark. The P2 font concern checked out fine: Newsreader is loaded (`document.fonts`)

Decisions:
- Decision: raw tokens (`--desk`, `--ink`, …) live on `:root` and swap under `[data-theme="dark"]` / `prefers-color-scheme`; `@theme inline` maps them to Tailwind (`--color-desk: var(--desk)`) because 04 names the tokens `--desk` etc. and `@theme` alone can't be re-themed per selector.
- Decision: new primitives never use shadcn's `--primary`/`--background` names because the legacy theme already owns `--color-primary`, `--color-background` etc. and the old UI must keep working until P9.
- Decision: surface-context variables (`--surface-fg`, `--surface-line`, `--surface-red`, …) are set on `body` (desk) and reset by `.paper`, so one primitive reads correctly on both surfaces. Added `--desk-red/blue/support/ochre/graphite` (the 04 §3.2 inks) because the §3.1 sheet inks fail AA on the desk, which is dark in both themes (critic P1).
- Decision: `.paper` no longer sets a radius; callers add `rounded-sheet` or `rounded-card`, because the utility's radius beat `rounded-card` in the cascade.
- Decision: the legacy React-compiler lint errors (unescaped quotes, refs in render, setState in effect) are downgraded to warnings **only** for the listed legacy files in `eslint.config.mjs`, because they sit in components that P2/P9 delete.
- Decision: the status chip reports the real `useHealth()` state (pending → "Waking the desk", ok → "Ready", error → "Unreachable") rather than a static placeholder, so the shell doesn't invent state (non-negotiable 1). Elapsed seconds and the lamp come in P9.
- Decision: overlay enter/exit keyframes live in `globals.css` (no `tw-animate-css`), using the 05 §1 tokens, with exits ~30% shorter; reduced motion drops them.
- Decision: `apps/web` keeps its own lockfile/workspace for now because Vercel builds it with `pnpm install` from that folder; folding it into the root workspace moves to P10 (deploy hardening).
- Decision: in headless captures the status chip reads "Unreachable" because the capture browser has no route through the sandbox proxy; a real browser reads "Ready" (checked in the browser pane).

## Groq runtime refactor (user request, between P1 and P2)  ✅ 2026-09-24
Write-up: `docs/upgrade/12_GROQ_RUNTIME.md` (13 audit findings, the new architecture, API compatibility).
- [x] Shared Groq runtime: one client, FIFO concurrency + bounded queue, strict json_schema, `include_reasoning:false`, Retry-After routing 120b⇄20b, backoff, per-model circuit breaker, telemetry at `/health/llm` (5ec1ab2)
- [x] Canonical registry: every logical agent → gpt-oss-120b primary / gpt-oss-20b fallback; primary==fallback rejected (5ec1ab2)
- [x] Shared prompt contract + role prompts; chain-of-thought instructions removed; claim sent as JSON data (5ec1ab2)
- [x] Evidence pack with server-assigned ids; grounding drops unknown ids, non-verbatim quotes, foreign URLs; UNVERIFIABLE when nothing is grounded (4e374ba)
- [x] Hierarchical memory; evidence cache exact-keyed with TTL, never caches verdicts or empties (4e374ba)
- [x] 3 Groq calls per run (proposer · analysis bundle A+B+NIL · judge), was 7; the Judge now sees the full debate; stage failure → 503, no fabricated verdicts; offline mocks removed; dead duplicate stack deleted (a0bf303)
- [x] `/qa` and the cache validator via the runtime; library chunks travel as evidence, not in the claim (a0bf303)
- [x] Next `/api/analyze` is a proxy (fixed its `{text}`→`{claim}` body); demo only with `?demo=1` (1c617e3)

Gate evidence: `cd apps/api && pytest -q` → **62 passed** (was 5) · Assay parity **23/23**, formula functions AST-identical · leverage lint PASS · web typecheck ✓ lint ✓ (0 errors) · anti-slop clean on changed web files.
Not verified live: no `GROQ_API_KEY` locally and the Space runs the old code. First post-deploy check: one claim, `/health/llm` shows ok calls and `pipeline.groq_calls == 3`.

Decisions:
- Decision: Adversary A, Adversary B and the NIL LLM signals share one structured call because they read the same inputs; each keeps its own schema section and lane, and the free tier (8K TPM, 30 RPM per model) can't carry 7 calls per run.
- Decision: strict-schema length/range keywords are moved into descriptions and enforced server-side (trim/clamp), because Groq's documented strict keyword set doesn't list them and a rejected schema would fail every run.
- Decision: `/analyze` returns 503 `{detail, stage, error_code, retryable}` on a failed stage and 400 for `offline:true`, because the old fabricated verdicts break non-negotiable 4; the success shape is unchanged.
- Decision: a 429 on one model routes the rest of the run to the other model while it cools, because Groq quotas are per model.

## P2 — Event protocol v2  ✅ 2026-09-24 (except 6 live fixtures, blocked on a Groq key; see Deferred)
- [x] Models for every 06 §3.1 type + EvidenceObject, JSON Schema at `apps/api/schemas/events.v2.json`; SQLite store with gapless seq, 72h TTL (5546d35)
- [x] S1.7 public-note validation → deterministic templates; confidence band as a pure function (a7f959d)
- [x] S1.4 `RunEventBus` + emissions from every pipeline step; `run.started.agents[]` from the model registry; `agent.done.model` = the model that served (443040f)
- [x] S1.1 `POST /runs` → 202 in <300ms · S1.2 SSE resume via `Last-Event-ID`/`?since=` · S1.3 replay a finished run · `/analyze` is a run wrapper; `_sse_queues` removed (f7b4372)
- [x] Contract tests in `apps/api/tests/events/`, including a live mid-run drop-and-resume through uvicorn (4930fcb)
- [x] S1.6 plain failure messages (no provider errors or model ids); a ping frame EventSource can see (f320ff6); no verdict can precede a failure; streams resumed at the end close (b83f118)
- [x] `scripts/record_run.py` (+ `--fail-at` behind `ACHP_ALLOW_FAULT_INJECTION=1`); `scripts/synthetic_run_logs.py` for unit-test logs (5338114)
- [x] Frontend `lib/runs`: types (+ schema sync test), pure reducer (deduped, gaps rejected, frozen after terminal), `RunConnection` (20s watchdog, gap repair, 1s/3s/7s backoff, polling fallback), `useRunEvents`, throttled announcer (5ed4778, 29a54f8)
- [x] S1.5 Trace tab = the real events, export = `events.json` verbatim · deleted `buildDetailedLogs`, the Logs tab, `PipelineProgress`'s creep + 92% cap, the `progressPulse` bar, the Sidebar's fixed 60% bar, the KB creeping upload bar and the hard-coded model strings · legacy page runs on `/runs` + the hook · demo data watermarked and only with `?demo=1` (d61d718, ae3ff7e)
- [x] Record fixtures per `fixtures-plan.md` (P2 set): 6 of 7 recorded for real (e5f41e2; outcomes and off-target takes in `fixtures-plan.md` → "Recorded 2026-09-29"). `failed-midway` still needs `ACHP_ALLOW_FAULT_INJECTION=1` on a backend with a key (the case failure e2e uses `synthetic-failed-judge` until then)
Gate evidence: `pytest -q` **150 passed** · Assay parity 23/23, leverage lint PASS · web typecheck ✓ lint ✓ (0 errors) · vitest **120 passed** (reducer snapshots for 5 synthetic logs + the real `blocked` fixture) · honesty greps (09 §5) clean (the `components/case` check starts in P3) · manual: `curl -H "Last-Event-ID: 5"` resumed at 6; browser pane: keyless run → Gatekeeper done → plain error card, no verdict; blocked run → 13 events in Trace; Sidebar model from `run.started` · `event-contract-verifier`: pass 1 → 0 P0 / 3 P1; pass 2 → 1 new P1 (a run could end without a terminal event); pass 3 → **PASS, 0 P0 / 0 P1**. Its last two P2s (verdict + completion written in one transaction; a run cancelled while queued ends in `run.failed`) were then fixed with tests
Decisions:
- Decision: every 06 deviation is additive and recorded in 06 §3.3 (fallback_model, prompt_version, agent.started.round, agent.note.source, agent.done.model, evidence retrieved_at, judge_verdict, per-part confidence_reason, snapshot `error`).
- Decision: `verdict.final` is held until the result is stored and emitted right before `run.completed`, because the verifier showed a failure could otherwise follow a verdict.
- Decision: the SSE ping is `: ping` + a named `ping` event with no id, because EventSource never dispatches comments and the 20s watchdog needs to see it.
- Decision: failure messages are plain sentences keyed by error code; provider text stays in server logs, because the raw message leaked a model id and HTTP status.
- Decision: whether a run has ended is read from the log (does it end in `run.completed`/`run.failed`), never from `runs.status`, and `verdict.final` + `run.completed` are written in one transaction, so every log ends in exactly one terminal event and no failed run carries a verdict.
- Decision: the polling fallback reads `events.json?since=` rather than the snapshot, so the UI stays a projection of events.
- Decision: unit-test logs are generated by the real pipeline + bus with a fake model transport and live under `lib/runs/__tests__/logs/` as `synthetic-*`, never in `fixtures/runs/`, because recorded fixtures must be real runs.
- Decision: EvidenceObject `strength`/`freshness`/`claim_id`/`relation` are omitted at retrieval time rather than invented; the verifier fills them in P8.

### P2 follow-up: first deploy (2026-09-29)
- [x] `apps/api` deployed to the HF Space (you pushed `hf-deploy`, e7a3064). `/health/llm` and `/runs` answered with the new code.
- [x] The first live recording failed at the Decomposer with `internal_error`, and `/health/llm` showed no calls. Cause: the Space's fresh build installed groq 1.7.0, where the async `raw.parse()` returns a coroutine. Fixed with an await-if-awaitable, `groq>=0.30,<2`, and `tests/test_groq_transport.py`, which drives the real SDK over a mocked HTTP layer and passes on 0.30 and 1.7 (9fb3aa5). The failed recording was deleted, not kept as a fixture.
- [x] You pushed `hf-deploy` again (4c1a8ee). Live runs now complete end to end: 3 model calls, 43–46 events, 6–49s
- Note: the `unverifiable` claim came back Contradicted on 2 takes; P4 needs a claim that reliably yields Unverifiable for the dashed-box stamp.
- Decision: the transport is tested against the installed SDK with only HTTP faked, because every other runtime test uses a fake transport, and that is how an SDK upgrade broke every live run unnoticed.

## P3 — Live investigation board  ✅ 2026-09-29
- [x] S3.1 lane states from events · [x] S3.2 live action line · [x] S3.3 parallel group · [x] S3.4 strips as parts arrive · [x] S3.5 marks on exact spans · [x] S3.6 mid-run failure · [x] S3.7 mobile agent strip · [x] S9.1 paced announcements
- [x] Selectors in `reducer.ts` (lane groups, current lane, steps reached, reading order, part numbers, per-part evidence, evidence uses, debate reason) and `lib/marks/measure.ts` (Range → one rect per line), unit-tested (66a4d06)
- [x] Dev fixture route `app/api/dev/fixture/[name]/[[...path]]` serves the backend's own endpoints (SSE at recorded `t_ms` ÷ `speed`, resumable, `events.json`, snapshot); 404 in production; `drop=N` test hook (af96c36)
- [x] `/case/[id]`: server fetch of the stored `events.json` for the first paint, then `useRunEvents` resumes after it (or doesn't connect if the log already ended); `fixture-<name>` ids replay a fixture. `data-run-status` on the root. Components in `components/case/`: `CaseLive`, `AgentLane`/`LaneList`, `LaneStrip` + `LaneRail`, `ClaimStrip`, `Mark`, `EvidenceTray`, `RunNotices`, `Elapsed` (1c54fdf, cf6f2b8)
- [x] e2e `case.live` (lane order per commit vs the log, strips in reading order, mark boxes vs the browser's Range boxes ≤1px, tray counts and verbatim quotes, axe, mobile strip + sheets), `case.resume` (drop → `since=N` → same final state, no duplicates), `case.failure` (failed: evidence kept, stage named, no verdict; blocked: only the Gatekeeper ran, no scores) (39157f1)
- [x] `case.*` e2e and the captures run on the recorded `exercise-mixed` (the specs picked it up automatically); `failed-midway` still synthetic (see P2)
- [x] Design review round 1 fixes (7200ac6, see below): a challenger's "contradicts" is an underline until the Judge rules Contradicted (then a strike); agreement marks in `--support`; Kalam only for notes ≤6 words; one mobile status row with the evidence button in the case bar; no empty label/gap before the claim; blocked body without the repeated "Not checked:"; neutral rule for a source used both ways; "Date not given"; wrapped brackets open/close once; state captures via `scripts/ui/shoot-case-states.mjs` (parallel working, interrupted, lanes sheet, evidence sheet)
- Gate: see evidence below

- [x] Design review round 2 (b879fa4): brackets sit in the gutter outside the words; a challenger's red finding turns graphite once the Judge rules anything but Contradicted; "<0.1s"; an unmatched edge quotation mark is trimmed for display (body untouched); one "Evidence" heading in the sheet; elapsed time in the mobile summary
- [x] a11y audit fixes (0c2f7c1, fb3f4ef): focus returns to the opener when any sheet closes (SheetTrigger for the lane sheets; `onCloseAutoFocus` for the tray); one paced voice (the visible run line is not live; an sr-only `role=status` speaks only waking / reconnecting / lost connection; template notes aren't announced; the verdict uses the page's "Strong evidence" words; an agent failure outranks same-priority news); the interrupted banner is an alert only after the retries give up; scroll margins under the sticky header; `pointer-coarse` 44px targets; strips, cards and action lines appear in place under reduced motion; `e2e/case.a11y.spec.ts` (axe in 4 states, focus return, pacing)
- [x] Live check in the browser pane against the HF Space: a run started from the page rendered its first 26 events server-side, then streamed `events?since=26` live: three challengers working in parallel → completed

Gate evidence: typecheck ✓ · lint ✓ (0 errors; 15 legacy warnings) · vitest **137/137** · e2e desktop-light + desktop-dark + mobile-reduced: **52 passed, 5 skipped** (viewport-specific; the one pacing failure under 3 workers was React-commit jitter, fixed in fb3f4ef, then 6/6 on repeat) · pytest **152** · honesty greps (09 §5, incl. `components/case`): clean · anti-slop `--strict` on every new file: 0 · screenshots `docs/upgrade/screens/P3/` (the recorded run at 1× t2000/t6000/done; contradicted-strong, blocked, failed; state captures: parallel working, interrupted, lanes sheet, evidence sheet; 390/1440 × light/dark + reduced) · stillness: pass · `design-critic`: round 1 → 2 P0 / 7 P1, round 2 → 0 P0 / 1 P1, fixed (b879fa4) · `a11y-auditor`: 0 axe violations in every state; 2 P1 (focus return, unpaced status region), fixed with e2e

Decisions:
- Decision: until the P2 fixtures are recorded, the case e2e and captures replay the `synthetic-*` unit-test logs through the same dev route (`/case/fixture-synthetic-mixed`, labelled "synthetic test log, not a real check" in the case bar); the specs switch to `exercise-mixed` / `failed-midway` automatically when those files exist, because P3 can't wait on a model key and the logs come from the real pipeline + bus.
- Decision: the server render fetches `events.json` rather than the snapshot, because the page is a projection of events and the snapshot carries no events; a 404 renders the "no longer stored" state, an unreachable backend leaves the client to connect (and show "waking").
- Decision: the desk layout no longer wraps pages in `<main>`; each page renders its own, so the case's `aside` landmarks sit beside `main` (axe `landmark-complementary-is-top-level`).
- Decision: a finished lane shows its summary and only model-written notes; template notes restate the same counts. Notes use Kalam per 04 §7 (AgentLane) even beyond 6 words, with an sr-only sans copy.
- Decision: the lane-order e2e checks order across DOM commits, not within one: a render that applies several events writes them in tree order.
- Decision: a lane's Retry lives only on the failed card (a run can't be resumed per lane); "Run it again" starts a new run and is hidden for fixture replays.
- Decision: the tablet tray and the mobile evidence sheet use the desk surface with paper cards, matching the ≥1280 tray.
- Decision: the red strike is the verdict's mark (04 §3.3), so a Fact Challenger's "contradicts" finding is drawn as a red underline and only becomes a strike once `verdict.final` labels that part Contradicted; a failed run therefore never shows a strike.
- Decision: the Gatekeeper's reason is shown as its event states it; we don't invent a more specific reason (07 §3.3's example wording needs a reason field from the server, logged for P9).
- Decision: the completed state shows a plain verdict chip + "ACHP's reading" as a placeholder; stamps, the Hallmark and the report are P4.

- Decision: the visible run line isn't a live region and `role=status` speaks only connection states, because the reviewer measured three utterances in 160ms when both the status line and the announcer spoke; every event-driven change already goes through the paced announcer.
- Decision: accepted deferrals from the design review: the Supported margin tick and stamps replacing the chips (P4/P8); `/method` link (P9); the waking chip's seconds and lamp (P9); bottom-sheet snap points (P7); "Run it again" is hidden on fixture replays only.

Intentional differences from the prototype (`prototype-screens/case-live-light.png`): no Report/Evidence/Assay/Trace tabs yet (P4); per-strip verdicts are chips, not stamps (P4/P8); marks draw smoothly, not stepped (P8); the evidence card's relation label appears only once a mark or the verdict states it (the prototype shows it from the start).

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
- Playwright WebKit + Firefox browsers (~200 MB): not installed, so the `mobile-light` and `firefox-fallback` projects haven't run. Install with `pnpm -C apps/web exec playwright install webkit firefox` before P6 (the replay gate needs 3 engines).
- Fold `apps/web` into the root pnpm workspace → P10 (Vercel install path must change with it).
- P1 critic P3/genericness, deferred: wordmark optical centering is nudged 1px, fine-tune in P11; the case sheet's 120px margin column → P3 (CaseSheet); a hand-drawn lamp glyph in place of the status dot → P9 (cold-start lamp); a small seal mark beside the wordmark is a brand choice → P11 (G8).
- P2 fixtures: record `exercise-mixed`, `all-supported`, `contradicted-strong`, `missing-context`, `unverifiable`, `failed-midway` with `python scripts/record_run.py --all` against a backend that has `GROQ_API_KEY` (and `ACHP_ALLOW_FAULT_INJECTION=1` for `failed-midway`). No key locally; the live Space runs pre-P2 code.
- P2 verifier P2s left for later phases: `assay.computed` nested shapes typed → P5; the legacy report renders from the snapshot `result` and legacy components keep hard-coded agent descriptions and a % confidence → replaced in P3/P4/P9; the blocked result still shows the legacy radar with BIS 100% → P4/P5 (the event log itself has no metrics for blocked runs).
- P3 review P2/P3 left for later: collapse the 6 identical "Skipped" lanes of a blocked run into one line and the done-rail summary "7 agents · 18.2s" (P4, with the report layout); the interrupted notice on the sheet instead of the desk (P4); the reserved verdict row under a part still being checked, or "With the Fact Challenger" there (P4 stamps); lane action lines line-clamped instead of `title` (P7); a distinct dot shape for "second round" (P8 glyphs); tidy scraped source titles ("PDF …", "… - PMC") and "Read the full quote" for clamped quotes (P4 evidence tab); the header chip on case pages as `aria-live="off"` and the Sheet close button first in tab order (P10); announce mark events (P8, with the stepped marks); an sr-only h1 before the lanes (P9 IA); scraped dates at the start of some quotes are a Clipper issue (backend, P8 verifier).
- G5: the paper's Table III mean (62.2%) needs the paper source to reconcile; `EVALUATION.md` generation goes in P9 (`/method`).
