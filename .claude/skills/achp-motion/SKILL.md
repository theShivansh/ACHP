---
name: achp-motion
description: Procedure for adding or changing any animation, transition or scroll effect in ACHP — choose the motion language (scroll story, utility micro-interaction, stop-motion), apply the tokens, and implement the reduced-motion and stillness rules. ACHP is silent (no audio). Use before writing any keyframes, transitions, Motion code, ViewTransition or scroll-driven CSS.
---

# ACHP motion — decide, implement, verify

Full spec: `docs/upgrade/05_MOTION_SPEC.md`.

## 1. Justify it (write the answer in your head, then keep only what passes)
Which job does it do? **State change**, **cause→effect**, or **attention on what matters**. If none, don't add it.

## 2. Pick the language by territory
| If it's… | Language | Engine | Tokens |
|---|---|---|---|
| Part of a replay, the `/` story or `/method` | **A: scroll story** | CSS `animation-timeline: view()` inside `@supports`; Motion `useScroll` fallback for the gates only | Scroll ranges (`entry`, `cover`, `contain`) |
| App chrome feedback (tabs, tooltips, copy, drawers, morphs, Assay linking and the Bench) | **B: utility** | CSS transitions, React `<ViewTransition>`, `motion/react` for springs and layout | `--dur-instant/quick/base/deliberate`, `--ease-out/in-out/exit` |
| A mark, glyph, stamp, Hallmark punch, Two-Key key, scissors, paperclip, highlighter, tally or the lamp | **C: stop-motion** | CSS `steps()`, `stroke-dashoffset`, the stepped `filter: url(#boil-n)` swap | `--fps-stop` (83ms), `--boil-period` |

Never mix smooth easing into a stepped (C) element. Never put stop-motion on text, data or layout.

## 3. Implementation rules
- Animate only `transform`, `opacity`, `clip-path`, `stroke-dashoffset`, and the stepped filter on small elements.
- Exits are ~30% shorter than entrances; hover-out is instant.
- No infinite animation except `.boil` on a *working* lane glyph (max 3 at once) and the cold-start lamp while waking.
- No timer may change run state. Motion reacts to reducer state; it never drives it.
- Friction gates (A): ≤2 per story; a 220vh track with a sticky stage; never `preventDefault` on wheel/touch; "Skip to verdict" is always available.
- **No audio, ever.** Confirmations are visible (icon morph, label, stamp, notice) and announced via `aria-live`.

## 4. Reduced motion & low-end
- `@media (prefers-reduced-motion: reduce)`: final states instantly, no pins, no boil, marks fully drawn, view transitions none or ≤120ms crossfade. Reset `animation` (which also resets `animation-timeline`).
- `html[data-lowfx]` (hardwareConcurrency ≤ 4 or saveData): no boil.

## 5. Verify
- The stillness e2e: 2s after completion, `document.getAnimations()` has nothing running.
- The reduced-motion Playwright project passes.
- Ask the `motion-auditor` subagent for an inventory diff if you added more than two animations.

## 6. Numbers never animate past the truth
Bench recomputes, ledger totals and the Tipping dot update on the next animation frame with **no easing on the values themselves**. A number that tweens from 0.72 to 0.44 briefly shows values that were never computed; move marks, not truths.
