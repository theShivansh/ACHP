# 09 — Acceptance, QA & Gates

## 1. Definition of Done (every phase)

A phase is done only when **all** of these hold. Claude records the evidence in `docs/upgrade/PROGRESS.md`:

1. Every acceptance criterion for the phase's stories (03) passes, and a test proves each one where possible.
2. `pnpm -C apps/web typecheck && pnpm -C apps/web lint && pnpm -C apps/web test` are green. For backend phases: `pytest -q apps/api/tests` is green.
3. The anti-slop hook reports **0 new violations** in the files touched.
4. `node scripts/ui/shoot.mjs` produced screenshots at **390×844** and **1440×900**, in light and dark, plus a reduced-motion run. Claude has looked at them and noted anything off.
5. The `design-critic` subagent reviewed those screenshots against 04_DESIGN and returned **no P0/P1 findings** (P2/P3 can be logged for P11).
6. There's a commit per logical change, with the message referencing story IDs (e.g. `feat(case): stamp per strip [S4.1]`).

## 2. Gates by type

| Gate | Tool | Threshold | When |
|---|---|---|---|
| Anti-slop (greppable patterns) | `.claude/hooks/anti-slop-check.mjs` (PostToolUse, new hits only; `--all` for the full scan) | 0 new violations | Every edit |
| Anti-slop (visual) | `design-critic` subagent + `/impeccable critique` | No P0/P1 | End of P3, P4, P6, P9, P11 |
| Impeccable detectors | `npx impeccable detect apps/web` (if the CLI provides it; otherwise `/impeccable audit`) | No new critical findings | P10, P11 |
| Type / lint | `tsc --noEmit`, `eslint` | 0 errors | Stop hook |
| Unit | Vitest (`reducer`, `announcer`, `chapters`, span mapping) | 100% of the reducer branches | P2+ |
| Contract | pytest: event bus, SSE resume, public-note validation | Green | P2 |
| E2E | Playwright with fixture runs (`fixtures/runs/*.jsonl` served by a mock SSE route in test mode only) | Green | P3+ |
| A11y | `@axe-core/playwright` on `/`, the case (live + done), `/method`, `/library` | 0 serious/critical | P10 |
| Perf | Lighthouse CI (mobile) | Budgets in §3 | P10, P11 |
| Stillness | Playwright: `document.getAnimations()` running = 0, 2s after completion | 0 | P8, P10 |
| Honesty | `grep` checks (§5) | 0 matches | P2, P11 |
| Assay parity | `pytest reference/assay` + `apps/api/tests/assay` with `ACHP_REPO` set (the parity test must run, not skip); node test of `assay.ts` against `vectors.json` | Green, 0 skipped parity | P0, P5+ |
| Ledger balance | Assertion on every recorded fixture: \|opening + Σ amounts − closing\| < 1e-9 | 0 failures | P5+ |
| Leverage Lint | `python scripts/leverage_lint.py` (11 §3.10) | Pass | CI, P5+ |
| Metric vocabulary | Rendered-text test: first use of each acronym per view has its full form; BIS says "lower is better" | 0 failures | P5, P9 |
| Silence | Anti-slop `no-audio` rule on `--all` + `find apps/web -name "*.mp3" -o -name "*.wav" -o -name "*.ogg"` | 0 | P7, P11 |

## 3. Performance budgets (mobile, Moto G Power-class, 4G throttling)

| Metric | `/` | `/case/[id]` (completed, SSR) |
|---|---|---|
| LCP | ≤ 2.0s | ≤ 2.2s |
| INP | ≤ 150ms | ≤ 200ms (during a live run) |
| CLS | ≤ 0.03 | ≤ 0.05 (marks are absolutely positioned; strips reserve their height) |
| JS (gzip, route) | ≤ 120KB | ≤ 180KB |
| Fonts | 2 preloaded (Newsreader, Public Sans), `font-display: swap`, Kalam lazy | same |
| Lighthouse Performance | ≥ 90 | ≥ 90 |

Tactics: `next/font`; drop `html2canvas`/`jspdf` (use a print stylesheet + the OG image instead); dynamic-import `TraceTable`, `MethodDrawer` and the replay story; boil filters only while active; `content-visibility: auto` on long trace lists.

## 4. Accessibility checklist (WCAG 2.2 AA)

- [ ] Contrast: every token pair in 04 §3 passes AA. Marks that carry meaning also carry a text label or icon.
- [ ] Keyboard: tab order follows the visual order (header → lanes → sheet → tray). Evidence cards are reachable. The drawers trap focus and return it on close.
- [ ] Visible focus: a 2px `--focus`/`--pencil-blue` outline with 2px offset, never removed.
- [ ] `aria-live="polite"` announcer (≤1 per 2s). The run status also lives in a `role="status"` region.
- [ ] Handwritten notes are `aria-hidden="true"` and duplicated in the sans text available to AT.
- [ ] Stamps have `role="img"` with an `aria-label` ("Verdict: Contradicted").
- [ ] Target size ≥ 24×24 (AA 2.5.8); 44×44 on touch for the primary actions.
- [ ] Reduced motion honored everywhere (05 §6). No information conveyed only by motion.
- [ ] Zoom to 200% and text spacing overrides don't clip the strips or the lanes.
- [ ] `lang="en"`; titles per route; landmarks: `header`, `nav`, `main`, `aside` (lanes, tray).
- [ ] Every chart (Hallmark, Ledger bars, Tipping line, Agreement Dial, Integrity Map, Lineage) has a table twin and keyboard access; no information is carried by color alone (Hallmark shapes, signed amounts, quadrant labels).

## 5. Honesty checks (automated greps)

`scripts/honesty-check.sh` (added in P10; each check fails the build if it finds a match):
```bash
#!/usr/bin/env bash
set -u; fail=0
check() { if rg -n "$1" "${@:2}"; then echo "✗ honesty: $1"; fail=1; fi; }
# No hard-coded model names in UI (server route handlers under app/api may name models they call)
check "DeepSeek|Llama|Qwen|gpt-oss|OpenRouter" apps/web/components apps/web/app --glob '!app/api/**'
# No fabricated log builders
check "buildDetailedLogs|AGENT [0-9]+/11" apps/web --glob '!**/node_modules/**'
# No synthetic progress
check "progressPulse|Math\.min\(target, ?92\)|\bcreep\b" apps/web --glob '!**/node_modules/**'
# No percentage helpers in the Sharer view
check "pct\(|toFixed\(\d\)\s*\+\s*['\"]%" apps/web/components/case
# The mock must be guarded by demo mode
rg -q "DEMO_MODE|searchParams.get\(['\"]demo" apps/web/app/api/analyze/route.ts || { echo "✗ honesty: mock not demo-guarded"; fail=1; }
exit $fail
```
The "no `%` in the Sharer view" rule is enforced by a rendered-text test in P4. A grep can't see computed strings.

## 6. Test matrix (Playwright projects)

| Project | Viewport | Theme | Motion | Browser |
|---|---|---|---|---|
| desktop-light | 1440×900 | light | full | Chromium |
| desktop-dark | 1440×900 | dark | full | Chromium |
| mobile-light | 390×844 | light | full | WebKit (iPhone 15 profile) |
| mobile-reduced | 390×844 | light | reduce | Chromium |
| firefox-fallback | 1280×800 | light | full | Firefox (checks the Motion fallback for the gates) |

Key specs:
- `case.live.spec.ts`: replays `fixtures/runs/exercise-mixed.jsonl`; asserts the lane states step by step, the strips, the marks on the correct spans, the stamps, and the final stillness.
- `case.resume.spec.ts`: kills the SSE mid-run (route abort), asserts the Interrupted banner, then the resume from `Last-Event-ID` with no duplicates.
- `case.failure.spec.ts`: a `run.failed` fixture; asserts that no stamp or verdict text exists.
- `desk.cold.spec.ts`: `/health` delayed 8s; asserts "Waking the desk" and an auto-start after it's ready.
- `replay.spec.ts`: the friction gate pins in Chromium and WebKit, the fallback works in Firefox, reduced motion shows a static document, and "Skip to verdict" works.
- `assay.spec.ts`: the `quiet-falsehood` fixture shows the masking notice and keeps the Judge's FALSE stamp as the headline; `paper-fig9-metrics` shows "Close call: Judge Mostly false · Formula Mixed (0.53)"; `true-but-loaded` shows a split; the Ledger's displayed rows sum to the closing balance; the Hallmark has a table twin.
- `bench.spec.ts`: dragging a slider recomputes within 50ms; the what-if label never disappears; no share/copy control exists inside the Bench; Reset restores the case values.
- `blocked.spec.ts`: a blocked case renders no Hallmark, no metrics and no percentage.
- Visual snapshots: `toHaveScreenshot` for the completed case, with animated regions masked.

## 7. Hallway test script (G2) — 5 people, 10 minutes each

1. "Someone forwarded you this. Check it." (Give them the exercise claim.) Watch and don't help.
2. After it completes: "Which part is wrong, and why?" (Success = they name part 2 and mention the sources.)
3. "How sure is ACHP?" (Success = they reference the band and its reason, not a number.)
4. "Send the result to a friend." (Success = copy summary or share within 20s.)
5. Open the Assay tab: "Why is the overall score what it is?" (Success = they point to the ledger lines, e.g. "the wording pushed it up, the facts pulled it down".)
6. "What was the most confusing moment?" Log verbatim answers in `docs/upgrade/hallway.md`.
