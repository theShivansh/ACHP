# P3 — The live investigation board (`/case/[id]`)

**Effort:** high · **Mode:** plan mode first · **Stories:** S3.1–S3.7, S9.1 · **Est.:** 2 days
**Read first:** `04_DESIGN.md` §1, §2, §5–7 · `06_AGENT_STATE_SPEC.md` §4 and §7 · `07_IA_AND_SCREENS.md` §3, §4, §6 · the prototype `docs/upgrade/achp-site.html#/case` (open it and study the lane, strip and tray behavior; `#/case/quiet` shows the finished state)

<goal>
Build the page where the agents visibly do the work: seven lanes that change state only on real events, a paper sheet where the claim is cut into strips and marked, and an evidence tray that fills as sources are pinned. It works from fixtures and from the live backend.
</goal>

<tasks>
1. **Route & data:** `app/(desk)/case/[id]/page.tsx` server component: fetch the snapshot (`GET /runs/{id}`); render the client `CaseLive` with the snapshot as initial state; subscribe via `useRunEvents` if the run isn't terminal. Test mode: `id` starting with `fixture-` streams `fixtures/runs/<name>.jsonl` from a dev-only route handler (`app/api/dev/fixture/[name]/route.ts`, disabled when `NODE_ENV=production`), at real recorded timing (`t_ms`), with `?speed=4` supported. Expose `data-run-status="<state>"` on the case root element; `shoot.mjs --at done` and the e2e tests wait on `[data-run-status="completed"]`.
2. **Layout:** 3 regions ≥1280px (Lanes 280 · Sheet ≤760 · Tray 340), tablet rail + tray as a right Sheet, mobile lane strip + evidence as a bottom Sheet (07 §3–4). Landmarks: `aside[aria-label="Agents"]`, `main`, `aside[aria-label="Evidence"]`.
3. **AgentLane** (`components/case/AgentLane.tsx`): the states and visuals from 06 §4.1; the glyph from `agents.config`; the action line (the latest `agent.action`); the public note as Kalam `aria-hidden` + an sr-only sans duplicate; an elapsed time derived from event `t_ms` (a display clock only while `working`). Parallel-group bracket "In parallel" (S3.3).
4. **LaneStrip** (mobile): 7 state dots (shape + color, so it isn't color-only) + the current action; tapping opens the lanes in a bottom Sheet.
5. **CaseSheet + ClaimStrip:** the claim header (Newsreader `--t-claim`) with `<ViewTransition name="claim-text">` ready for P7; strips from `claim.extracted`, ordered by `source_span`; each strip reserves its height (no CLS when marks or stamps arrive); a margin column of 120px (inline on mobile).
6. **Span marks v1:** `lib/marks/measure.ts` turns `[start,end]` into rects with a DOM `Range` inside the strip's text node (handle wrapping across lines: one rect per line). `components/case/Mark.tsx` renders an absolutely positioned SVG per rect with a smooth `stroke-dashoffset` draw (240ms). P8 converts it to stepped + boil. A ResizeObserver re-measures. Relation → ink/mark kind from 04 §3.3.
7. **EvidenceTray v1:** a card per `evidence.found` (domain, title, date, quote, relation label); new cards enter with `--dur-base`; a count in the tray header rolls (plain for now).
8. **Run states:** waking (derived from `/health`), queued, interrupted banner (watchdog), failed card (keep the partial evidence visible, **no verdict**), blocked notice (07 §6).
9. **Live region:** a polite `aria-live` announcer (from P2) + a `role="status"` run status line.
10. **Tests:** `e2e/case.live.spec.ts` (the exercise-mixed fixture at speed 4: lane transitions happen in event order, strips appear, marks sit over the right characters by comparing mark rect x-ranges with the `Range` rects, the tray counts match), `case.resume.spec.ts`, `case.failure.spec.ts`, and unit tests for `measure.ts`.
</tasks>

<constraints>
- 04 §2 bans apply. Specifically: no shimmer skeletons (a strip waiting for text shows nothing, not a gray bar), no spinner, no % anywhere, no glow on active lanes (activity = the boiling glyph + the action text).
- No client timer may change run state. A display clock for elapsed seconds is fine.
- Keep the components presentational; all state comes from reducer selectors.
</constraints>

<verification>
- `pnpm -C apps/web test && pnpm -C apps/web test:e2e --project=desktop-light --project=mobile-light` green.
- `node scripts/ui/shoot.mjs --phase P3 --routes "/case/fixture-exercise-mixed?speed=4" --at 2000,6000,12000,done` (mid-run and done captures at 390 and 1440, light and dark). Look at them yourself first.
- Delegate to `design-critic` (the case page captures) and to `a11y-auditor` (the live region, landmarks, keyboard path through the lanes and tray).
- Compare against the prototype screenshots from P0 and note the intentional differences in PROGRESS.md.
</verification>

<done_when>
The fixture and the live backend both render a complete live investigation with no fabricated state; the e2e and a11y checks pass; the critic has no P0/P1; PROGRESS.md is updated.
</done_when>
