# 08 — References: what to take, what to skip, how to install

Each reference is judged against one question: **does it help ACHP show evidence-first work, or does it add decoration?** Checked on 23 Sep 2026.

---

## 1. impeccable.style — design vocabulary for agents · **Use heavily**

**What it is:** an open-source (Apache-2.0) design skill for coding agents: 23 commands, 44 deterministic detector rules, and a live browser iteration mode. It supports Claude Code.

**Install**
```bash
npx impeccable install          # from the repo root, then reload Claude Code
/impeccable init                # writes PRODUCT.md and offers DESIGN.md
```
When `init` offers to write DESIGN.md, **point it at `docs/upgrade/04_DESIGN.md`** rather than generating a new one. Our file already names the banned patterns.

**Where it fits in the phases**

| Command | Phase | Use |
|---|---|---|
| `/impeccable critique case` | End of P3, P4 | Hierarchy and clarity review of the case page (persona tests) |
| `/impeccable audit` | P10 | A11y / performance / responsive checks with P0–P3 severity |
| `/impeccable animate` | P7 | Only to check that motion "conveys state, not decoration" against 05_MOTION_SPEC |
| `/impeccable harden` | P10 | Edge cases, overflow, long claims, i18n |
| `/impeccable typeset` | P1 | Verify the Newsreader/Public Sans scale |
| `/impeccable polish` | P11 | The final pass |
| `/impeccable distill` | Any time a panel feels busy | Ruthless subtraction |

**Skip:** `/impeccable overdrive` (shaders and 60fps spectacle work against the calm paper metaphor) and `/impeccable bolder` on product surfaces.

---

## 2. transitions.dev — UI transitions for AI agents · **Use selectively**

**What it is:** 27+ production transitions (CSS/React) plus an agent skill with `reveal`, `review`, `apply`, `refine` and `polish` commands. It also ships a motion token scale.

**Install**
```bash
npx skills add Jakubantalik/transitions.dev
npx skills add Jakubantalik/transitions.dev -s transitions-polish   # aligns existing motion to tokens
```

**Take (mapped to 05_MOTION_SPEC Language B):**

| transitions.dev item | ACHP use |
|---|---|
| **Thinking states** (a status line shimmers, then swaps) | The agent action line. **Remove the shimmer loop** and keep only the swap, since we don't loop |
| **Reasoning stream** | The margin-notes feed on mobile (public notes only, never raw reasoning) |
| **Streaming text** (words resolve through a soft cross-blur) | The plain-words verdict summary when `verdict.final` arrives |
| **Spinner to check morph** | Not as a spinner: use only the "draw on check" half for lane → done |
| **Tabs sliding** | Report · Evidence · Trace tabs |
| **Tooltip open/close** (appear-only delay, instant exit) | Term definitions, truncated action lines |
| **Error state shake** | Input validation |
| **Drag & drop with physics** | The screenshot dropzone (IF-14, behind its flag) |
| **Number pop-in** / **Spinning counter** | Source counts, the elapsed seconds on done |
| **Toast open/close** | Copy confirmations (paired with the icon morph) |
| **Dropdown menu morph** | The share menu |

**Skip:** Confetti burst, Like button, Gooey plus menu, 3D tilt, Image open tilt, Pro gradient text, Organic shimmer. They're celebratory or ornamental, which is wrong for a fact-checker.
**Run** `transitions refine` in P7 to replace hardcoded durations with tokens, and `transitions review` in P10.

---

## 3. godly.design (you wrote goldly.design, which doesn't resolve) — inspiration gallery · **Moodboard only**

**What it is:** a curated gallery of web, app and motion design (filters: *Web app, Interface, Motion, Editorial, Typography*).

**Use it to:** build a 9-tile moodboard in P0. Pick 3 editorial/newsroom interfaces, 3 annotation/markup UIs and 3 calm data products. Save the screenshots to `docs/upgrade/moodboard/` and describe in one line each *what* to borrow (a spacing rhythm, a type pairing, a margin-note treatment). Claude Code (Opus 5.5 reads screenshots accurately) can then critique against them.
**Skip:** copying any single site's look, and the showcase-style hero animations common in the gallery.

---

## 4. ui.shadcn.com — primitives + registry · **Use as the foundation**

**What's new that matters (checked Sep 2026):**
- **`cn` package (Sep 2026):** components now import `cn` from the `cn` package instead of `clsx + tailwind-merge`. Migrate with `pnpm dlx shadcn@latest migrate cn` (it rewrites imports and removes the old deps).
- **GitHub registries (public, and private since Aug 2026):** you could publish your hand-drawn marks and glyphs as your own registry, `theShivansh/achp-ui`. It's a nice portfolio signal.
- **`@shadcn/helpers` human-in-the-loop mocks for the AI SDK:** useful for prototyping the IF-20 Editor's desk flow.

**Install**
```bash
cd apps/web
pnpm dlx shadcn@latest init            # CSS variables mode (required by AI Elements)
pnpm dlx shadcn@latest add dialog sheet tabs tooltip hover-card command sonner collapsible table scroll-area
pnpm dlx shadcn@latest migrate cn
```
**Rule:** every installed component gets restyled to 04_DESIGN tokens in P1. Default shadcn styling (zinc, rounded-md, focus rings) must not ship unchanged. That default look is its own kind of slop.

### 4a. New find: Vercel **AI Elements** (a shadcn registry for AI UIs) · **Use as a skeleton, restyle fully**
Components that match our needs: **Chain of Thought** (step list with complete/active/pending states), **Task**, **Queue**, **Sources**, **Plan**, **Shimmer**.
```bash
pnpm dlx shadcn@latest add https://elements.ai-sdk.dev/api/registry/chain-of-thought.json
pnpm dlx shadcn@latest add https://elements.ai-sdk.dev/api/registry/sources.json
```
Use Chain of Thought's state logic as a starting point for `AgentLane`. Rename it (it shows *steps and public notes*, not thoughts), drop its shimmer, and restyle it completely.

---

## 5. vengenceui.com — animated marketing components · **Mostly skip**

**What it is:** 46 animated React components (displacement hovers, animated tooltips, scroll-driven cards, bento layouts, "scene fields"), installed via `npx shadcn@latest add @vengeanceui/[component]`.

**Verdict:** it's built for marketing sites, and our product surfaces follow the utility-only rule. At most:
- **Scene Fields (lines)**, restrained to hairline rules at 6% opacity, as a background texture for the `/method` hero only.
- **Folder Preview** as a reference (not an install) for how `/library` index cards could fan out on focus.

**Skip:** Glass Dock, Spotlight Navbar, displacement hovers, Kinetic Loader (a loader is exactly what we're replacing).

---

## 6. backgrounds.supply — gradient & AI background packs ($49) · **Don't use in-product**

Gradient and aurora backgrounds are banned by 04_DESIGN §2, and the paper grain is generated in CSS for free. **One legitimate use:** the *ASCII* or *Nocturne* collections for off-product marketing (a LinkedIn banner or the README hero image). It's optional and not worth buying for this project.

---

## 7. animos.app — motion templates for design showcases · **Use for the launch, not the product**

**What it is:** a browser-based template tool that turns screenshots or clips into looping showcase videos (MP4/WebM, up to 8K, 16:9 · 4:3 · 1:1 · 4:5 · 9:16). It's free and privacy-first (assets stay on your device).

**Use:** after P11, record the live investigation (Playwright video or a screen capture), drop it into a 9:16 template for a Reel or Short, and use 16:9 for the README and LinkedIn. The script is in `10_IDEAS.md` §3.

---

## 8. designmd.me — extract DESIGN.md from any site · **Use twice**

1. **P0:** extract the tokens from 1–2 moodboard sites for comparison. Never copy; use them only to sanity-check our scale and contrast choices.
2. **P11 (drift check):** run it on the deployed preview and diff the extracted tokens against `04_DESIGN.md`. Any unknown color or font means drift.

---

## 9. Other 2026 finds worth using

| Find | Why it matters for ACHP | Where |
|---|---|---|
| **React `<ViewTransition>` in Next.js 16** | Works in the App Router with no configuration; `transitionTypes` on `next/link` since 16.2. Powers the Desk → Case claim morph | P7 |
| **CSS scroll-driven animations** | Chrome 115+, Safari 26+; Firefox only behind a flag, so guard with `@supports` and use the Motion fallback for the gates | P6 |
| **Motion (`motion/react`)** | The new package name for Framer Motion; a hybrid WAAPI engine. Replace `framer-motion` | P1 |
| **Line boil via `feTurbulence` seed-stepping** (e.g. the `tomcreighton/boil` technique) | The hand-drawn "alive" quality without video assets | P8 |
| **MCP 2026-07-28 spec (stateless, `server/discover`) + the MCP Apps extension** | Your v2 PRD's MCP server could also return an **MCP App**: an interactive verdict card that renders inside Claude or other hosts. A standout portfolio signal | Post-kit (10_IDEAS #6) |
| **Dataviz validator** (the bundled `dataviz` skill's `validate_palette.js`) | Validated the Ledger credit/debit tokens for color-blind separation in both themes (04 §7.2) | P1, P5 |
| **Hugging Face Hub** (via the HF MCP): `ucsbai/liar` and PolitiFact-Hidden (arXiv 2508.00489, half-truths) | Datasets for validating QFI and missing-context detection (11 §5) | Post-P5 evaluation |
| **Opus 5.5 frontend guidance** | The model falls back to defaults (cream backgrounds, italic accent words, 01/02/03 labels, monospace labels, pill buttons) unless you name them. That's why 04_DESIGN §2 lists them | All UI phases |

---

## Sources checked for this kit (23 Sep 2026)

- ACHP paper (your NLP submission PDF): metric definitions (Sec. IV, eqs. 1–6), NIL weight matrix (Fig. 4), dashboard/radar/transparency figures (Figs. 9–12), calibration (Fig. 13), benchmark (Table III)
- Prior art for the Assay: counterfactual explanations for fake claims https://arxiv.org/abs/2206.04869 · ClaimVer https://arxiv.org/abs/2403.09724 · FACTS&EVIDENCE https://aclanthology.org/2025.naacl-demo.35 · uncertainty sources in fact-checking https://huggingface.co/papers/2505.17855 · half-truth detection https://huggingface.co/papers/2508.00489
- Tone and credibility research behind QFI: https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2025.1627522/full · https://arxiv.org/html/2505.08143v2 · https://www.nature.com/articles/s41599-022-01174-9
- Validation data: https://huggingface.co/datasets/ucsbai/liar

- impeccable: https://impeccable.style/ · https://impeccable.style/docs · https://github.com/pbakaus/impeccable
- transitions.dev: https://transitions.dev · https://transitions.dev/skill
- godly (for "goldly"): https://godly.design/
- shadcn/ui changelog: https://ui.shadcn.com/docs/changelog
- AI Elements: https://elements.ai-sdk.dev/ · https://github.com/vercel/ai-elements
- Vengeance UI: https://www.vengenceui.com/
- backgrounds.supply: https://backgrounds.supply
- animos: https://animos.app · https://ustack.app/products/animos
- designmd: https://designmd.me
- Next.js view transitions guide: https://nextjs.org/docs/app/guides/view-transitions · React `<ViewTransition>`: https://react.dev/reference/react/ViewTransition
- Scroll-driven animations support: https://caniuse.com/wf-scroll-driven-animations · MDN `animation-timeline`: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-timeline
- Motion for React: https://motion.dev/docs/react
- Line boil technique: https://camillovisini.com/coding/simulating-hand-drawn-motion-with-svg-filters · https://github.com/tomcreighton/boil
- MCP 2026-07-28: https://modelcontextprotocol.io/specification/2026-07-28 · https://modelcontextprotocol.io/specification/2026-07-28/server/discover
- Prompting Claude Opus 5.5: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5 · What's new: https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5
- Claude Code: https://code.claude.com/docs/en/sub-agents · https://code.claude.com/docs/en/model-config · https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more
