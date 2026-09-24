---
name: ACHP — The Fact-Checker's Desk
version: 1.0.0
surfaces: [product, report]
lane: product (app UI) with editorial report pages
---

# DESIGN.md — ACHP

> Agents: read this file before touching any UI. It is the source of truth for tokens, components and **what not to do**. When a request conflicts with it, follow this file and say so in your notes.

## 1. Direction

**Metaphor: a fact-checker's desk at night.** A slate-graphite desk holds cool paper sheets. The claim sits on a sheet, and seven specialists mark it up, each with their own tool and ink: a red pencil for factual challenges, a blue pencil for narrative gaps, a highlighter for loaded language, paperclips for pinned sources, and a rubber stamp for the verdict.

**Why it fits ACHP:** the product is adversarial review. Editors have marked up claims with red and blue pencil for a century. The metaphor explains the pipeline without a diagram, and it belongs to ACHP rather than to any template.

**Personality:** calm, exact, a little handmade. Serious about evidence, human in texture. The handmade quality lives *only* in marks and annotations. Text, layout and data stay crisp and precise.

**Two surfaces, never mixed:**

| Surface | Role | Feel |
|---|---|---|
| **Desk** | App chrome, agent lanes, navigation | Dark slate, matte, low contrast between regions |
| **Sheet** | The claim, atomic claims, evidence, report text | Cool paper, high contrast, generous line-height |

## 2. Banned patterns (the anti-slop list)

Opus 5.5 falls back on a few default styles when direction is vague, and "avoid a generic AI look" just swaps one default for another. So this list names the patterns explicitly. The `.claude/hooks/anti-slop-check.mjs` hook enforces the greppable ones.

**Never use:**
- Neon or glow effects: `box-shadow` with a 0 offset and a large blur in a saturated color; cyan `#00F0FF`-family accents
- Glassmorphism: `backdrop-filter: blur()` on content cards (allowed only on the sticky mobile header, with ≤8px blur)
- Grid or dot-matrix page backdrops; aurora, mesh or purple-to-blue gradients; gradient text
- Pure `#000`/`#FFF` surfaces (always tinted), **cream, beige or warm off-white backgrounds**
- Monospace for UI labels, headings or body copy (mono is allowed only inside code blocks, raw JSON and IDs in the Trace view)
- ALL-CAPS labels with wide tracking (`letter-spacing ≥ 0.08em`) as a default label style
- Numbered section labels like "01 / 02 / 03"
- *Italic accent words* inside headlines
- Pill-shaped buttons (`rounded-full` on buttons). Chips may be 4px; buttons use 6px
- Cards nested in cards; a rounded-square icon tile above every heading
- Radar charts in the primary view; a bare TRUE/FALSE verdict; a bare % confidence
- Bounce or elastic easing; infinite shimmer or pulse loops; skeleton blocks taller than one text line
- Emoji as icons; Material Symbols ligature fonts
- Fonts: Inter, Space Grotesk, JetBrains Mono (the current set), Roboto, Arial, system-ui as the brand face
- **Any audio**: UI sounds, ambient sound, a sound toggle, audio files or Web Audio code
- A metric acronym without its full form on first use in a view; a bare composite presented as the verdict; radar/spider charts for CTS · PCS · BIS · NSS · EPS

## 3. Color tokens

Declare these as CSS custom properties in `@theme` (Tailwind v4). Every pair was checked for WCAG AA contrast (ratio against its surface in brackets).

### 3.1 Light (default)

| Token | Value | Use |
|---|---|---|
| `--desk` | `#1B2026` | App background (desk) |
| `--desk-raised` | `#232931` | Lanes, rail, header |
| `--desk-line` | `#313943` | Dividers on the desk |
| `--desk-ink` | `#E3E7EB` | Primary text on the desk (13.2:1) |
| `--desk-ink-2` | `#A3ADB7` | Secondary text on the desk (7.2:1) |
| `--sheet` | `#F3F5F6` | Paper (cool, never cream) |
| `--sheet-line` | `#D6DCE1` | Rules and hairlines on paper |
| `--ink` | `#14181C` | Primary text on the sheet (16.3:1) |
| `--ink-2` | `#4B545D` | Secondary text on the sheet (7.1:1) |
| `--ink-3` | `#616A73` | Tertiary / meta on the sheet (5.0:1) |
| `--pencil-red` | `#B42F28` | Adversary A marks; **Contradicted** (5.7:1) |
| `--pencil-blue` | `#2952C2` | Adversary B marks; links; focus ring (6.2:1) |
| `--support` | `#23713F` | **Supported** (5.5:1) |
| `--ochre` | `#8A5A00` | **Missing context**, **Mixed** (5.4:1) |
| `--graphite` | `#59636C` | Retriever/Gatekeeper marks; **Unverifiable** (5.6:1) |
| `--highlighter` | `#F7DC6F` | NIL highlight fill behind `--ink` (13.1:1), at 70% opacity with `mix-blend-mode: multiply` |
| `--focus` | `#7FA2FF` | Focus ring on the desk (6.7:1) |

### 3.2 Dark ("lamp off")

| Token | Value |
|---|---|
| `--desk` | `#0E1215` · `--desk-raised` `#151A1F` · `--desk-line` `#252C33` |
| `--sheet` | `#1A2026` · `--sheet-line` `#2C343C` |
| `--ink` | `#E6EAED` · `--ink-2` `#A9B3BC` · `--ink-3` `#8A949E` |
| `--pencil-red` | `#FF8A80` · `--pencil-blue` `#94B4FF` · `--support` `#74D39C` · `--ochre` `#EBBE55` · `--graphite` `#A3ADB7` |
| `--highlighter` | `#EBBE55` at 28% opacity, `mix-blend-mode: screen` |

### 3.3 Verdict mapping

| Verdict | Token | Stamp text | Mark on the strip |
|---|---|---|---|
| Supported | `--support` | SUPPORTED | Tick in the margin |
| Contradicted | `--pencil-red` | CONTRADICTED | Red strike-through of the contested span |
| Mixed | `--ochre` | MIXED | Half-underline, red + green |
| Missing context | `--ochre` | MISSING CONTEXT | Ochre bracket + caret "^ context" |
| Unverifiable | `--graphite` | UNVERIFIABLE | Dashed box |
| Blocked | `--graphite` | NOT CHECKED | None. A plain notice explains why |

*Stamps are the one place uppercase is allowed (it's how stamps look), and they are set in the display face, not mono.*

## 4. Typography

| Role | Family | Why |
|---|---|---|
| **Display & claim text** | **Newsreader** (variable, opsz 6–72, Production Type, OFL) | A face built for reading news; it gives claims the weight of a printed page |
| **UI & body** | **Public Sans** (variable, USWDS, OFL) | Civic, neutral, trustworthy, with tabular figures |
| **Annotation** | **Kalam** 400/700 (OFL) | Legible handwriting for margin notes, **≤6 words**, always `aria-hidden` next to a real-text equivalent |
| **Code only** | **IBM Plex Mono** | Only in `/developers` code blocks and the raw JSON in Trace |

Load all fonts with `next/font/google`: `display: 'swap'`, subset `latin`, and preload only Newsreader + Public Sans.

**Scale** (`clamp`-based and fluid; px shown at 1440px width):

| Token | Size / line-height | Family / weight | Use |
|---|---|---|---|
| `--t-display` | 44 / 1.08 | Newsreader 500, opsz 60 | Desk headline (`/`) |
| `--t-claim` | 30 / 1.25 | Newsreader 450, opsz 36 | The claim on the sheet |
| `--t-strip` | 20 / 1.4 | Newsreader 420, opsz 18 | Atomic claim strips |
| `--t-h2` | 20 / 1.3 | Public Sans 650 | Section heads |
| `--t-body` | 16 / 1.6 | Public Sans 400 | Body (never below 16 on the sheet) |
| `--t-ui` | 14 / 1.4 | Public Sans 500 | Buttons, lane titles, tabs |
| `--t-meta` | 13 / 1.4 | Public Sans 450, `tnum` | Timestamps, source domains (the floor size) |
| `--t-note` | 17 / 1.2 | Kalam 400 | Margin annotations |

Rules: sentence case everywhere except stamps. Maximum measure 68ch on the sheet. `font-variant-numeric: tabular-nums` for anything that ticks.

## 5. Space, radius, elevation, grid

- **Spacing** (4pt): `4 8 12 16 24 32 48 64 96`
- **Radius:** sheet `2px` (paper) · button `6px` · chip `4px` · evidence card `3px` · stamp `3px` with an irregular mask · avatars and dots may be circles
- **Elevation** (on the desk only; paper casts, UI doesn't):
  - `--lift-sheet`: `0 1px 0 rgba(8,10,12,.35), 0 18px 40px -24px rgba(8,10,12,.65)`
  - `--lift-card`: `0 1px 0 rgba(8,10,12,.25), 0 8px 18px -12px rgba(8,10,12,.5)` (evidence cards clipped to the sheet)
- **Paper texture:** one 256px SVG `feTurbulence` grain tile, 3% opacity, on `--sheet` only. It's generated in CSS, never an image download.
- **Layout grid:** desktop ≥1280px has 3 regions: *Lanes* 280px · *Sheet* fluid (max 760px) · *Tray* 340px. Tablet 768–1279px: the lanes collapse to a 64px icon rail and the tray becomes a right Sheet. Mobile <768px: a sticky **lane strip** at the top (7 dots + the current action), the sheet full width, and evidence in a bottom Sheet.
- **Breakpoints:** `sm 480 · md 768 · lg 1024 · xl 1280 · 2xl 1536`

## 6. Agent identities

Configured in `apps/web/lib/agents.config.ts`. The server's `run.started.agents[]` supplies runtime truth (the model, parallel group); this file supplies only the look.

| Agent id (server) | Display name | Tool / mark | Ink | Glyph (hand-drawn SVG, 24px) |
|---|---|---|---|---|
| `security_validator` | Gatekeeper | Bracket seal around the claim | `--graphite` | Wax-seal ring |
| `retriever` | Clipper | Pins evidence cards with a paperclip | `--graphite` | Paperclip |
| `proposer` | Decomposer | Cuts the claim into strips | `--ink` | Scissors |
| `adversary_a` | Fact Challenger | Red pencil: strike, underline, "?" | `--pencil-red` | Red pencil |
| `adversary_b` | Narrative Auditor | Blue pencil: brackets, carets, "missing: …" | `--pencil-blue` | Blue pencil |
| `nil_supervisor` | Framing Lens (5 sub-checks) | Highlighter over loaded words + tally marks | `--ochre` / `--highlighter` | Highlighter |
| `judge` | Judge | Rubber stamp per strip + overall | Verdict color | Stamp |
| *(future)* `evidence_verifier` | Verifier | Checks each paperclip: ✓ or ✗ | `--support` | Loupe |
| *(future)* `media_integrity` | Media Desk | Crop marks on images | `--graphite` | Crop corners |

## 7. Components (build on shadcn primitives; restyle all of them)

| Component | Primitive | Key specs |
|---|---|---|
| `ClaimInput` | textarea + dropzone | Newsreader 20px placeholder "Paste the message you were forwarded…". Accepts paste and drop. The drag-over morph comes from transitions.dev *Drag & drop with physics*. Primary button "Check it" (6px radius; `#F4F7FF` on `--pencil-blue` in light, `--desk` on `--pencil-blue` in dark) |
| `AgentLane` | custom | Glyph · name · state chip · live action line (one line, ellipsis) · `public_note` in Kalam (aria-hidden) plus a sans duplicate in `sr-only`/expanded view · duration when done. States in 06 §4 |
| `LaneStrip` (mobile) | custom + `Sheet` | 7 dots (state-colored) + the current action. Tap to expand the lanes |
| `CaseSheet` | custom | Paper with grain; claim header; strips list; margin column 120px for marks and notes |
| `ClaimStrip` | custom | Atomic claim text with span ranges for marks; verdict stamp slot; evidence count "3 sources · 2 disagree" |
| `EvidenceCard` | `HoverCard` (desktop) / `Sheet` (mobile) | Source domain + favicon, title, the **quoted span** (Newsreader, left rule in the relation color), relation label (Supports / Contradicts / Context), freshness ("Published Mar 2024"), and the verifier status |
| `InterpretationNote` | custom | Model interpretation, visually distinct from quotes: Public Sans, `--ink-2`, an "ACHP's reading" label, no left rule |
| `Stamp` | custom SVG | 4-frame stamp animation (05 §3.3); an ink-bleed mask; slight rotation −3°…+3° seeded by `claim_id` so it's stable per claim |
| `ConfidenceBand` | custom | *Strong / Moderate / Weak evidence* + one-line reason, with a 3-segment bar (no %) |
| `MethodDrawer` | `Sheet` | Metrics with full forms, definitions and formulas, benchmark table, limitations, link to the Assay tab |
| `TraceTable` | `Table` + virtualized | Time · agent · event type · summary; row expands to JSON (mono) |
| `StatusPill` (backend) | custom | *Waking the desk · 14s* / *Ready* / *Unreachable*. It's a chip, not a pill button |
| `ShareBar` | custom | Copy summary · Copy link · native share · Replay |
| `CommandMenu` | `Command` | ⌘K: New check, Ask a library, Replay, Open Assay, Open trace, Go to Runs / Library / Method, Toggle theme |
| `AskPanel` | custom | Library picker chip · question input (Newsreader placeholder "Ask this library…") · the answer as sheet prose with numbered citation chips `[1]` · each chip opens a `QuoteCard` (the chunk excerpt, chunk index, similarity in words: close / partial / loose match) · the out-of-library state "Not in this library" with the 3 nearest chunks |
| `LibraryCard` | custom | An index card on the desk: title (Newsreader), documents · chunks · size, status chip (Embedding 12/48 → Ready), "Set active" / "Ask" / "Delete" (confirm dialog). Chunks open as a stacked card list |

### 7.1 Assay components (11_THE_ASSAY)

| Component | Primitive | Key specs |
|---|---|---|
| `Hallmark` | custom SVG | 5 cartouches in a row, 28×28 each (24px compact variant for tables): **CTS shield · PCS hexagon · BIS diamond · NSS level · EPS circle**. Outline 1.5px `--ink` (1px for r < 0.75: PCS, NSS, BIS). Fill = value, rising from the bottom in `--ink-2` at 55% (BIS uses 45° hatching in `--pencil-red` instead of solid fill). Letters in Public Sans 600 9px inside. Hover/focus → tooltip "Bias Impact Score (BIS) · 20 · lower is better". Always paired with a visually hidden table |
| `TwoKey` | custom SVG + text | Two small key glyphs labelled "Judge" and "Formula". Turned key = agrees with the headline stamp. Copy: agree → "Judge and formula agree"; adjacent → "Close call: Judge {v1} · Formula {v2} ({C})"; split → "Split decision: Judge {v1} · Formula {v2}. See the ledger." |
| `MaskingNotice` | custom | A ruled notice on the sheet (1px `--ochre` rule top and bottom, no box, no icon tile): "The wording is calm and balanced, but the facts didn't hold up. The overall score ({C}) is lifted by tone, not evidence." + "Quiet Falsehood Index {qfi} · experimental" |
| `IntegrityLedger` | `Table` | A ledger on paper: columns Signal (plain words) · Value · Debit · Credit. Rows: Opening balance (reference claim) → "Facts" group (fA, jCTS) → "Perspectives" → "Wording" → a double hairline → Closing balance = C. Amounts to 3 dp, tabular figures. Margin diverging bars: credit `--mark-credit`, debit `--mark-debit`, 2px surface gap, 4px rounded data-end, square at the zero line |
| `TippingLine` | custom SVG | A 0–1 axis with five labelled verdict zones in neutral steps of `--sheet-line` (no hue), the case's C as an 8px dot with a 2px surface ring, and a leader to the nearest boundary labelled with the lever: "framing score 0.08 → 0.15 flips to Mixed". Band word (Fragile / Firm / Settled) as text |
| `LineageDiagram` | custom SVG | Three columns: 13 signals → 5 metrics → C. Edge width ∝ |weight|, `--ink-3` hairlines; a shared signal (framing) is drawn in `--ochre` with its path count. Paper ↔ Production toggle (a 2-option segmented control, 6px radius). Every node is focusable and lists inputs/outputs |
| `AgreementDial` | custom | Five single-hue horizontal bars (≤ 24px thick, `--ink-2`), a 0–1 axis, value label at the tip, the caption "Agreement with 200 human-annotated claims (Pearson r)" |
| `AssayBench` | `Slider` ×n + the components above | Grouped sliders (Facts · Perspectives · Wording) with the case's real value marked as a tick on each track; a persistent label "What-if. This doesn't re-run the agents."; Reset; no share/copy |
| `IntegrityMap` | custom SVG | Scatter 0–1 × 0–1: x = CTS "Facts hold up →", y = Calm "Reads calm →"; four quadrant labels as text (Sound · True but loaded · Quiet falsehood · Loud falsehood); dots 8px `--ink-3`, the current/hovered one `--pencil-blue`; 24px hit areas; solid hairline gridlines at 0.5 only |
| `MetricTerm` | inline | The first use of a metric in any view renders its full form: "Bias Impact Score (BIS)"; later uses may use the acronym with a dotted underline tooltip |

### 7.2 Chart tokens (validated with the dataviz validator, both themes)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--mark-credit` | `#2952C2` | `#6A8DE6` | Ledger credits, positive leverage |
| `--mark-debit` | `#B42F28` | `#E0655A` | Ledger debits, negative leverage |
| `--mark-neutral` | `#59636C` | `#A3ADB7` | Single-series bars and dots (Agreement Dial, Integrity Map) |
| `--mark-focus` | `#2952C2` | `#94B4FF` | The highlighted run or node |

Validator result (`validate_palette.js`): credit/debit pass every check in light (on `#F3F5F6`) and dark (on `#1A2026`); CVD ΔE 24.6 light, 20.7 dark. Values and labels always use text tokens, never the mark color.

## 8. Iconography & illustration

- Agent glyphs and marks are **hand-drawn SVG paths** (drawn once, committed as React components). Stroke 1.75px, round caps, slight wobble built into the path data. No icon fonts.
- UI icons (close, copy, share, chevrons) come from Lucide at a 1.5px stroke, so the UI stays crisp against the handmade marks.
- No stock illustration, no 3D blobs, no AI-generated imagery on product surfaces.

## 9. Voice

Plain, specific, calm. "2 of 3 sources disagree with the 40% figure" beats "Discrepancy detected". Never "AI-powered", never "revolutionary". Say what's unknown: "We couldn't find a reliable source for this part."
