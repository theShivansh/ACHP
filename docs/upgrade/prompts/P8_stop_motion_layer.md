# P8 — The stop-motion, hand-drawn layer

**Effort:** medium · **Mode:** plan mode first · **Stories:** S9.4 (+ the visual refinement of S3.4/S3.5/S4.1) · **Est.:** 1 day
**Read first:** `05_MOTION_SPEC.md` §3 (all), §5, §6 · `04_DESIGN.md` §6, §8 · the prototype's marks, stamp, Hallmark punch and boil implementation (`docs/upgrade/achp-site.html`, search for `.boil`, `@keyframes stamp`, `@keyframes punch`, `drawMarks`, `hallmarkHTML`)

<goal>
Give ACHP its handmade signature (pencil marks, scissors, paperclips, highlighter, stamps, boiling glyphs) at 12fps, while keeping every piece of information crisp and the page completely still at rest.
</goal>

<tasks>
1. **Glyphs:** replace the placeholder glyphs with hand-drawn SVG React components (`components/glyphs/*`): wax seal, paperclip, scissors, red pencil, blue pencil, highlighter, stamp, loupe, crop corners. Draw them as single-stroke paths with a slight wobble baked in (vary the control points by ±0.6px), a 1.75px stroke, round caps, `currentColor`, a 24px viewBox, and a `title` for a11y where they aren't decorative.
2. **Marks → stepped:** convert `Mark.tsx` to `steps()` drawing at `--fps-stop` with the per-kind frame counts (05 §3.1). Add a hand-drawn variance per mark: a deterministic jitter seeded by `claim_id+span`, so reloads look identical. Each fresh mark gets `boil-once`.
3. **Boil on active lanes:** the glyph of an agent in `working` gets `.boil`; it's removed on any other state. Enforce the budget: max 3 boiling elements (if more lanes are working, only the 3 most recent boil). Low-end gating: add a `data-lowfx` attribute on `<html>` when `hardwareConcurrency ≤ 4` or `saveData` is set, and the CSS disables boil under it.
4. **Stamp animation:** the 4-frame keyframes from 05 §3.3 on the per-strip stamps and the overall stamp (1.4× size). Then the **Hallmark punches** (one cartouche per 83ms frame; outline, then the fill steps in over 2 frames) and the **Two-Key keys** turn (2 frames each), per 05 §3.4.
5. **Scissors cut:** on the first `claim.extracted`, a 3-frame cut across the claim (a dashed line draws, the pieces separate 6px, settle), then the strips enter (the existing smooth enter).
6. **Paperclip snap** (2 frames) on each evidence card enter; **highlighter swipe** (5 stepped `clip-path: inset()` frames, multiply blend) for `signal.computed.spans`; **tally marks** for the NIL sub-checks (one stroke per `agent.done` of a sub-check, 3 frames).
7. **Cold-start lamp:** a small lamp glyph in the status chip and the case header while `waking`: irregular stepped opacity (e.g. 1, .82, 1, .9, 1, .7, 1 over 1.2s), infinite *only* while waking; reduced motion shows it static.
8. **True stillness:** after `run.completed` + 2s, no running animations. Add `e2e/stillness.spec.ts` using `document.getAnimations()`. Also verify that the boil `filter` isn't applied to any element at rest.
9. **Reduced motion:** every piece above renders in its final state instantly. Add `e2e/reduced.spec.ts` covering the case page and the replay.
</tasks>

<constraints>
- Hand-drawn = the marks and glyphs only. Text, data, layout lines and UI icons stay crisp.
- Animate only `stroke-dashoffset`, `transform`, `opacity`, `clip-path`, and the stepped `filter` swap on small elements.
- Frame rate: 12fps (stepped) for the handmade elements; never mix smooth easing into a stepped element.
</constraints>

<verification>
- `pnpm -C apps/web test:e2e --project=desktop-light --project=mobile-reduced` green.
- Record a short Playwright video of the fixture at speed 1 (`shoot.mjs --video`) and watch it: does it feel handmade but calm? Note the frames where it feels busy.
- Performance: in Chromium DevTools protocol metrics (or the `PerformanceObserver` long-task count), long tasks >50ms during the live run should be ≤2 on the `mobile-light` project with 4× CPU throttling.
- Delegate to `motion-auditor` and `design-critic`.
</verification>

<done_when>
The signature feels handmade, stays within budget, and is still at rest; the reduced-motion and low-end paths are verified; PROGRESS.md is updated.
</done_when>
