# The Fact-Checker's Desk: what changed

The web interface was rebuilt phase by phase (P0 to P11). This file lists what shipped, with the story ids from
`03_USER_STORIES.md`. The evidence for each phase (gates, screenshots, decisions, deferrals) is in `PROGRESS.md`.

## The idea in one paragraph

The old site faked its progress (a percentage bar and invented log lines) and led with a score. The new one is a
projection of server events: a desk with a sheet of paper on it, seven agents marking up the message you pasted, the
Judge's stamp as the headline, and every claim-level statement tied to a source quote that is verbatim and in the log.
A failed run shows an error, never a verdict. ACHP is silent.

## By epic

### Event protocol and backend (P2, Groq runtime)
- S1.1 `POST /runs` answers 202 in under 300 ms. S1.2 SSE with resume by `Last-Event-ID` or `?since=`. S1.3 a finished
  run replays from `events.json`.
- S1.4 one `RunEventBus`; every emission goes through it; `run.started.agents[]` carries the agents and the model that
  served. The UI hard-codes no model or agent metadata.
- S1.5 the Trace tab is the real event log, and its export is `events.json` verbatim. The fake logs and the percentage
  bar are deleted.
- S1.6 failures are plain sentences (no provider errors, no model ids). No verdict can follow a failure.
- S1.7 public notes are validated (at most 140 characters) and fall back to deterministic templates.
- One shared Groq runtime (strict JSON schema, no chain-of-thought, queue and retry), three model calls per run, a
  grounded evidence pack (unknown ids and non-verbatim quotes are dropped), and memory tiers.

### The live investigation board (P3)
- S3.1 lanes from events. S3.2 the live action line. S3.3 the parallel group. S3.4 strips as parts arrive. S3.5 marks on
  the exact spans.

### Verdict, evidence, share (P4)
- S4.1 the verdict vocabulary in one place (`lib/verdict.ts`). S4.2 stamps. S5.1 evidence cards with verbatim quotes.
  S5.2 span-to-card linking. S6.1 the share bar (copy summary, copy link, share, print or save as PDF). S6.2 titles and
  social previews per case.

### The Assay: the instruments (P5)
- S10.1 the Hallmark. S10.2 Two-Key (Judge and formula). S10.4 the Integrity Ledger. S10.5 the Tipping Point. The
  Assay tab, the masking notice, `MetricTerm` (a metric is spelled out on first use). S10.10 Leverage Lint in CI.
  Server and client copies of the formula are pinned to the reference by parity tests.

### Scroll story and replay (P6)
- S7.1 chapters from the log and `?replay=1`. S7.2 the challenge gate and the rail, with "Skip to verdict" always
  available. S7.3 reduced motion gives a static document.

### Micro-interactions (P7), silent
- S2.4 the Desk-to-case morph. S9.2 visible confirmations (copy, share, download, failed run, verdict landed) announced
  in a live region. Evidence-to-span linking. Token hygiene test for every duration and easing.

### Stop-motion layer (P8)
- Hand-made glyphs and stepped marks, stamps, scissors, a paperclip, the cold-start lamp. They play only on arrival.
  True stillness when idle (0 running animations 2 s after a run completes). Reduced motion honoured.

### The full site (P9, P9.5)
- S2.1 the Desk. S8.1 Ask a library. S8.2 Library and library detail. S8.3 Runs, with the Integrity Map. S8.4 Method.
  S8.5 Developers: REST, events and **the MCP server** (`apps/mcp`, FastMCP: `check_claim`, `start_check`,
  `get_check`, `get_check_events`, `list_libraries`, `ask_library`, `search_library`, `backend_status`). S8.6 and
  S10.9 the blocked state: a graphite "Not checked" stamp, no metrics, no number.
- ACHP Bench (`bench/`): 240 checks over four suites (AVeriTeC dev sample, safety, metamorphic, abstention), a
  resumable runner, a stored gzipped log per check and an offline scorer. Measured results lead `EVALUATION.md` and
  `/method` only when every item has been tried and at least 90% of each suite has a verdict. Until then the earlier
  figures lead, labelled "not re-run".
- The old interface, `html2canvas` and `jspdf` are gone.

### Hardening (P10)
- S9.1 a polite announcer (one full sentence per two seconds at most). Axe on every page in light and dark (0 serious
  or critical). Edge cases: a 2,000-character message, one part and eight parts, nothing settled, a failed challenger,
  long and right-to-left sources, 200% zoom, forced colours.
- S9.3 performance: Motion, the command menu, the phone menu, the trace and the method notes load on demand;
  `sonner` and `recharts` removed; the Desk is server-rendered; Lighthouse CI. Home JS fell from 293 KB to 215 KB and
  the case page from 393 KB to 289 KB. The original mobile budgets (09 section 3) were **not** met and are no longer
  a release gate (see PROGRESS.md, P11).
- A Content-Security-Policy, Referrer-Policy and Permissions-Policy on every route, built from the backend's address.
  Dialogs return focus to what opened them.
- A CI workflow for every gate (`.github/workflows/web.yml`).

### Polish and ship (P11)
- A production build with `NEXT_PUBLIC_API_URL` unset talks to the hosted backend instead of `localhost:8000`.
- Copy pass against 04 section 9: no buzzwords, no exclamation marks. One "recorded example" notice instead of two,
  no stray dot before "Date not given", a next step on the blocked notice.
- README: the new interface, an architecture diagram with the event log, how to run the recorded cases, links to
  `/method` and `/developers`. A 7-second recording of a run in `docs/upgrade/launch/`.
