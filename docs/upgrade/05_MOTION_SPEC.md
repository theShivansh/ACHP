# 05 — Motion Spec: three motion languages, one rule

> **The rule:** every animation must do at least one of these jobs: **explain a state change**, **show cause and effect**, or **hold attention on something that matters**. If it does none of them, cut it.

ACHP uses three motion languages. Each one has a territory, and they don't trespass on each other's.

| Language | Territory | Feel | Engine |
|---|---|---|---|
| **A. Scroll story + intentional friction** | `/` "How a check works", `/case/[id]?replay=1`, `/method` | Editorial, paced by the reader | CSS scroll-driven animations (`view()` timelines); Motion `useScroll` fallback |
| **B. Utility micro-interactions** | Everywhere in the app chrome | Quiet, fast, almost invisible, and **silent** | CSS transitions, React `<ViewTransition>` |
| **C. Stop-motion / hand-drawn** | Agent glyphs, marks on the sheet, the stamps, the Assay Hallmark punches, the cold-start lamp | Handmade, 12fps, organic | CSS `steps()`, SVG stroke drawing, SVG `feTurbulence` line boil |

---

## 1. Motion tokens

Put these in `@theme` as CSS variables and mirror them in `lib/motion.ts` for Motion.

```css
@theme {
  --dur-instant: 90ms;    /* press states, checkbox */
  --dur-quick: 160ms;     /* hover cues, icon swaps, tooltips out */
  --dur-base: 240ms;      /* panels, tabs, drawers */
  --dur-deliberate: 360ms;/* view transitions, sheet enter */
  --dur-narrative: 600ms; /* scroll-story reveals (scroll-linked, so it's a range, not a time) */

  --ease-out: cubic-bezier(.2,.7,.2,1);     /* entering */
  --ease-in-out: cubic-bezier(.6,0,.3,1);   /* moving */
  --ease-exit: cubic-bezier(.4,0,1,1);      /* leaving: faster than entering */

  --fps-stop: 83ms;       /* one frame at 12fps */
  --boil-period: 400ms;   /* 4 seeds × 100ms = 10Hz boil */
}
```

Rules: exits are about 30% shorter than entrances. No bounce or elastic easing. Nothing loops forever except the cold-start lamp (and only while cold). Hover-out is instant or `--dur-quick`, never slower than hover-in.

---

## 2. Language A — Scroll-driven storytelling with intentional friction

### 2.1 Where it lives
1. **`/` below the fold: "How a check works."** A real, stored case (not a mock) is replayed as a story in 7 steps: the claim → the Gatekeeper → the claim cut into strips → sources pinned → the red and blue pencils → the framing lens → the stamps.
2. **`/case/[id]?replay=1`**: any case becomes a scroll story built from its own event log.
3. **`/method`**: the five metrics (full forms first), then the Signal Lineage, the Agreement Dial and the Assay Bench, step by step, next to a sample strip. No friction gates here.

### 2.2 Structure

```
<article class="story">
  <aside class="story-rail">      ← progress rail: 7 ticks, the current one filled; "Skip to verdict" button
  <section class="story-step">    ← normal step: ~100vh, content reveals on entry
  <section class="story-friction">← friction step: 220vh track with a sticky stage (the "reading gate")
```

### 2.3 Intentional friction: the reading gate

Friction is **a longer scroll track, never a hijacked wheel.** The stage pins (`position: sticky`) while its container is 2.2× the viewport tall. The reader scrolls at their normal speed while the content advances more slowly, line by line, so they actually read the one thing that matters.

| Rule | Value |
|---|---|
| Max friction points per story | **2** |
| Allowed triggers | ① the **first contradiction** (red pencil on a strip + the quoted counter-evidence) · ② the **first missing-context** finding |
| Track length | 220vh (desktop) · 180vh (mobile) |
| Content per gate | ≤ 3 reveal units (the quote, the mark, one sentence of interpretation) |
| Escape hatch | "Skip to verdict" is always visible in the rail; the `End` key works; anchor links jump past gates |
| Forbidden | `wheel`/`touchmove` `preventDefault`, `scroll-snap-type: mandatory`, scroll-speed hacks, hidden scrollbars |

### 2.4 Implementation

```css
/* Normal step: reveal on entry */
.story-step { view-timeline: --step block; }
.story-step .reveal { opacity: 1; }
@supports (animation-timeline: view()) {
  .story-step .reveal {
    animation: reveal-up linear both;
    animation-timeline: --step;
    animation-range: entry 10% cover 35%;
  }
}
@keyframes reveal-up { from { opacity: 0; translate: 0 16px; } to { opacity: 1; translate: 0 0; } }

/* Friction step: the reading gate */
.story-friction { height: 220vh; view-timeline: --gate block; }
.story-friction > .stage { position: sticky; top: 10vh; min-height: 80vh; }
@supports (animation-timeline: view()) {
  .story-friction .line { animation: reveal-up linear both; animation-timeline: --gate; }
  .story-friction .line:nth-child(1) { animation-range: contain 0%  contain 25%; }
  .story-friction .line:nth-child(2) { animation-range: contain 25% contain 50%; }
  .story-friction .line:nth-child(3) { animation-range: contain 50% contain 75%; }
  .story-friction .mark path { animation: draw linear both; animation-timeline: --gate;
                               animation-range: contain 10% contain 45%; }
}
@media (prefers-reduced-motion: reduce) {
  .story-friction { height: auto; }
  .story-friction > .stage { position: static; }
  .story-step .reveal, .story-friction .line, .story-friction .mark path {
    animation: none; opacity: 1; translate: none; stroke-dashoffset: 0;
  }
}
```

**Browser support (checked Sep 2026):** Chrome/Edge 115+ and Safari 26+ support scroll-driven animations. Firefox still ships them only behind a flag, so a stock Firefox falls through the `@supports` guard. For the friction gate only, add the Motion fallback:

```tsx
'use client'
import { useScroll, useTransform, motion } from 'motion/react'
export function GateLine({ i, n, containerRef, children }) {
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start start', 'end end'] })
  const opacity = useTransform(scrollYProgress, [i / n, (i + 1) / n], [0, 1])
  return <motion.p style={{ opacity }}>{children}</motion.p>
}
// Render GateLine only when !CSS.supports('animation-timeline: view()')
```

---

## 3. Language C — Stop-motion & hand-drawn

**Why:** it tells the reader *a person-like process* is checking the claim, and it separates marks (judgment) from text (content). Everything handmade runs at **12fps with `steps()`**. Everything informational stays smooth and crisp.

### 3.1 Marks (red pencil, blue pencil, brackets, ticks)

```css
.mark path {
  stroke-dasharray: var(--len); stroke-dashoffset: var(--len);
  animation: draw calc(var(--frames, 6) * var(--fps-stop)) steps(var(--frames, 6)) forwards;
}
@keyframes draw { to { stroke-dashoffset: 0; } }
```
- Compute `--len` from `path.getTotalLength()` once on mount.
- Frame counts: underline 6 · strike 5 · bracket 7 · tick 4 · caret 4 · circle 9.
- Marks are positioned against **text span ranges** from the event payload (`span: [start, end]`), measured with `Range.getClientRects()` and re-measured on resize (ResizeObserver).
- Each mark ends with a 1.2s **boil** (3.2), then goes perfectly still.

### 3.2 Line boil (the "alive" wobble)

Pure CSS plus 4 static SVG filters. There's no JS timer, and the filter is **removed at rest**, which keeps the page truly still and saves the GPU.

```tsx
// app/_components/BoilDefs.tsx: render once in the root layout
export function BoilDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
      {[11, 23, 37, 51].map((seed, i) => (
        <filter id={`boil-${i}`} key={seed} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed={seed} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      ))}
    </svg>
  )
}
```
```css
@keyframes boil {
  0% { filter: url(#boil-0); } 25% { filter: url(#boil-1); }
  50% { filter: url(#boil-2); } 75% { filter: url(#boil-3); } 100% { filter: url(#boil-0); }
}
.boil { animation: boil var(--boil-period) steps(1, end) infinite; }
.boil-once { animation: boil var(--boil-period) steps(1, end) 3; } /* 1.2s after a mark lands */
@media (prefers-reduced-motion: reduce) { .boil, .boil-once { animation: none; filter: none; } }
```
- Where it's allowed: **the active agent's glyph** (while `working`) and **freshly drawn marks** (`boil-once`). Nothing else.
- Budget: ≤3 boiling elements at once, each ≤ 64×64px except marks (thin strokes). Turn it off entirely when `navigator.hardwareConcurrency <= 4` or `navigator.connection?.saveData` is set.

### 3.3 The verdict stamp (4 frames, 333ms)

```css
@keyframes stamp {
  0%   { opacity: 0;   transform: translateY(-20px) scale(1.14) rotate(var(--rot)); }
  25%  { opacity: .4;  transform: translateY(-6px)  scale(1.06) rotate(var(--rot)); }
  50%  { opacity: 1;   transform: translateY(0)     scale(.96)  rotate(var(--rot)); }
  75%  { opacity: .94; transform: translateY(0)     scale(1.01) rotate(var(--rot)); }
  100% { opacity: .9;  transform: translateY(0)     scale(1)    rotate(var(--rot)); }
}
.stamp { animation: stamp calc(4 * var(--fps-stop)) steps(1, end) both; }
```
- `--rot` is between −3° and +3°, seeded from a hash of `claim_id`, so it's stable across reloads.
- The ink texture comes from an SVG mask with `feTurbulence` threshold (static, not animated).
- Per-strip stamps and the overall stamp land the same way; the overall one is 1.4× the size. The **Two-Key** keys turn in 2 stepped frames right after the overall stamp (§3.4).

### 3.4 Other stop-motion moments

| Moment | Event trigger | Frames | Notes |
|---|---|---|---|
| Scissors cut the claim into strips | `claim.extracted` (the first one) | 3 frames: the cut line appears → the strips separate 6px → settle | Then each following strip slides in (Language B, `--dur-base`) |
| Paperclip snaps onto an evidence card | `evidence.found` | 2 frames: open clip → closed | The card itself enters smoothly |
| Highlighter swipe | `signal.computed` with `spans` | 5 frames, left→right `clip-path: inset()` stepped | Multiply blend |
| Tally marks (NIL sub-checks) | each NIL sub-check `agent.done` | 1 stroke per check, 3 frames each | 5 checks = a tally gate |
| Hallmark punch | `assay.computed` | 5 cartouches, 1 frame each: outline appears → fill level steps in over 2 frames | Reduced motion: the Hallmark renders complete |
| Two-Key keys | `assay.computed` | 2 frames per key: upright → turned (agree) or stays upright (split) | The state is also written in words |
| **Cold-start lamp** | `backend.status = waking` | Irregular opacity steps, 1.2s loop | The only infinite loop. It stops on `ready`. Reduced motion: a static lamp + "Waking the desk · 14s" |

---

## 4. Language B — Utility micro-interactions (only when useful)

| Interaction | Trigger | Feedback | Duration | Why it exists |
|---|---|---|---|---|
| **Desk → Case morph** | Submit | `<ViewTransition name="claim-text" share="morph">`: the typed claim flies into the sheet header | `--dur-deliberate` | Continuity: "your claim is now the case" |
| Case tabs (Report · Evidence · Assay · Trace) | Click / arrow keys | Sliding underline (transitions.dev *Tabs sliding*) | `--dur-base` | Shows where you are |
| **Evidence ↔ span linking** | Hover or focus on an evidence card or a strip span | The matching span gets a 2px underline in the relation color; the others dim to 60% | in `--dur-quick`, out instant | Makes the evidence→claim mapping visible (ACHP X FR-002) |
| Tooltip (term definitions) | Hover ≥400ms / focus | Appear-only delay, instant exit (transitions.dev *Tooltip*) | 160ms in | Explains jargon without clutter |
| Copy summary / link | Click | Icon morphs copy→check and the label reads "Copied", then back after 1.6s; `aria-live` announces it | `--dur-quick` | Confirms an action that has no visible result |
| Invalid input (too short) | Submit | 3-cycle horizontal shake of 4px, then the helper text (transitions.dev *Error state shake*) | 240ms | Points at the problem |
| Screenshot drop | Drag over | The dropzone morphs toward the file shape (transitions.dev *Drag & drop with physics*) | `--dur-base` | Confirms the drop target |
| Agent lane: working → done | `agent.done` | The action line crossfades into the result summary; the duration counter stops and settles | `--dur-base` | Closure per agent |
| Numbers (sources found, durations) | Value change | Digit roll (transitions.dev *Number pop-in*) | `--dur-quick` | Draws attention to what changed |
| Drawer / bottom sheet | Open | Slide + fade; the scrim fades at 60% of the duration | `--dur-base` in, exits 30% faster | Spatial continuity |

**Not allowed:** hover lift or scale on cards, magnetic buttons, cursor trails, displacement hovers, parallax on the product surfaces.

### 4.1 Silence is a feature

ACHP makes **no sound**: no UI sounds, no ambient audio, no sound toggle. Every confirmation is carried by a visible state change (icon morph, label change, stamp, notice) plus an `aria-live` announcement, so it works on a muted phone, in a meeting, and with a screen reader. The anti-slop hook blocks audio APIs and audio files (`no-audio` rule).

### 4.2 Assay micro-interactions (utility only)

| Interaction | Trigger | Feedback | Duration | Why it exists |
|---|---|---|---|---|
| Hallmark mark focus | Hover or focus on a cartouche | Tooltip: full form + value + "lower is better" for BIS; the matching Ledger rows underline | `--dur-quick` in, instant out | Connects a score to what produced it |
| Ledger row focus | Hover or focus on a Ledger row | The signal's node lights up in the Lineage mini-map; its margin bar gains a 1px ink outline | `--dur-quick` | Shows where a signal flows |
| Bench slider drag | `input` | The Hallmark fills, C, verdict and the Ledger re-balance on the next animation frame (no easing: numbers must never "animate past" their true value) | 1 frame | Cause → effect, instantly |
| Tipping Point number line | Case load / Bench change | The C dot moves to its value; the leader to the nearest boundary draws on | `--dur-base` | Shows distance to a flip |
| Two-Key state change | Bench pushes the formula verdict away from the Judge's | The second key turns back (2 stepped frames) | `2 × --fps-stop` | Makes disagreement tangible |

---

## 5. Choreography of a live run (event → motion)

| t (warm) | Event | Desk (lanes) | Sheet |
|---|---|---|---|
| 0ms | submit | — | The claim morphs into the header (B) |
| ~150ms | `run.started` | 7 lanes appear queued (a stagger of 40ms each) | The Gatekeeper's bracket seal is drawn around the claim (C) |
| ~0.4s | `agent.started: security_validator` → `done` | Glyph boils → settles, "Safe to check" | The seal is stamped closed |
| ~0.5s | `agent.started: retriever` | Action line: "Searching the web: 'exercise cardiovascular risk'" | — |
| 1–4s | `evidence.found` ×N | Counter rolls: "4 sources" | Cards slide into the tray; a paperclip snaps on each (C) |
| 4–7s | `claim.extracted` ×k | Decomposer: "Cut into 3 checkable parts" | Scissors cut (C), then the strips slide in (B) |
| 7–15s | `agent.started` ×3 (parallel group) | 3 lanes working at once, grouped with a bracket labelled "in parallel" | — |
| 8–16s | `claim.marked` | Fact Challenger: "2 sources disagree with '30–40%'" | A red pencil strikes the span (C) |
| 8–16s | `signal.computed` | Framing Lens: tally +1 per sub-check | Highlighter swipes over loaded words (C) |
| 16–20s | `verdict.drafted` → `verdict.final` | Judge working → done | Per-strip stamps (C), then the overall stamp |
| +150ms | `assay.computed` | — | The Hallmark punches in, one cartouche per 83ms frame (C); the Two-Key keys turn (C); a masking notice, if any, slides in above the Ledger link (B) |
| +300ms | `run.completed` | Lanes collapse to a summary row | The share bar slides up (B); the page is now the permanent report |

When motion is reduced, every event still updates the content instantly. Only the *how* changes.

---

## 6. Performance & accessibility rules

- Animate only `transform`, `opacity`, `clip-path`, `stroke-dashoffset`, and the stepped `filter` swap on small elements.
- `will-change` only during an animation. Remove it in `animationend`.
- Under `prefers-reduced-motion: reduce`: no boil, no pin, no stamp motion (the stamp appears in place), marks appear fully drawn, view transitions become a crossfade of ≤120ms or none.
- Honor `prefers-reduced-transparency` (no scrims with blur) and `prefers-contrast: more` (bold marks, 2px rules).
- Each motion that carries information has a text equivalent in the `aria-live` log (e.g. "Fact Challenger marked part 2 as contradicted by 2 sources").
