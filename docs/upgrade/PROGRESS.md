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

## P4 — Verdict, evidence, share  ✅ 2026-09-29
- [x] S4.1 verdict vocabulary in one place (`lib/verdict.ts`; legacy TRUE…FALSE mapped explicitly) · [x] S4.2 stamps (`Stamp`: seeded tilt, wobbly border, ink mask, `role="img"` + written label) · [x] S4.3 confidence band (words + 3 segments, never a %) · [x] S4.4 "ACHP's reading" set apart from quotes, with the sources it rests on · [x] S4.5 the Judge's own mark per strip (tick, half-underline, caret, dashed box)
- [x] S5.1 final evidence cards (favicon, domain, verbatim quote in Newsreader, locator, "Date not given", strength/verifier only when present) · [x] S5.2 span ↔ card linking (`linkStore`, pointer + focus) · [x] S5.3 Report / Evidence / Trace tabs in `?tab=` · [x] S5.4 method drawer (benchmark text only from `EVALUATION.md`, else "no benchmark yet") · Trace: windowed table, expandable raw JSON, "Download events.json"
- [x] S6.1 share bar (Copy summary ≤400 chars ending in the link, Copy link, Share where offered, Replay link hidden for fixtures) · [x] S6.2 title "ACHP · <Verdict>: <excerpt>" + og/twitter · [x] S6.3 1200×630 OG image (stamp, claim excerpt, no score; a stored test log is watermarked)
- Commits: 89c98ca, e6c0ed5, b815153 (build) · 610fbe1 (design review round 1) · a11y fixes (see log)
- Design review fixes (610fbe1): the band is titled "Confidence in this verdict" and, on mixed/missing-context parts, the server now says sources were *cited* rather than *agree* (`events/confidence.py`, tested); the reading lists its sources as chips that open the Evidence tab on that card; "The part that does not hold" sits beside the reading with a link to the strip (long reports no longer hide it below the fold); a stopped run has no red anywhere (challenger marks, "Disputed by … no ruling", card rules, failed card are graphite/ochre); "Run it again" whenever the page can re-run; stamp tilt never level (1.2°–3°), overall stamp larger, heavier ink; evidence cards numbered ("Source N"), one paperclip, a border; sources button goes to the Evidence tab once done; the tray is hidden on the Evidence tab; a single-part message shows one stamp
- a11y audit: 0 P0/P1. Fixed the P2s: named evidence cards (`aria-label` on the `li`; `role="group"` on an `li` broke the list, caught by axe), visible focus on the strip that "does not hold" links land on, disputes/context spoken (no `aria-hidden`), labelled trace JSON, 44px clear-filter on touch

Gate evidence: typecheck ✓ · lint ✓ (0 errors; 15 legacy warnings) · vitest **167/167** · pytest events **88 + 1 new** (confidence wording) · e2e desktop-light + desktop-dark + mobile-reduced: **73 passed, 7 skipped** (viewport-specific) plus one first-compile flake re-run green; axe on all three tabs in both desktop themes and mobile ✓ · honesty greps (09 §5): clean · anti-slop `--strict` on the changed files: 0 · no `%` in the report tab (rendered-text test) ✓ · stillness: pass · screenshots `docs/upgrade/screens/P4/` (curated set committed; full-page, the reading, strips, share bar and the open method drawer at 390/1440 × light/dark; recorded runs: exercise-mixed, contradicted-strong, missing-context, blocked; failed: synthetic) · `design-critic`: 0 P0, 5 P1 (fixed above), P2/P3 logged below · `a11y-auditor`: 0 P0/P1

Decisions:
- Decision: the Judge's stamp is the headline and the composite never appears in the report or the OG image, because Truth-first (11 §4); the Assay itself is P5.
- Decision: the case page's title and OG image are built on the server from the stored log via one cached `loadCase`, so a shared link previews the verdict without JavaScript.
- Decision: "Confidence in this verdict" is server text (`confidence_reason`); recorded fixtures keep the older wording ("4 sources agree") because a fixture is a recording; new runs say "cited" where sources differ.
- Decision: the OG image bundles Newsreader from `@fontsource` (Node fetch has no route to the font), and omits `fonts` if the file can't be read.
- Decision: the source chips focus the card after the tab has rendered (an effect that seeks the card for a few frames) because Radix mounts tab content a frame after the value changes.
- Decision: the sources button in the case bar opens a sheet while a run is live and the Evidence tab once it is done.

Deferred:
- Recorded fixtures never produced a Missing-context or Unverifiable *verdict* (the `unverifiable` claim came back Contradicted; `missing-context` came back Mixed); both are covered by unit and component tests only. Record a claim that reliably yields each when a key is at hand.
- Design P2/P3: show only the Judge's marks in the final view (adversary marks are the shown work, kept for now) · tighter mobile top chrome (merge "New check" into the lane strip) · a chevron on Trace rows · a larger overall stamp only from 1280px (it is larger everywhere now).
- a11y P3: keep a focused Trace row rendered when it scrolls out of the window · confirm Next `<Link href="#…">`-style jumps move focus (they are plain anchors; the target strip is focusable).
- `failed-midway` still needs a backend with `ACHP_ALLOW_FAULT_INJECTION=1` and a key; the failed captures use the synthetic log.
- OG image font-file tracing in a production (standalone/Vercel) build is unverified; check at P10.
- WebKit and Firefox are not installed; install before P6. `EVALUATION.md` (the benchmark) is generated in P9.

## P5 — The Assay  ✅ 2026-09-30 (the three P5 fixtures are synthetic and the Integrity Map is P9: see Deferred)
- [x] Port: `apps/api/achp/assay/core.py` is a byte copy of `reference/assay/assay.py` (`tests/assay/test_copy.py` fails on drift); the reference tests run against it, and the parity test with `core_pipeline.py` RUNS (conftest points `ACHP_REPO` at the repo; `test_copy.py` fails if it would skip). `lib/assay/assay.ts` + `vectors.json` are copies of the reference with a node test (30 node tests including the copy checks) (6457b65, d50304a)
- [x] `assay.computed`: built in `core_pipeline._hold_assay` from the same values the metrics use, run in a thread, compared with the pipeline's own metrics (a mismatch drops the event, never contradicts the record); held and emitted by `RunEvents.complete()` as `verdict.final → assay.computed → run.completed` in one transaction; nothing for blocked or failed runs; flips trimmed to 5; nested pydantic models and a regenerated `schemas/events.v2.json` (6457b65)
- [x] S10.10 Leverage Lint: `scripts/leverage_lint.py`, a pytest (`tests/assay/test_leverage_lint.py`), `.github/workflows/assay.yml`, documented in `CONTRIBUTING.md`; passes at the default ratio and with `--no-judge-nss`
- [x] S10.1 Hallmark (`components/assay/Hallmark.tsx`; 24/28/40px; shield · hexagon · hatched diamond · level · circle; fill = value; finer line for r < 0.75; a tooltip with the full form that can be hovered and is dismissed with Escape; the score under each mark at 40px). It replaces the radar (`MetricsRadar.tsx` deleted; the legacy page shows the Hallmark) and is in the OG image (shapes only, no numbers)
- [x] S10.2 Two-Key (each key names the verdict it holds; agree, close call and split in the 04 §7.1 copy; a second line says the stamp is the Judge's verdict) · S10.3 masking notice + Truth-first (on the Report and Assay tabs; the composite is never a heading, a stat or in the OG image)
- [x] S10.4 Integrity Ledger (facts first, opening and closing balances, margin bars in `--mark-credit/--mark-debit`) · S10.5 Tipping Point (a 0–1 scale with neutral zones, the dot, the leader and the lever; under 768px a ruled strip with the case's dot) plus one sentence on the Report tab · S10.6 Lineage (Paper ↔ Production; framing in ochre with its path count; the table is the twin) · S10.7 Agreement Dial · S10.8 Bench (the what-if label inside the sticky block, real-value ticks, Reset, recompute on `requestAnimationFrame`, nothing to copy, share or stamp, and it cannot change the stored report)
- [x] `MetricTerm`: the first use in a view spells the metric out (BIS always "lower is better"); rendered-text tests fail on a bare acronym before its full form in the Assay tab (4 logs)
- [x] The Assay tab (`?tab=assay`, layout 07 §4.1) after a completed, non-blocked run; a run with no readout says so; a metrics-only log says it has no ledger or tipping point
- [x] Test logs (`scripts/assay_fixtures.py`): `synthetic-quiet-falsehood` (Judge False · formula Mostly true 0.72 · masking), `synthetic-true-but-loaded` (split, 0.41), `synthetic-paper-fig9-metrics` (Close call: Judge Mostly false · Formula Mixed (0.53)), `synthetic-loud-falsehood` (Judge and formula agree); the synthetic pipeline logs were regenerated and carry `assay.computed`
- Reviews: `assay-auditor` 0 P0/P1 and 3 P2 fixed (the what-if label inside the sticky block; full forms in both drawers; a visible spelled-out caption under the report Hallmark) · `design-critic` 3 P0 and 8 P1 fixed (Bench stacking; a 40px Hallmark with scores and a real hatch; the mobile tipping strip with its dot and edge; the Two-Key caveat line and labelled keys; "raised/lowered" tipping wording; the ledger "Effect" column and balance semantics; the lineage 11-vs-13 note and edge rule; agreement widths; Assay-tab order; a log where they agree) · `a11y-auditor` 0 P0 and 2 P1 fixed (the Hallmark tooltip is dismissible and hoverable, WCAG 1.4.13; the sticky Bench block no longer covers focus: sticky only when tall, `scroll-mt` on sliders) plus the P2s (Reset keeps focus; a live status for the Bench verdict; `aria-valuetext`; the lineage drawing is decorative with the table as its twin; hyphen-minus signs; ledger bodies and "none" cells)

Gate evidence: typecheck ✓ · lint ✓ (0 errors; 14 legacy warnings) · vitest **212/212** (assay: display helpers, lineage, components including first-use, Bench, Hallmark and ledger) · pytest **182** (assay 27) · reference pytest 23 and node 30 ✓ (parity ran) · leverage lint ✓ (3.14× and 3.49×) · axe on the Report and Assay tabs for 4 logs and inside the Bench, Lineage and Agreement drawers ✓ (desktop-light, desktop-dark, mobile-reduced) · screenshots `docs/upgrade/screens/P5/` (curated set committed) · e2e desktop-light + desktop-dark + mobile-reduced: **104 passed, 10 skipped** (viewport-specific), 0 failed

Decisions:
- Decision: the three P5 fixtures are named `synthetic-*` and live with the other synthetic logs, not as `fixture-quiet-falsehood`, because the live pipeline can't be told to produce a quiet falsehood and the prompt allows synthesis; the prefix makes the case bar, the loader and the OG image label them "test log, not a real check" automatically.
- Decision: `assay.computed` is emitted inside `complete()` with `verdict.final` and `run.completed` in one transaction, because a verdict must never be logged without its closing event and no failure may follow it (06 §3.1); the Assay is computed earlier (after the Judge) and held.
- Decision: `mode: "metrics_only"` exists only for the Fig. 9 test log; the server always emits `code`.
- Decision: the Hallmark's table twin is the visible legend on the Assay tab (full forms, scores, agreement), and the cartouches are focusable `role="img"` with full-form labels, because a hidden table plus aria-hidden marks would leave keyboard users without the tooltip (and a focusable aria-hidden element is invalid).
- Decision: `lib/assay/assay.ts` is exempt from `no-explicit-any` in ESLint, because it must stay a byte copy of the reference (a parity test enforces it).
- Decision: signs in the ledger are a plain hyphen-minus, because screen readers voice it "minus" and some skip U+2212.
- Decision: the Hallmark is 40px in the report header and the Assay tab (the spec says 28), because the design review found 28px unreadable at sheet scale; 28 and 24 remain for compact uses.
- Decision: the Bench's result block is sticky only when the drawer is at least 736px tall, because a tall sticky block would cover the focused slider on short screens (2.4.11).

Deferred:
- Real P5 fixtures: a live quiet falsehood, and `paper-fig9-metrics` needs raw signals we don't have. The older recorded fixtures also need re-recording so they carry `assay.computed` (they say "no score readout" today). Both need the new backend deployed to the Space (the user pushes `hf-deploy`) and a key.
- The Integrity Map (S10.9) and the Hallmark in the `/runs` list belong to P9; the `integrity_map` value is already in the event.
- `core_pipeline.compute_*` still hold their own copies of the formulas (pinned by the parity test and the runtime equality guard); importing them from `achp.assay` is a later clean-up.
- The legacy view (`app/page.tsx`, `lib/exportReport.ts`) still prints "Composite N%"; it is retired in P9.
- Design P2/P3: the synthetic logs reuse a true health claim under contrary verdicts (labelled synthetic; span offsets prevent swapping the text) · the OG Hallmark has no letters or numbers · chevron vs info icon on text links · the "Ready"/"Unreachable" chip dot sizes.
- The validation plan (11 §5) has not run, so QFI and the quiet-falsehood flag stay "experimental".

## P6 — Scroll story & replay  ✅ 2026-10-01 (engines: Chromium only, see Decisions)
- [x] S7.1 chapters from the log: `lib/runs/chapters.ts` is a pure function from events to seven chapters (`claim · gatekeeper · sources · parts · challenge · framing · verdict`, always all seven), each with its events and a one-sentence caption taken from the log (an agent summary, a skip reason, the claim, the verdict or failure message; never new copy). A gate is the chapter holding the FIRST `claim.marked{contradicts}` and the FIRST `missing_context` (at most two, one per kind; both normally land in Challenge, so a chapter carries up to two gates). Unit-tested on all 14 logs: 6 recorded fixtures and 8 synthetic (partition of events, order, ≤2 gates, first-mark rule, captions traced to the log, a blocked run's skip reasons)
- [x] S7.1 `?replay=1` on `/case/[id]` (same server load, SSR and metadata; a run still in progress falls through to the live board) renders `ReplayStory` (`components/story/`): `.story-step` sections, `.story-friction` gates (220vh desktop, 180vh phone) with a sticky `.stage`, the stage content is the real UI (`ClaimStrip`, `Mark`, `EvidenceCard`, `Stamp`, `InterpretationNote`, `ConfidenceBand`) in a compact variant. Exported as a component for the `/` story in P9 (it takes `events` and a report link)
- [x] S7.2 the gate: a heading ("Fact Challenger disputes part 1"), the struck strip (its mark draws with the scroll, `animation-timeline: --gate`), then the quoted counter-evidence and the agent's own sentence; at most three reveal units; the wheel is never touched; "Skip to verdict" and `End` work; nothing snaps or hides the scrollbar
- [x] S7.2 the rail: seven real links with `aria-current="step"`, "Challenge · 5 of 7" on a phone, always-visible "Skip to verdict" (first in the tab order); a fixed left rail on wide screens and a one-row bottom bar on phones
- [x] The Firefox path: without `animation-timeline` the gate's lines are driven by Motion's `useScroll` (`GateLines`, one tracker per gate), same ranges; normal steps just show their content
- [x] S7.3 reduced motion: a static document (no pin, no reveal, no animation, marks fully drawn, gates at natural height); `@media (max-width: 22.5rem), (max-height: 34rem)` (400% zoom, a short landscape phone) does the same, so nothing overlaps or waits off-screen
- [x] `e2e/replay.spec.ts` (desktop-light, desktop-dark, mobile-reduced): the stage is sticky at 3 scroll positions and the track is exactly 220vh / 180vh; the lines' opacity only rises with the scroll; a forced fallback in the same Chromium (Motion-driven lines rise too and the native ones don't run); a reduced-motion run has no sticky element, no running animation and every mark drawn; a gate is never an empty stage; focus inside a gate shows the line; 320 × 256 has no pin and no sideways scroll; "Skip to verdict"/`End`/rail ticks; no wheel or touch listener calls `preventDefault`, no scroll snap, no hidden scrollbar; all 6 fixtures (7 chapters, the right number of gates, captions equal to the chapter builder's); unique ids; axe at the top, inside a gate and at the verdict
- Reviews: `motion-auditor` 0 P0/P1 (P2: phone-layout coverage and the stage under the phone bar, both fixed; P3: one scroll tracker per gate, the gate no longer repeats the mark it opens on) · `design-critic` 4 P0 and 8 P1 fixed (a stranded gate heading; the framing chapter was only missing from the capture set; the dev query-devtools button was in every screenshot and is hidden in the capture script; dead paper from empty margin columns; a 120px-tall phone rail now 1 row; the verdict chapter shows the struck part; one heading style; quotes capped at 68ch) · `a11y-auditor` 0 P0, 3 P1 fixed (focus not covered by the phone bar: `scroll-padding`; a dead "N sources" button, now a link to the report's Evidence tab; a fixed track clipped content at 400% zoom) plus P2/P3 (focus shows a not-yet-revealed line; ticks ≥ 24px at 320px; quotes never clamped in the story; unique ids; the h1 is h2-sized)

Gate evidence: typecheck ✓ · lint ✓ (0 errors; 14 legacy warnings) · vitest **293** ✓ (chapters on 14 logs: 81) · e2e desktop-light + desktop-dark + mobile-reduced: **159 passed, 18 skipped** (viewport-specific), 0 failed (of which replay.spec: 55 passed, 8 skipped) · screenshots `docs/upgrade/screens/P6/` (curated set committed: exercise-mixed and contradicted-strong at s0/30/45/60/75/85/100, desktop and mobile, light and dark, plus reduced)

Decisions:
- Decision: replay is `?replay=1` on the same route (not a second page), because the page already loads the stored log on the server, and one code path keeps the title, OG image and SSR identical; an unfinished run shows the live board instead.
- Decision: a chapter carries a list of gates (up to two), because both allowed triggers (a contradiction from the Fact Challenger and a missing-context finding from the Narrative Auditor) are in the same Challenge chapter in every recorded run.
- Decision: a gate shows one quote card, because the spec's reveal units are "the quote, the mark, one sentence", and on a phone a taller stage would scroll off before the reader finished it.
- Decision: the gate's strip and heading are visible from the start and only the mark draws, the quote and the sentence reveal; an empty desk with a lone heading (the first build) read as a bug.
- Decision: the story's Challenge step shows the strips without the marks a gate opens on, so a gate is where the mark first draws.
- Decision: Chromium is the only engine verified. WebKit and Firefox are not installed (you chose Playwright's Chromium and the in-app browser instead); the Firefox path is exercised by making `CSS.supports('animation-timeline: view()')` return false before load, which runs the Motion fallback in Chromium. Real Firefox and Safari rendering is unverified.
- Decision: `GateLine` sets Motion values through `style` (one line, `slop-allow`), because Motion's scroll fallback drives opacity and translate through motion values, not CSS.
- Decision: gate marks draw smoothly with the scroll (05 §2.4's own CSS), not stepped at 12fps; the stepped draw is P8.
- Decision: the dev server's CSS compile got stale twice during this phase (it served an older `globals.css`); clearing the ignored `apps/web/.next` and restarting fixed it. If a CSS change seems not to apply in dev, do that before debugging the CSS.

Deferred:
- Real Firefox and Safari checks (see Decisions); `Stamp` plays no animation yet, so the P8 four-frame press must start on arrival at the verdict chapter (a `view()` timeline), not at page load.
- Design P2/P3: the Framing chapter shows the five signal lines as text; highlighter marks on the claim appear only when a recorded run has framing marks (none of the current fixtures do) · one sheet per chapter instead of a card per step (the critic's "ownable" idea) · hand-drawn rail ticks · a 1px border on dark sheets · merge the agent sentence into the strip's sheet.
- The `/` homepage story (P9) reuses `ReplayStory` with the `exercise-mixed` fixture.

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
