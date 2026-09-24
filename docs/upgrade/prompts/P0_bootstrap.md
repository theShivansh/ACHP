# P0 — Bootstrap & baseline

**Effort:** medium · **Mode:** plan mode first · **Stories:** none (setup) · **Est.:** 0.5 day

<context>
You're starting the "Fact-Checker's Desk" interface upgrade of ACHP. The specs are in `docs/upgrade/` (README, 00–11, PHASES.md, prompts/), and the metric reference implementation is in `reference/assay/`. The visual target is `docs/upgrade/achp-site.html`, a self-contained full-site prototype with simulated events (hash routes `#/`, `#/case`, `#/case/quiet`, `#/blocked`, `#/ask`, `#/library`, `#/runs`, `#/method`, `#/developers`). Its metric numbers come from the real `assay.ts`. Open it with Playwright and screenshot it so you know what we're aiming for.
</context>

<goal>
Establish the ground truth before changing any product code: confirm or refute each audit finding, capture the baseline, and create the working files that later phases depend on.
</goal>

<tasks>
1. Read `docs/upgrade/README.md`, `01_AUDIT.md`, `02_PRD.md`, `PHASES.md` and `CLAUDE.md`. Skim 04–07 so you know where the details live.
2. Verify every **P0 and P1** finding in `01_AUDIT.md` (sections A–E **and G**, the metric findings) against the current code. For each, record in `docs/upgrade/PROGRESS.md` under "P0 verification": `A1 confirmed: <file:line evidence>` or `refuted: <why>`. Line numbers may have drifted, so re-locate them.
3. Create `docs/upgrade/PROGRESS.md` with a checklist section per phase (P0–P11), each copied from the stories in PHASES.md, plus a `Decisions` log and a `Deferred` list.
4. Install the Playwright browsers only if they're missing (check first). Add `scripts/ui/shoot.mjs` (already copied) dependencies to the root `package.json` devDependencies: `playwright`.
5. Baseline capture: run the current web app locally against the live backend (`NEXT_PUBLIC_API_URL=https://theshivansh-achp-api.hf.space`), then `node scripts/ui/shoot.mjs --phase P0-baseline --routes /`. Also screenshot the prototype: `node scripts/ui/shoot.mjs --phase P0-target --url "file://$PWD/docs/upgrade/achp-site.html#/case,file://$PWD/docs/upgrade/achp-site.html#/case/quiet" --at done --full`, then the static routes with `--url "file://$PWD/docs/upgrade/achp-site.html#/,file://$PWD/docs/upgrade/achp-site.html#/runs,file://$PWD/docs/upgrade/achp-site.html#/method" --full` (no `--at done`: those routes have no run). Record a local Lighthouse mobile score for `/` if the Lighthouse CLI is available. If it isn't, note that and move on.
6. Moodboard: create `docs/upgrade/moodboard/README.md` with 9 slots (3 editorial/newsroom, 3 annotation/markup, 3 calm data products) and a "what to borrow" line each. Leave the image slots for me to fill from godly.design. Don't download images from the web.
7. Fixture plan: write `docs/upgrade/fixtures-plan.md` listing the fixture runs we'll record in P2 (exercise-mixed, all-supported, contradicted-strong, missing-context, unverifiable, failed-midway, blocked) and in P5 (quiet-falsehood, true-but-loaded, paper-fig9-metrics), with the claim text for each. Use neutral claims.
7b. **Assay reference check:** copy `reference/assay/` from the kit into the repo root, then run `ACHP_REPO=$PWD python -m pytest -q reference/assay` and `node --experimental-strip-types --test reference/assay/assay.test.mjs`. The parity test must **run and pass** against today's `core_pipeline.py`. If it fails, the formulas changed since the kit was written: record the diff in PROGRESS.md before anything else.
8. Run the anti-slop scanner across `apps/web` to get the baseline: `node .claude/hooks/anti-slop-check.mjs --all --summary`. (The kit author measured 1,103 hits on 23 Sep 2026: inline-style 410, neon-cyan 226, banned-font 169, mono-label 69, icon-font 55, …, radar-chart 4) Record the totals per rule in PROGRESS.md. This is the baseline we burn down to 0 by P10. The per-edit hook only reports *new* hits, so touching legacy files won't flood you.
</tasks>

<constraints>
- No product code changes in this phase (docs, scripts and devDependencies only).
- Don't call write endpoints on the live backend. `/health` is fine.
</constraints>

<done_when>
PROGRESS.md exists with the verified audit table, the baseline scores, the anti-slop baseline, and the phase checklists; the baseline and target screenshots are in `docs/upgrade/screens/`; the moodboard and fixture plan files exist; one commit: `chore(upgrade): P0 baseline and progress tracking`.
</done_when>

<report>
Reply with: which audit findings were confirmed or refuted, the baseline numbers, and anything that changes the plan for P1–P2.
</report>
