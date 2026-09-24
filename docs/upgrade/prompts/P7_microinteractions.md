# P7 — Utility micro-interactions and view transitions (silent)

**Effort:** medium · **Mode:** plan mode first · **Stories:** S2.4, S5.2 (refine), S9.2 · **Est.:** 0.5 day
**Read first:** `05_MOTION_SPEC.md` §1, §4 (all, incl. §4.1 Silence and §4.2 Assay), §6 · `08_REFERENCES.md` §2 (transitions.dev mapping)

<goal>
Add the small, quiet interactions that make ACHP feel precise, and nothing that exists only to look busy. ACHP makes no sound: every confirmation is visible and announced.
</goal>

<tasks>
1. **Desk → Case morph:** wrap the claim text in `<ViewTransition name="claim-text" share="morph" default="none">` on both `/` (the input preview line) and the case header. Navigate after `POST /runs` with `startTransition(() => { addTransitionType('to-case'); router.push(caseUrl) })`, or `router.push(url, { transitionTypes: ['to-case'] })` if your Next version supports it (≥16.2; check with `grep -r transitionTypes node_modules/next/dist | head -1`). CSS for `::view-transition-group(.morph)` at `--dur-deliberate`, `--ease-in-out`. Reduced motion: `default="none"` with no share animation.
2. **Tabs sliding indicator** (Report · Evidence · Assay · Trace), **tooltip timing** (a 400ms appear delay, instant exit), **copy → check icon morph** (1.6s), **input error shake** (3 cycles, 4px, 240ms), **number roll** for counts only (sources, durations), never for metric values, C or ledger amounts (those update instantly; achp-motion §6). Use the transitions.dev skill recipes (`transitions apply <name>`) where one matches, then restyle them to our tokens. Remove any shimmer they include.
3. **Evidence↔span linking polish:** underline draw in `--dur-quick`; dimming the others to 60% (opacity only); instant out. Same for `:focus-visible`.
4. **Lane transitions:** the action line crossfades on each new `agent.action`; working → done crossfades into the summary; the duration settles with a number roll.
5. **Visible confirmations, no audio:** every confirmation (submit accepted, copy, share, run failed, verdict landed) gets a visible state change (icon morph and label, stamp, notice) and one `aria-live` sentence. Confirm there's no audio anywhere: `node .claude/hooks/anti-slop-check.mjs --all --summary` shows 0 `no-audio` hits, and no `.mp3/.wav/.ogg` files exist under `apps/web`.
5b. **Assay micro-interactions** (05 §4.2): Hallmark mark ↔ Ledger row linking, Ledger row ↔ Lineage node highlight, the Bench recompute on `requestAnimationFrame` with no easing on numbers, the Tipping dot move, and the Two-Key key turn when the Bench pushes the formula away from the Judge.
6. **Motion token hygiene:** run `transitions refine` (the transitions.dev skill), and replace every hardcoded duration or easing in `apps/web` with the tokens. Log the exceptions under Decisions.
7. **Tests:** e2e: the copy morph and "Copied" label appear and the live region announces it; the shake happens on a short input; the tab indicator moves with the arrow keys; hovering a Hallmark mark underlines its Ledger rows (and the same on focus).
</tasks>

<constraints>
- Banned: hover lift or scale on cards, magnetic buttons, cursor effects, parallax, and **any audio** (no UI sounds, no sound toggle).
- Every hover effect has a `:focus-visible` twin.
</constraints>

<verification>
- Tests green; `shoot.mjs --phase P7` on `/` and a completed fixture case (hover states captured via `--hover` selectors if you add that flag).
- Delegate to `motion-auditor`: "List every animation in apps/web; for each, name its job (state/causality/attention) or flag it for removal."
</verification>

<done_when>
The motion-auditor has no unexplained animations; the `no-audio` rule is clean; every confirmation is visible and announced; PROGRESS.md is updated.
</done_when>
