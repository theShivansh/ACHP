---
name: achp-design-system
description: Quick reference and procedure for building or changing any ACHP UI component in the "Fact-Checker's Desk" design system — surfaces, tokens, type roles, verdict colors, agent inks, component specs and the banned-pattern list. Use before creating or restyling any component, page or visual element in apps/web.
---

# ACHP design system — working reference

The full spec is `docs/upgrade/04_DESIGN.md`. This skill is the checklist you apply every time.

## Before you write UI
1. Decide the surface: **Desk** (chrome, lanes, nav: dark slate) or **Sheet** (claim, strips, evidence, report: cool paper). Never mix them in one element.
2. Pick the type role: claim/quote → Newsreader · UI/body → Public Sans · short margin note (≤6 words, aria-hidden + a sans duplicate) → Kalam · code/JSON only → IBM Plex Mono.
3. Use tokens only: `--desk*`, `--sheet*`, `--ink*`, `--pencil-red`, `--pencil-blue`, `--support`, `--ochre`, `--graphite`, `--highlighter`, `--focus`; the spacing scale 4/8/12/16/24/32/48/64/96; radii 2 (sheet) · 3 (evidence card, stamp) · 4 (chip) · 6 (button).
4. Verdicts: supported `--support` · contradicted `--pencil-red` · mixed and missing context `--ochre` · unverifiable and blocked `--graphite`. Always pair the color with text.

## Banned (the hook catches some; you catch the rest)
Glow shadows · glass/backdrop blur · grid or dot backdrops · gradients and gradient text · pure #000/#FFF · **cream/beige/off-white backgrounds** · **monospace labels** · wide-tracked caps labels · **"01/02/03" numbering** · ***italic accent words in headings*** · **pill buttons** · nested cards · an icon tile over headings · a bare TRUE/FALSE or % · skeleton blocks · infinite shimmer or pulse · bounce/elastic easing · emoji icons · icon fonts · Inter / Space Grotesk / JetBrains Mono / Roboto / Arial · **any audio** · radar charts anywhere · a metric acronym without its full form on first use · the composite as a headline.

## Component checklist
- [ ] Built on the shadcn primitive if one exists (`components/ui`), restyled to the tokens
- [ ] Tailwind utilities + tokens; no inline `style={{}}` except CSS custom properties
- [ ] Every interactive element: a `:focus-visible` style, a ≥24px target (44px for the primary touch actions), and a keyboard path
- [ ] States designed: default · hover · focus · active · disabled · loading-by-event (never a spinner) · empty · error
- [ ] Dark theme checked; `prefers-contrast: more` keeps the marks and rules visible
- [ ] The copy follows 04 §9: plain, specific, calm, sentence case
- [ ] If it animates, load the `achp-motion` skill first
- [ ] If it shows CTS · PCS · BIS · NSS · EPS or the composite, load the `achp-assay` skill first

## When unsure
Prefer less: remove a border before adding a shadow, remove a color before adding a new one, and use a text label instead of an icon. Paper and ink should do the work.
