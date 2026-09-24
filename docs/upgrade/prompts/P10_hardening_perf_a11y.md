# P10 — Hardening: accessibility, performance, edge cases

**Effort:** high · **Mode:** plan mode first · **Stories:** S9.1, S9.3 (+ every AC regression) · **Est.:** 1 day
**Read first:** `09_ACCEPTANCE_AND_QA.md` (all) · `05_MOTION_SPEC.md` §6

<goal>
Make the upgrade robust for real people on real phones: accessible, fast, and graceful with messy inputs and failures.
</goal>

<tasks>
1. **A11y audit:** add `apps/web/e2e/a11y.spec.ts` that runs `@axe-core/playwright` on `/`, the case live (mid-fixture), the case done, `/method`, `/library` and the replay, in light and dark. Fix everything serious or critical. Then go through the checklist in 09 §4 item by item and record pass/fail with evidence in PROGRESS.md. Delegate the keyboard and screen-reader walkthrough reasoning to `a11y-auditor`.
2. **Performance:** add Lighthouse CI (`@lhci/cli`) with a config asserting the budgets in 09 §3 against `next start` on `/` and `/case/fixture-exercise-mixed?speed=50` (the completed state). Fix the regressions: dynamic imports (TraceTable, MethodDrawer, ReplayStory, CommandMenu), font preload scope, `content-visibility` on long lists, image sizes for favicons, and removing unused shadcn deps.
3. **Edge cases** (write fixtures or synthetic event logs for each): a 2,000-character claim; 1 atomic claim; 12 atomic claims; 0 evidence; all parts unverifiable; a blocked input; `agent.failed` on one adversary (the run continues); a duplicate or out-of-order event (the reducer rejects and reports it); a gap in seq (repaired); a very long source title or quote; an RTL-language quote inside the English UI (`dir="auto"` on quotes); a 200% zoom; the Windows high-contrast mode (`forced-colors: active` keeps the marks visible via `CanvasText`).
4. **Security & privacy:** no secrets in `NEXT_PUBLIC_*`; external links `rel="noopener noreferrer"`; source favicons are fetched through a privacy-respecting proxy or omitted (log the decision); CSP headers in `vercel.json` (allow the fonts, the favicon host and the API origin); the upload size and type limits mirrored in the UI.
5. **Design hardening:** `/impeccable audit` and `/impeccable harden` on `/` and the case page; fix the P0/P1 findings. Burn the anti-slop baseline from P0 down to **zero** across `apps/web`.
6. **Run the full Playwright matrix** (all 5 projects) and fix the flakes (never add arbitrary sleeps; wait for events or DOM states).
7. **Honesty greps** (09 §5) wired into CI as a script `scripts/honesty-check.sh`.
</tasks>

<verification>
- CI config runs: typecheck, lint, unit, e2e (5 projects), Lighthouse CI, the honesty check, and the anti-slop full scan. Everything is green locally.
- PROGRESS.md contains the a11y checklist evidence and the Lighthouse numbers before and after.
</verification>

<done_when>
Every gate in 09 §2 is green, the anti-slop count is 0, and the edge-case fixtures render correctly.
</done_when>
