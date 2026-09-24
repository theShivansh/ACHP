---
name: achp-phase-runner
description: Runs one phase (P0–P11) of the ACHP "Fact-Checker's Desk" upgrade end to end — resume from PROGRESS.md, plan, implement in small commits, verify with tests, screenshots and reviewer subagents, then record gate evidence. Use whenever asked to run, continue or resume a phase.
---

# Running an ACHP upgrade phase

You'll be given a phase id and a prompt file in `docs/upgrade/prompts/`. Follow this procedure. The phase prompt supplies the *what*; this skill supplies the *how*.

## 1. Orient (read, don't write)
1. Read `docs/upgrade/PROGRESS.md`. If this phase has checked items, **resume from the first unchecked item**. Don't redo finished work; verify it's still green instead.
2. Read the phase prompt fully, then every file in its "Read first" line.
3. Explore the code the phase touches, including the neighbors the prompt doesn't name (types, callers, tests, styles). Use what you find. For wide searches, delegate to the Explore subagent and restate any rule it must follow (Explore doesn't load CLAUDE.md).

## 2. Plan (in plan mode)
Produce a compact plan: the files to create or change, the stories covered (ids), the tests you'll write first, the risks, and the commit breakdown. Flag anything that contradicts `04_DESIGN.md`, `05_MOTION_SPEC.md` or `06_AGENT_STATE_SPEC.md`. Resolve it in favor of the spec, or log a Decision with the reason if the spec is wrong.

## 3. Execute
- Write the tests alongside or before the code where the AC is testable.
- Commit per logical unit: `type(scope): summary [story ids]`.
- The PostToolUse anti-slop hook runs on every edit. If it reports violations, fix them now; don't accumulate them. If a flagged line is a legitimate exception, add `slop-allow: <reason>` in a comment on that line and log it under Decisions.
- Keep status notes brief and in the same message as your next action. Don't stop to ask unless a decision is genuinely mine (see CLAUDE.md).

## 4. Verify (the gate)
1. `pnpm -C apps/web typecheck && pnpm -C apps/web lint && pnpm -C apps/web test`, plus `pytest -q` for backend phases, plus the e2e projects named in the prompt.
2. Screenshots: `node scripts/ui/shoot.mjs --phase <Pn> …` as the prompt specifies. **Open and look at them yourself** (390 and 1440, light and dark, reduced) before delegating. Fix the obvious issues first.
3. Delegate the reviews named in the prompt (`design-critic`, `motion-auditor`, `a11y-auditor`, `event-contract-verifier`). Pass them the phase id and the screenshot folder. Fix every P0/P1; log the P2/P3 in PROGRESS.md → Deferred.
4. Re-run the failed gates until green. If something can't go green, stop, and write up exactly what's blocking it and the options.

## 5. Record
Update `docs/upgrade/PROGRESS.md`:
```
## Pn — <name>  ✅ <date>
- [x] task … (commit abc123)
Gate evidence: typecheck ✓ lint ✓ unit 42/42 ✓ e2e desktop-light ✓ mobile-light ✓ · screenshots: docs/upgrade/screens/Pn/ · critic: 0 P0, 0 P1 (3 P2 deferred)
Decisions: Decision: <x> because <y>
Deferred: …
```
Then send a short report: what shipped, what's deferred, what needs my decision.

## Completion condition
The phase is complete only when every task in its prompt is checked, every gate is green, and PROGRESS.md holds the evidence. A turn that ends while tasks remain open isn't the end of the phase: continue with the next open item.
