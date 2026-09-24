# ACHP Interface Upgrade Kit — "The Fact-Checker's Desk" (v2: silent, full-site, with the Assay)

A complete, staged upgrade kit for **theShivansh/ACHP** (live at achp-seven.vercel.app), written to be executed by **Claude Code on Opus 5.5**.

It turns the current neon "material-cyber" dashboard into an evidence-first product across the whole site. It rests on two ideas:
1. **Agent latency is never hidden behind a loader.** Each of the 7 agents works in plain sight, marking up the claim like a human fact-checker with a red pencil, and the result builds itself while you watch.
2. **The five scores are explained, not decorated.** The Consensus Truth Score (CTS), Perspective Completeness Score (PCS), Bias Impact Score (BIS), Narrative Stance Score (NSS) and Epistemic Position Score (EPS) get **the Assay**: nine new instruments and one CI tool, built on what the formulas actually do. For example, framing moves the overall score about 3× more than the factual attack score does, and calm wording can lift a refuted claim to "Mixed".

**What changed in v2:** the sound feature is gone (ACHP is silent, and a hook enforces it). There's a new `11_THE_ASSAY.md` plus tested reference code, the IA and screens now cover every route and retire every old screen and paper figure, there's a new P5 phase (12 phases in total), and the prototype is now the full site.

---

## What's in the box

| File | What it is | Who reads it |
|---|---|---|
| `00_MASTER_PROMPT.md` | Your brief, rewritten to be precise and tuned for Opus 5.5. Paste it to kick off. | You → Claude Code |
| `01_AUDIT.md` | UI/UX, trust and **metric** audit of the live site, repo and paper (§G), with file:line evidence, graded P0–P3 | You, Claude |
| `02_PRD.md` | Interface PRD: goals (incl. G7 metric clarity), non-goals (incl. audio), personas, requirements IF-01…IF-31, flows, metrics, risks | Claude, reviewers |
| `03_USER_STORIES.md` | 10 epics, 54 stories (E10 is the Assay), Gherkin acceptance criteria, traceability | Claude |
| `04_DESIGN.md` | Design system: direction, tokens (incl. validated chart tokens), type, components (incl. §7.1 Assay components), and the **banned-pattern list** | Claude (every UI phase) |
| `05_MOTION_SPEC.md` | Three motion languages (scroll story + friction, silent utility micro-interactions, stop-motion), Assay micro-interactions, reduced motion | Claude |
| `06_AGENT_STATE_SPEC.md` | Event protocol v2 (SSE), incl. `assay.computed`; the agent state machine, UI mapping, honesty rules, replay | Claude (backend + UI) |
| `07_IA_AND_SCREENS.md` | Full-site sitemap and wireframes for every route, plus the §1.1 table that maps every current screen and paper figure to its replacement | Claude |
| `08_REFERENCES.md` | Every reference site you gave (plus 2026 finds): take / skip / install, and sources | You, Claude |
| `09_ACCEPTANCE_AND_QA.md` | Definition of done, budgets, gates (Assay parity, ledger balance, Leverage Lint, vocabulary, silence), test matrix | Claude, CI |
| `10_IDEAS.md` | Scored ideation table (#17–#25 are the Assay ideas) and a Hinglish launch Reel script | You |
| `11_THE_ASSAY.md` | **New.** The metric instruments: full forms and formulas, computed findings, the instruments (§3.1–3.10), the Truth-first rule, the validation plan, novelty and related work | You, Claude |
| `reference/assay/` | **New.** `assay.py` (source of truth, stdlib only), `assay.ts` (port), `vectors.json`, 23 Python tests (incl. a parity test against the production `core_pipeline.py`), 14 node tests, `leverage_lint.py` | Claude, CI |
| `claude/` | **Drop-in Claude Code setup**: `CLAUDE.md`, `PHASES.md`, 12 phase prompts (P0–P11), 5 subagents, 4 skills, hooks (anti-slop incl. `no-audio`/`radar-chart`, stop gate) and a screenshot script | Copy into the repo |
| `prototype/achp-site.html` | **The full-site prototype**: Desk + story, live case (Report · Evidence · Assay · Trace), a quiet-falsehood case, blocked, Ask, Library, Runs + Integrity Map, Method + Assay Bench, Developers. Its numbers come from the real `assay.ts`. Open it in a browser | You, Claude |

---

## How to run it (15-minute setup, then ~3 weeks of phases)

```bash
# 1. In your ACHP repo root
git checkout -b feat/fact-checkers-desk

# 2. Copy the Claude Code setup and specs into the repo
cp -r <kit>/claude/.claude ./.claude
cp <kit>/claude/CLAUDE.md ./CLAUDE.md
mkdir -p docs/upgrade && cp <kit>/README.md <kit>/0*.md <kit>/1*.md docs/upgrade/
cp -r <kit>/claude/prompts docs/upgrade/prompts
cp <kit>/claude/PHASES.md docs/upgrade/PHASES.md
mkdir -p scripts/ui && cp <kit>/claude/scripts/shoot.mjs scripts/ui/
cp <kit>/prototype/achp-site.html docs/upgrade/
cp -r <kit>/reference ./reference
chmod +x .claude/hooks/*

# 3. Check the Assay against your real pipeline (parity must run, not skip)
ACHP_REPO=$PWD python -m pytest -q reference/assay
node --experimental-strip-types --test reference/assay/assay.test.mjs
python reference/assay/leverage_lint.py

# 4. Optional design tooling (see 08_REFERENCES.md)
npx impeccable install
npx skills add Jakubantalik/transitions.dev

# 5. Start Claude Code on Opus 5.5
claude
> /model            # pick Opus 5.5
> /effort medium    # default; PHASES.md says when to raise it (P2, P3, P5, P10)
```

Then paste `00_MASTER_PROMPT.md` once. After that, run each phase with:

```
Run phase P1 using the achp-phase-runner skill. Prompt: docs/upgrade/prompts/P1_foundation_tokens.md
```

Each phase ends at a **gate**: typecheck, lint, the anti-slop hook, Playwright screenshots at 390px and 1440px, and read-only subagent reviews (`design-critic`, plus `motion-auditor`, `a11y-auditor`, `event-contract-verifier` or `assay-auditor` where the phase says). `docs/upgrade/PROGRESS.md` tracks state, so a phase can resume after a context reset.

---

## The seven decisions this kit makes for you

1. **Latency becomes content.** The live run and the final report are the same page. Claims, evidence, pencil marks, the verdict stamp and the Assay arrive as real backend events. There are no skeletons and no fake % bars.
2. **Show the work, not the thoughts.** Agents emit short `public_note`s (≤140 characters, written on purpose for users), plus tool actions and outputs. Raw chain-of-thought is never rendered (ACHP X NFR-003).
3. **One ownable metaphor.** Each agent has an "ink" and a mark type, like a fact-checker's desk: the red pencil challenges facts, the blue pencil audits the narrative, the highlighter flags loaded language, the Judge stamps, and the Assay punches a five-mark hallmark. None of the neon, glass or grid tells of generic AI UIs.
4. **Motion has a job or it doesn't ship.** Three motion languages, each with an explicit trigger list. Scroll friction happens at most twice per story, and it's never scroll-jacking. The page is still at rest.
5. **Silence is a feature.** No audio anywhere. Every confirmation is visible and announced, which works on a bus, in a meeting and with a screen reader.
6. **Truth first for numbers.** The Judge's stamp is the headline. The composite is never shown alone; it only appears in context (the Two-Key sentence, the masking notice, the Tipping Point, the Ledger and the what-if Bench). When tone lifts a refuted claim, a masking notice says so. Metric math has one home, pinned by parity tests, and CI fails if a change makes the formula lean further on tone.
7. **Honesty is a feature.** Real traces replace fabricated logs. Mock verdicts are banned in production. "Unverifiable", "Missing context" and "Not checked" are first-class outcomes. Human agreement (r) is called agreement, never accuracy.

---

## Assumptions and notes

- `goldly.design` doesn't resolve (DNS failure as of 23 Sep 2026). I treated it as **godly.design**, the curated web-design inspiration gallery. If you meant something else, only `08_REFERENCES.md` §3 changes.
- The backend stays FastAPI on Hugging Face Spaces and the frontend stays Next.js 16 on Vercel. The kit extends your `ACHP_v2_PRD.md` and `ACHP_X` docs and is forward-compatible with the Evidence Verifier and Media Integrity agents.
- Chrome on your computer wasn't connected during the audit, so the live-site findings come from the page's server render and the repo source.
- **The paper and the repo disagree in places**, and the kit flags these rather than picking silently (`01_AUDIT.md` §G, `11_THE_ASSAY.md` §2.4–2.5):
  - The name: "Automated Claim & Hallucination Pipeline" in the paper vs "AI Claim Hardening Pipeline" in the site meta.
  - The headline accuracy: 68.3% in the repo and v2 PRD, 69.9% in the paper's text, and a Table III mean of 62.2%.
  - The NSS formula: the paper uses a separate narrative-alignment signal; the code uses 1 − framing.
  - Fig. 9's metrics compute to 0.532 (Mixed) beside a "Mostly false" verdict.
  - The kit's rule is to generate the headline number from `EVALUATION.md`, show both keys, and let the parity test pin whatever production does.
- The prototype's sources and signal values are illustrative (`.example` domains, with a banner saying so). The formulas turning signals into metrics are production's.
