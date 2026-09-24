# 00 — Master prompt (your brief, rewritten for Opus 5.5 in Claude Code)

## What changed from your original prompts, and why

| Your original | Rewritten as | Why it matters on Opus 5.5 |
|---|---|---|
| Three animation styles listed as moods | Three **motion languages**, each with a territory, triggers, tokens and limits | Opus 5.5 follows precise, scoped instructions very literally. "Use scroll storytelling" gets applied everywhere; "use it only in replay, `/` and `/method`, max 2 friction points" gets applied correctly |
| "Quiet audio feedback" (v1), then "remove the Sound feature" (v2) | **ACHP is silent.** There are no audio APIs, files, packages or toggles, and a hook rule (`no-audio`) blocks them. Every confirmation is visible text plus a polite screen-reader announcement | People check forwarded claims on phones in public. A rule the hook can enforce beats a preference the model has to remember |
| "Use BIS NSS EPS PCS CTS to make it unique" | **The Assay** (`11_THE_ASSAY.md` + `reference/assay/`): nine new metric instruments (Hallmark, Two-Key Verdict, Integrity Ledger, Tipping Point, Quiet Falsehood Index, Signal Lineage, Agreement Dial, Assay Bench, Integrity Map), a CI tool (Leverage Lint) and the **Truth-first display rule**, all pinned to production math by parity tests | "Make it unique" gives the model nothing to test. Tested reference code plus named instruments does, and each instrument answers a real weakness found in ACHP's own formulas |
| "Upgrade the UI/UX for the full site" | Every route specified (`07` §1–9), a table that retires every current screen and paper figure (`07` §1.1), and a clickable full-site prototype (`prototype/achp-site.html`) | Opus 5.5 builds what it can see and check. A route table plus a reference page removes guesswork |
| "Don't look like AI slop" | A **named banned-pattern list** (cream backgrounds, italic accent words, 01/02/03 labels, mono labels, pill buttons, glow, glass, radar charts, bare metric acronyms…) | Anthropic's Opus 5.5 guide notes that "avoid a generic AI look" just swaps one default style for another. Naming the patterns works |
| "Show what each agent thought" | "Show each agent's **actions, validated public notes and outputs**; never render chain-of-thought" | It's honest (ACHP X NFR-003), and Opus 5.5 declines prompts that push for reasoning extraction. It also makes a better UI: actions and evidence beat monologue |
| "Avoid latency hidden behind a loader" | "The UI is a projection of a replayable server event log; no client timer may invent progress" | A testable invariant instead of a vibe. It also fixes the real SSE race in the current code |
| References listed without roles | Each reference has a **take / skip / install** decision (`08_REFERENCES`) | It stops the agent from importing every shiny component |
| One giant ask | **12 gated phases (P0–P11)** with 4 skills, 5 subagents, hooks and `PROGRESS.md` | Opus 5.5 sustains long autonomous runs well when the task list is explicit and the completion condition is stated |
| Nothing about effort | `medium` by default, `high` for P2/P3/P5/P10, `max` never by default | Opus 5.5 defaults to `medium`, which matches Opus 5 `high` on coding; higher levels cost more with diminishing returns |

---

## The prompt (paste once at the start of the Claude Code session)

```xml
<context>
You're working in the ACHP repository (github.com/theShivansh/ACHP): an evidence-grounded, 7-agent
adversarial claim-verification system. The FastAPI backend is in apps/api; the Next.js 16 / React 19.2 /
Tailwind v4 frontend is in apps/web, live at achp-seven.vercel.app. We're executing a complete interface
upgrade called "The Fact-Checker's Desk". Every spec you need is in docs/upgrade/:
README, 01_AUDIT, 02_PRD, 03_USER_STORIES, 04_DESIGN (DESIGN.md), 05_MOTION_SPEC, 06_AGENT_STATE_SPEC,
07_IA_AND_SCREENS, 08_REFERENCES, 09_ACCEPTANCE_AND_QA, 10_IDEAS, 11_THE_ASSAY, PHASES.md and prompts/P0–P11.
The metric reference implementation is reference/assay/ (Python source of truth, TypeScript port, vectors,
tests, leverage_lint.py). The visual target for every route is docs/upgrade/achp-site.html, a self-contained
prototype with simulated events whose metric numbers come from the real assay.ts.
</context>

<objective>
Turn ACHP from a generic neon AI dashboard into an evidence-first product across the whole site, in which
agent latency is never hidden behind a loader and the five scores are explained, not decorated. Each agent
visibly works on the claim the way a human fact-checker would: the claim is cut into checkable parts,
sources are pinned, a red pencil challenges facts, a blue pencil marks missing perspectives, a highlighter
flags loaded wording, and a stamp gives each part its verdict. Then the Assay shows how the scores were
reached and whether they agree with the verdict. The live run and the final report are the same shareable page.
</objective>

<non_negotiables>
1. The UI is a projection of a persisted, replayable server event log (06_AGENT_STATE_SPEC). No client timer
   may advance or invent progress. The current synthetic progress bar, the fabricated Logs tab, the
   hard-coded model names and the silent mock verdict are removed.
2. For each agent, show what it is doing (actions), what it found (outputs, evidence with verbatim quotes), and
   one validated public note (≤140 chars). Never request, stream or render chain-of-thought.
3. Every claim-level statement cites evidence ids that exist earlier in the event log; quotes stay verbatim and
   interpretation is styled separately.
4. ACHP is silent: no audio APIs, files, packages or sound toggles anywhere. Confirmations are visible and
   announced through the polite live region.
5. Truth first for metrics (11_THE_ASSAY §4): the Judge's stamp is the headline; the composite is never shown
   alone; masking gets a notice; every metric shows its full form on first use in a view; metric math lives
   only in the Assay module, pinned to reference/assay by parity tests.
6. Accessibility (WCAG 2.2 AA) and reduced motion are part of each feature, not a later pass.
</non_negotiables>

<metrics>
Use these names on first use in every view, then the acronym:
Consensus Truth Score (CTS) · Perspective Completeness Score (PCS) · Bias Impact Score (BIS, lower is better) ·
Narrative Stance Score (NSS) · Epistemic Position Score (EPS) · overall score (the composite C, the mean of the
five with BIS inverted). Build the instruments exactly as 11_THE_ASSAY §3 specifies: the Hallmark replaces
every radar; the Two-Key Verdict compares the Judge with the formula; the Integrity Ledger attributes C with
exact Shapley values and must balance; the Tipping Point states the smallest single-signal change that flips
the formula verdict; the masking notice and Quiet Falsehood Index (experimental) flag calm wording lifting
refuted claims; Signal Lineage, the Agreement Dial (human agreement r, never "accuracy") and the Assay Bench
(what-if only) live on /method; the Integrity Map lives on /runs. Never change a weight without the procedure
in the achp-assay skill.
</metrics>

<motion_languages>
Use exactly three motion languages, each only in its territory (details and tokens in 05_MOTION_SPEC):
A. Scroll-driven storytelling with intentional friction, only on the case replay (?replay=1), the "How a check
   works" section of /, and /method. The screen narrates one concept per step. Friction means a longer scroll
   track with a sticky stage (a 220vh "reading gate") at most twice per story: at the first contradiction and at
   the first missing-context finding. Never intercept wheel or touch events, never use mandatory scroll snap, and
   always show "Skip to verdict".
B. Utility micro-interactions, silent and only where they carry information: the Desk→Case claim morph
   (React ViewTransition), sliding tab indicator, evidence↔claim-span hover/focus linking, Hallmark↔Ledger
   linking, copy confirmation ("Copied" text + announcement), input error shake. Numbers update without
   easing. No hover lifts, magnetic buttons, cursor effects or parallax.
C. Stop-motion and hand-drawn, only on marks, agent glyphs, stamps, Hallmark punches, Two-Key keys, scissors,
   paperclips, highlighter, tally marks and the cold-start lamp: 12fps with steps(), SVG stroke drawing, and
   line boil via stepped feTurbulence filters that are removed at rest. Text, data and layout stay crisp. The
   page is completely still when nothing is happening.
Every animation must explain a state change, show cause and effect, or hold attention on what matters;
otherwise cut it. Under prefers-reduced-motion everything renders in its final state.
</motion_languages>

<design>
Follow docs/upgrade/04_DESIGN.md: a slate "desk" for chrome and agent lanes, cool paper "sheets" for the claim
and evidence; Newsreader for claims and quotes, Public Sans for UI, Kalam only for ≤6-word margin notes, IBM
Plex Mono only inside code and raw JSON. Agent inks: red pencil (factual challenger), blue pencil (narrative
auditor), highlighter (framing lens), graphite (gatekeeper, retriever), verdict colors for the stamps. Charts
use only the --mark-* tokens, have a table twin, and never use dual axes.
Do not use: cream, beige or warm off-white backgrounds; italic accent words in headlines; numbered
"01/02/03" section labels; monospace labels; wide-tracked all-caps labels; pill-shaped buttons; glow shadows;
glassmorphism; grid or dot backdrops; gradients or gradient text; pure black or white; nested cards; icon tiles
above headings; radar charts anywhere; bare metric acronyms; the composite as a headline; bare TRUE/FALSE or
percentage verdicts; skeleton blocks; infinite shimmer or pulse; bounce easing; emoji or icon fonts; any audio;
Inter, Space Grotesk, JetBrains Mono, Roboto, Arial. If a first result still lands on a default style, name
that style and add it to the list in 04 §2.
</design>

<references>
Use the references exactly as decided in 08_REFERENCES.md: impeccable (init, critique, audit, harden, polish
as phase gates), the transitions.dev skill (the specific recipes listed, restyled, shimmer removed),
shadcn/ui and AI Elements as restyled primitives, godly.design for a moodboard only, designmd.me for token
comparison and drift checks, animos for launch video only, and neither vengenceui components nor
backgrounds.supply assets on product surfaces.
</references>

<how_to_work>
- Execute the phases in docs/upgrade/PHASES.md in order, one at a time, using the achp-phase-runner skill
  and the matching prompt in docs/upgrade/prompts/. Start each phase in plan mode.
- Before changing anything, explore the files the phase touches, including neighbors the prompt doesn't name,
  and use what you find. Load the achp-assay skill before touching anything that shows CTS · PCS · BIS · NSS · EPS.
- Keep docs/upgrade/PROGRESS.md current: the checklist, one-line "Decision: X because Y" entries, and the gate
  evidence. If the context resets, resume from the first unchecked item.
- After every UI change, run scripts/ui/shoot.mjs, look at the 390px and 1440px screenshots yourself, then
  delegate review to the design-critic subagent (and motion-auditor, a11y-auditor, event-contract-verifier or
  assay-auditor where the phase says so). Fix every P0/P1 finding before closing the phase.
- The hooks enforce the anti-slop patterns (including no-audio and radar-chart) on each edit and a typecheck
  gate on stop. Treat their output as instructions to fix, not noise.
- Put brief status notes in the same message as your next action and keep going. Stop only when a decision is
  genuinely mine (brand choices not covered by DESIGN.md, deleting data, promoting to production, changing the
  public API beyond 06, changing a metric weight), and when you stop, state the options and your recommendation.
</how_to_work>

<done_when>
All phases P0–P11 are checked in PROGRESS.md with gate evidence; every gate in 09_ACCEPTANCE_AND_QA §2 is
green, including Assay parity (run, not skipped), ledger balance, Leverage Lint, metric vocabulary and silence;
the anti-slop full scan reports 0; every row of 07 §1.1 is retired or replaced; the live run on a real claim
shows every agent's real steps with no loader and ends with an assay.computed event; and the production
promotion is waiting for my approval.
</done_when>

<start>
Begin with phase P0 (docs/upgrade/prompts/P0_bootstrap.md).
</start>
```

---

## Per-phase kickoff (use after the master prompt)

```text
Run phase P5 with the achp-phase-runner skill. Prompt: docs/upgrade/prompts/P5_assay_instruments.md
```
Before P2, P3, P5 and P10, run `/effort high`; after them, `/effort medium`.

## If you only want a short version (e.g. a one-off chat)

```text
Redesign ACHP's whole site so no agent latency hides behind a loader and the five scores are explained, not
decorated. Stream real backend events and render 7 agent lanes (queued / working / done), each showing its
current action, one ≤140-char public note, and its outputs. Never show chain-of-thought. The claim sits on a
cool paper sheet: cut it into checkable parts as they arrive, mark contradicted words with a red-pencil stroke,
missing perspectives with a blue-pencil bracket, and loaded words with a highlighter, then stamp each part
Supported / Contradicted / Mixed / Missing context / Unverifiable. The Judge's stamp is the headline. Replace
the radar with a five-mark Hallmark (Consensus Truth, Perspective Completeness, Bias Impact (lower is better),
Narrative Stance, Epistemic Position), show whether the Judge and the formula agree, and warn when calm
wording lifts a refuted claim. The site is silent. Hand-drawn elements animate at 12fps with steps() and stop
completely at rest; the replay view is a scroll story with at most two "reading gate" pauses and a Skip
button. Do not use cream backgrounds, italic accent words, 01/02/03 labels, monospace labels, pill buttons,
glow, glass, gradients, radar charts or percentage verdicts. Respect prefers-reduced-motion.
```
