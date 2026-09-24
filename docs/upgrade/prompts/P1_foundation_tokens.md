# P1 — Foundation: tokens, type, primitives, tooling

**Effort:** medium · **Mode:** plan mode first · **Stories:** S1.4 (partial) · **Requirements:** IF-18 · **Est.:** 1 day
**Read first:** `docs/upgrade/04_DESIGN.md` (all), `05_MOTION_SPEC.md` §1 and §3.2, `CLAUDE.md`

<goal>
Lay the design and tooling foundation that every later phase builds on, without breaking the current UI. New work renders only under `NEXT_PUBLIC_FF_DESK=1`.
</goal>

<tasks>
1. **Tooling (apps/web):** add the scripts `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `test:e2e` (`playwright test`). Add devDependencies: vitest, @vitest/coverage-v8, @testing-library/react, jsdom, @playwright/test, @axe-core/playwright. Create `vitest.config.ts` and `playwright.config.ts` with the 5 projects from `09 §6`.
2. **Packages:** replace `framer-motion` with `motion` (imports become `motion/react`) and fix the existing imports. Run `pnpm dlx shadcn@latest init` (CSS variables mode), then `pnpm dlx shadcn@latest migrate cn`. Add: dialog, sheet, tabs, tooltip, hover-card, command, sonner, collapsible, table, scroll-area.
3. **Fonts:** load Newsreader (variable, with the opsz axis), Public Sans (variable) and Kalam (400, 700; `preload: false`) via `next/font/google` in `app/layout.tsx`, exposed as CSS variables. Remove both Google Fonts `@import`/`<link>` tags and the Material Symbols font entirely.
4. **Tokens:** rewrite `app/globals.css`:
   - `@theme` holds the color tokens (light + dark via `[data-theme="dark"]` and `prefers-color-scheme`), the type scale, spacing, radii, elevation and motion tokens exactly as in 04 §3–5 and 05 §1.
   - The paper grain utility `.paper` (an inline SVG data-URI `feTurbulence` at 3% opacity on `--sheet`).
   - The boil keyframes and classes from 05 §3.2, and the global reduced-motion rules from 05 §6.
   - **Keep** the legacy classes the current pages use, moved into `app/legacy.css`, so the old UI doesn't break until P9 removes it.
5. **Restyle the shadcn primitives** in `components/ui/*` to the tokens: button radius 6px (no `rounded-full`), a 2px focus outline with offset, no zinc defaults, sheets on `--sheet`, and the desk chrome on `--desk-raised`. Add a `Chip` (4px radius) and a `StatusChip` component.
6. **BoilDefs:** add `app/_components/BoilDefs.tsx` (05 §3.2) and render it once in the root layout.
7. **Agent registry:** create `lib/agents.config.ts` mapping the server agent ids (04 §6) → `{displayName, ink, glyph, markKind}`, with placeholder glyph components in `components/glyphs/` (simple strokes for now; P8 replaces them). Include the future `evidence_verifier` and `media_integrity` entries. No model names.
8. **Contrast test:** `lib/__tests__/tokens.contrast.test.ts` parses the token values from `globals.css` and asserts the AA ratios listed in 04 §3 for light and dark.
9. **Flagged shell:** `app/(desk)/layout.tsx` with the desk chrome (wordmark, nav, a placeholder StatusChip, the theme toggle), active only when `NEXT_PUBLIC_FF_DESK=1`; otherwise the current page renders unchanged. A placeholder `app/(desk)/case/[id]/page.tsx` shows a sheet with "Case {id}" so P3 has a home.
</tasks>

<constraints>
- Banned patterns: 04 §2. In particular, no cream or off-white backgrounds, no italic accent words in headings, no "01/02/03" labels, no monospace labels, no pill buttons, no glow, no glass, no gradients.
- Don't delete the current components yet (P9 does). Don't change `apps/api`.
- Keep the bundle lean: no icon fonts; Lucide only for UI icons.
</constraints>

<verification>
- `pnpm -C apps/web typecheck && pnpm -C apps/web lint && pnpm -C apps/web test` are green.
- `NEXT_PUBLIC_FF_DESK=1 pnpm -C apps/web dev`, then `node scripts/ui/shoot.mjs --phase P1 --routes /case/demo-shell`. Look at the 390 and 1440 captures in light and dark.
- Without the flag, the current UI still loads and a claim can still be analyzed (a manual smoke test against the live backend).
- Delegate to `design-critic`: "Review P1 screenshots for token fidelity and banned patterns."
</verification>

<done_when>
All the tasks are checked in PROGRESS.md, the gates are green, and the commits are split logically (tooling · packages · fonts+tokens · primitives · registry+shell).
</done_when>
