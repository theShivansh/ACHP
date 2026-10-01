# ACHP — project memory for Claude Code

ACHP is an evidence-grounded, multi-agent claim-verification system. A FastAPI pipeline of 7 agents (Gatekeeper/security, Retriever, Proposer, Adversary A, Adversary B, NIL layer with 5 sub-checks, Judge) sits behind a Next.js 16 frontend. We're executing the **"Fact-Checker's Desk" interface upgrade**. Its specs live in `docs/upgrade/`.

## Repo layout
- `apps/web`: Next.js 16 App Router, React 19.2, Tailwind v4 (`app/`, `components/`, `lib/`)
- `apps/api`: FastAPI (`main.py`), pipeline in `achp/core/core_pipeline.py`, agents in `achp/agents/`, NIL in `achp/nil/`, KB in `achp/kb/`, the Groq runtime + model registry in `achp/llm/` (every model call goes through it), prompt contracts in `achp/prompts/`, evidence pack + grounding in `achp/evidence/`, memory tiers in `achp/memory/` (see `docs/upgrade/12_GROQ_RUNTIME.md`), the Assay in `achp/assay/` (added in P5, a copy of `reference/assay/assay.py`)
- `apps/mcp`: ACHP as an MCP server (FastMCP), a client of the public REST API; `scripts/gen_mcp_manifest.py` writes what /developers lists
- `bench/`: ACHP Bench (suites, a resumable runner against a live backend, stored gzipped event logs, an offline scorer); `scripts/gen_evaluation.py` turns `bench/results/latest.json` into EVALUATION.md and the site's benchmark
- `reference/assay/`: the metric instruments' reference implementation (Python source of truth + TS port + `vectors.json` + tests + `leverage_lint.py`)
- `docs/upgrade/`: PRD, stories, DESIGN.md, motion spec, event protocol, IA, QA, phase prompts, `PROGRESS.md`
- `scripts/ui/shoot.mjs`: Playwright screenshots + stillness check

## Commands
- Web dev: `pnpm -C apps/web dev` (port 3000) · build: `pnpm -C apps/web build`
- Web checks: `pnpm -C apps/web typecheck` · `pnpm -C apps/web lint` · `pnpm -C apps/web test` · `pnpm -C apps/web test:e2e` (the scripts are added in P1)
- API dev: `cd apps/api && uvicorn main:app --reload --port 8000` · tests: `cd apps/api && pytest -q`
- Screenshots: `node scripts/ui/shoot.mjs --phase P3 --routes /,/case/fixture-exercise-mixed`
- Assay: `ACHP_REPO=$PWD python -m pytest -q reference/assay` (parity must run, not skip) · `node --experimental-strip-types --test reference/assay/assay.test.mjs` · `python reference/assay/leverage_lint.py`
- MCP: `cd apps/mcp && python -m pytest -q` · run: `pip install -e apps/mcp && achp-mcp` · after a tool change: `python scripts/gen_mcp_manifest.py`
- Bench: `python bench/run.py --tag <date>` (real runs on the live backend, about 40s each) · `python bench/score.py --tag <date>` · `python scripts/gen_evaluation.py` · `python -m pytest -q bench reference/benchmark`
- Live backend (read-only checks): `https://theshivansh-achp-api.hf.space/health`

## Non-negotiables (the reason each one exists is in brackets)
1. **The UI is a projection of server events.** No client timer may advance or invent progress. [The old UI faked a % bar and logs, and reviewers lose trust fast.]
2. **Show work, never thoughts.** Render agent actions, `public_note`s (validated, ≤140 chars) and outputs. Never request, stream or render chain-of-thought. [ACHP X NFR-003]
3. **No hard-coded model or agent metadata in UI components.** It comes from `run.started.agents[]`; visual identity lives in `apps/web/lib/agents.config.ts`.
4. **No verdict without a real run.** Mocks exist only in `?demo=1`, with a visible watermark. A failure shows an error, never a verdict.
5. **Every claim-level statement cites evidence ids present in the event log.** Quotes are verbatim. Interpretation is styled separately.
6. **Design comes from `docs/upgrade/04_DESIGN.md`.** Read §2 (banned patterns) before any UI change. If a request conflicts with it, follow the design file and say so.
7. **Motion follows `docs/upgrade/05_MOTION_SPEC.md`.** Each animation needs a job. Reduced motion is honored. The page is fully still when idle.
8. **ACHP is silent.** No audio APIs, files, packages or sound toggles. [Users check claims in public; every confirmation must be visible and announced.]
9. **Truth first for metrics (`docs/upgrade/11_THE_ASSAY.md` §4).** The Judge's stamp is the headline; the composite is never shown alone; masking gets a notice; every metric shows its full form on first use. Metric math lives only in the Assay module, pinned to the reference by parity tests. [Our own formulas let calm wording lift refuted claims; the UI must not hide that.]

## Conventions
- TypeScript strict. Components are server components by default; use `'use client'` only where state or effects need it.
- Styling: Tailwind v4 utilities + tokens in `app/globals.css` `@theme`. No new inline `style={{}}` except CSS custom properties (`style={{'--len': n}}`). No JS hover styling.
- Primitives: shadcn/ui (restyled) in `components/ui`, AI Elements skeletons restyled in `components/case`. Class merging uses `cn` from the `cn` package.
- Motion: CSS first; `motion/react` for springs, `useScroll` fallbacks and layout; React `<ViewTransition>` for route and shared-element transitions.
- Run-state logic lives only in `lib/runs/reducer.ts` (pure, unit-tested). Components read slices.
- Backend: pydantic models for every event payload; `achp/events/` owns the bus and the store; every emission goes through `RunEventBus.emit`.
- Feature flags: `NEXT_PUBLIC_FF_IMAGE_INTAKE`, `NEXT_PUBLIC_FF_HUMAN_REVIEW`. (`NEXT_PUBLIC_FF_DESK` is gone: the Desk is the site.)
- Commits: conventional, with story ids, e.g. `feat(case): per-strip stamps [S4.1]`.

## How we work in this repo
- Work proceeds in phases P0–P11 (`docs/upgrade/PHASES.md`). Use the `achp-phase-runner` skill. Keep `docs/upgrade/PROGRESS.md` current: the checklist per phase, one-line decisions ("Decision: X because Y"), and the gate evidence.
- Before editing, explore the files the phase touches, including ones the prompt doesn't name (types, callers, tests), and use what you find.
- After UI changes: run `shoot.mjs`, look at the screenshots yourself, then delegate a review to the `design-critic` subagent. Use `motion-auditor`, `a11y-auditor`, `event-contract-verifier` and `assay-auditor` where the phase says so. Load the `achp-assay` skill before touching anything that shows CTS · PCS · BIS · NSS · EPS.
- Stop and ask only for decisions that are genuinely mine (brand choices not covered by DESIGN.md, deleting user data, changing public API contracts beyond 06_AGENT_STATE_SPEC). Otherwise keep going, and put status notes in the same message as your next action.
- Never commit secrets. The `GROQ_API_KEY` etc. stay server-side; nothing secret goes in `NEXT_PUBLIC_*`.
