# PHASES — staged execution plan for Claude Code (Opus 5.5)

**Model:** Opus 5.5 (`/model`). **Effort:** `medium` is the default and, per Anthropic's guidance, matches or beats Opus 5 at `high` on coding. Raise it to `high` only where marked. Don't use `max` unless you've measured a gain on that phase. **Mode:** start every phase in **plan mode**, approve the plan, then execute.

| Phase | Goal | Stories | Effort | Est. | Gate (beyond the DoD in 09 §1) |
|---|---|---|---|---|---|
| **P0** Bootstrap & baseline | Verify the audit (incl. §G metric findings), set up PROGRESS.md, baseline screenshots and Lighthouse, moodboard, fixture plan, run the reference Assay tests against the repo | — | medium | 0.5d | Baseline artifacts committed; every audit P0 confirmed or refuted with evidence; `pytest reference/assay` green with `ACHP_REPO` set (parity) |
| **P1** Foundation | Tokens (incl. chart tokens), fonts, shadcn restyle, `motion` + `cn` migration, BoilDefs, agents.config, test tooling | S1.4 (partial) | medium | 1d | Token contrast test green; the old UI still works; the anti-slop hook is clean on the new files |
| **P2** Event protocol v2 | Backend bus/store/`/runs`/SSE resume + emissions + public-note validation; frontend types/reducer/hook/announcer; delete fake progress, logs and mocks | S1.1–S1.7 | **high** | 2d | pytest contract suite, reducer tests, honesty greps (09 §5) green; `event-contract-verifier` passes |
| **P3** Live investigation board | `/case/[id]` live layout, lanes, sheet, strips, span marks (smooth v1), tray, run states, aria-live, mobile strip | S3.1–S3.7, S9.1 | **high** | 2d | `case.live`/`resume`/`failure` e2e green; `design-critic` has no P0/P1 |
| **P4** Verdict, evidence, share | Verdict vocabulary, stamps v1, confidence band, evidence cards, quote vs interpretation, Voices not heard, tabs, Trace, Method drawer, SSR, OG image, share | S4.1–S4.5, S5.1–S5.4, S6.1–S6.3 | medium | 1.5d | `/impeccable critique case` + `design-critic` clean; no `%` in the Sharer view |
| **P5** The Assay | Port the reference to `apps/api/achp/assay` + `assay.computed`; `apps/web/lib/assay`; Hallmark (replaces radar, OG), Two-Key, masking notice + Truth-first rule, Integrity Ledger, Tipping Point, Lineage, Agreement Dial, Bench drawer; Leverage Lint in CI | S10.1–S10.8, S10.10 | **high** | 2d | Parity + ledger-balance + vector tests green in both stacks; `assay-auditor` passes; the 3 masking/two-key fixtures render exactly as 11 §3 |
| **P6** Scroll story & replay | `chapters.ts`, replay mode, friction gates, rail + skip, Motion fallback, reduced motion | S7.1–S7.3 | medium | 1d | `replay.spec` green in 3 engines + reduced motion |
| **P7** Micro-interactions (silent) | ViewTransition morph, tabs, tooltips, copy, shake, number roll (counts only), span linking, Assay micro-interactions (05 §4.2) | S2.4, S5.2, S9.2 | medium | 0.5d | `motion-auditor` passes; `transitions refine` has no stray durations; `no-audio` rule clean |
| **P8** Stop-motion layer | Hand-drawn glyphs, stepped marks, boil, stamps, Hallmark punches, Two-Key keys, scissors, clip, highlighter, tally, lamp | S9.4 | medium | 1d | The stillness test is green; low-end gating works; `motion-auditor` passes |
| **P9** Full-site IA & pages | `/` Desk + story, `/ask`, `/library` + `/library/[id]`, `/runs` + Integrity Map, `/method` (metrics with full forms, Lineage, Agreement, Bench), `/developers`, ⌘K, status chip, blocked state, retire every old screen (07 §1.1) | S2.1–S2.3, S8.1–S8.6, S10.9 | medium | 2d | All routes pass the screenshot review on mobile + desktop; the 07 §1.1 table is fully checked |
| **P10** Hardening | A11y, perf budgets, Lighthouse CI, e2e matrix, edge cases, `/impeccable audit` + `harden` | S9.1, S9.3 | **high** | 1d | axe clean; budgets met; all Playwright projects green |
| **P11** Polish & ship | Final critique, `/impeccable polish`, designmd drift check, docs, preview → prod, launch capture | — | medium | 0.5d | Every gate green; PROGRESS.md closed out |

**Total:** ~15 working days. P2 can start in parallel with P1 in a separate worktree (backend vs frontend files don't overlap). P3 depends on both. The backend half of P5 (port + event) can start right after P2.

## Why this order
1. **Trust before taste (P2 before P3–P8).** The event log is what makes the evolving states *real*. Building the visuals first would recreate the fake-progress problem.
2. **Meaning before motion (P5 before P6–P8).** The Assay decides what the numbers *say*; motion only shows it. The replay (P6) and stop-motion (P8) both reuse the Hallmark and Two-Key.
3. **Structure before motion (P3–P5 before P7/P8).** Every animation decorates a state that already exists and already works without motion. That's also what reduced motion gets.
4. **Story after substance (P6 after P4/P5).** The replay is built from real stored events, so it needs P2–P5.

## Per-phase ritual (enforced by the `achp-phase-runner` skill)
1. Read `PROGRESS.md` → resume from the first unchecked item.
2. Plan mode: list the files to touch, the stories covered, the risks and the tests to write. Keep it tight.
3. Execute in small commits. Hooks run on every edit.
4. Verify: tests → `shoot.mjs` → look at the screenshots → delegate to the reviewer subagent(s) → fix the P0/P1 findings.
5. Update `PROGRESS.md` (checklist, decisions, gate evidence) → final commit → a short report to me: what shipped, what's deferred, what needs my decision.
