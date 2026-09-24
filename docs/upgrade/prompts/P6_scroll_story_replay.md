# P6 — Scroll-story replay with intentional friction

**Effort:** medium · **Mode:** plan mode first · **Stories:** S7.1–S7.3 · **Est.:** 1 day
**Read first:** `05_MOTION_SPEC.md` §2 (all) and §6 · `07_IA_AND_SCREENS.md` §2 (the story) · the prototype's "Replay" section

<goal>
Any case can be replayed as a scroll-driven story, paced by the reader, which slows down at exactly the two moments that matter (the first contradiction and the first missing context) without ever hijacking the scroll.
</goal>

<tasks>
1. `lib/runs/chapters.ts`: a pure function from events → chapters: `claim`, `gatekeeper`, `sources`, `parts`, `challenge`, `framing`, `verdict`. Each chapter lists its events and a one-sentence caption built from public notes and summaries. Mark `gate: true` on the chapter holding the **first** `claim.marked{relation:contradicts}` and on the one holding the first `missing_context` (at most 2). Unit-test it on all 6 fixtures.
2. `app/(desk)/case/[id]/replay/…` (or `?replay=1` on the same page, whichever keeps SSR simpler; log the decision): `ReplayStory` renders the chapters as `.story-step` sections, with gate chapters as `.story-friction` (220vh desktop, 180vh mobile) and a sticky `.stage` whose lines reveal across the `contain` range (the CSS in 05 §2.4).
3. **The stage content is the real UI**, reused: the same `ClaimStrip`, `Mark`, `EvidenceCard` and `Stamp` components in a "story" size variant. The marks draw as the reader scrolls (`animation-timeline: --gate`).
4. **The rail:** a fixed left rail (a bottom progress bar on mobile) with 7 ticks, the current one filled (an IntersectionObserver or scroll-timeline), keyboard-focusable links to each chapter, and an always-visible **"Skip to verdict"** button. The `End` key works natively.
5. **Firefox fallback:** when `!CSS.supports('animation-timeline: view()')`, render the gate lines with `GateLine` (05 §2.4, `motion/react` `useScroll`). Normal steps simply show their content (no reveal) in the fallback.
6. **Reduced motion:** a static document: no pin, no reveal, marks fully drawn, gates at normal height.
7. **The `/` homepage story** will reuse `ReplayStory` with a stored real case (fixture `exercise-mixed`) in P9. Export it as a component now.
8. **Tests:** `e2e/replay.spec.ts`: in Chromium and WebKit the stage is sticky within the gate (bounding box stable over 3 scroll positions) and the lines' opacity increases with scroll; in Firefox the fallback reveals; with reduced motion there's no sticky element and everything is visible; "Skip to verdict" scrolls the verdict chapter into view; no `wheel` listener calls `preventDefault` (assert via `page.evaluate` instrumentation of `addEventListener`).
</tasks>

<constraints>
- Forbidden: `preventDefault` on wheel/touch, `scroll-snap-type: … mandatory`, custom smooth-scroll libraries (Lenis etc.), hidden scrollbars.
- At most 2 gates per story, and only for the two allowed triggers.
- Captions come from event data. Don't write new marketing copy into the story.
</constraints>

<verification>
- Tests green in all the Playwright projects.
- Screenshots: `shoot.mjs --phase P6 --routes "/case/fixture-exercise-mixed?replay=1" --scroll 0,0.3,0.45,0.6,1` (fractions of the page height).
- Delegate to `motion-auditor`: "Audit the replay story against 05 §2 and §6."
</verification>

<done_when>
The replay works for all 6 fixtures; the gates behave as specified; the fallbacks are verified; PROGRESS.md is updated.
</done_when>
