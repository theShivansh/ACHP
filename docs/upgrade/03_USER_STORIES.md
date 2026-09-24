# 03 — Epics & User Stories

Personas: **S** = Concerned Sharer · **R** = Technical Reviewer · **D** = MCP/API Developer · **M** = Maintainer
Each story maps to PRD requirements (IF-xx) and to the phase that builds it (Pn, see `claude/PHASES.md`).

---

## E1 — Honest event layer (P2)

**S1.1 · M · P0 · IF-01** — As the maintainer, I want starting a run to return immediately with a run id, so that the UI can show the case page at once instead of waiting on a 60s request.
```gherkin
Given the backend is warm
When the client POSTs /runs with a valid claim
Then the response is 202 within 300ms with run_id, events_url and case_url
And the pipeline continues in the background
```

**S1.2 · S · P0 · IF-01** — As a sharer on a flaky mobile connection, I want the live view to resume where it left off after a dropout, so that I don't lose the investigation.
```gherkin
Given a run is in progress and I have received events up to seq 14
When my connection drops for 5 seconds and reconnects
Then the stream resumes from seq 15 with no duplicates and no gaps
```

**S1.3 · R · P0 · IF-01/IF-06** — As a reviewer opening a shared link after the run finished, I want to see the same investigation, so that the result is reproducible.
- AC: `GET /runs/{id}/events` on a completed run replays all events, then closes. The UI renders the identical final state (reducer snapshot test).

**S1.4 · R · P0 · IF-03** — As a reviewer, I want agent names and models to come from the actual run, so that the UI never lies about what ran.
- AC: `grep -rE "DeepSeek|Llama|gpt-oss|Qwen" apps/web/components` returns nothing. The lane details show `run.started.agents[].model`.

**S1.5 · M/R · P0 · IF-09** — As the maintainer, I want a Trace tab that lists the real events and exports them as JSON, so that I can debug any verdict.
- AC: Trace rows = the event count; the export file equals `/runs/{id}/events.json`; `buildDetailedLogs` is deleted.

**S1.6 · S · P0 · IF-12** — As a sharer, I want to be told when the checker failed rather than get a made-up answer, so that I never forward a fake verification.
```gherkin
Given NODE_ENV=production and no ?demo=1
When the backend returns 5xx or is unreachable
Then I see an error card with Retry and no verdict stamp anywhere on the page
```

**S1.7 · M · P1 · 06 §5** — As the maintainer, I want invalid public notes replaced by deterministic templates, so that no model rambling or reasoning leaks into the UI.
- AC: A unit test covers notes >140 chars, a URL, "Let me think…", and an unknown evidence id → each falls back to the template.

## E2 — The Desk (`/`) (P9)

**S2.1 · S · P0 · IF-15** — As a sharer, I want one obvious place to paste the message, so that I can check it without learning the tool.
- AC: The input is focused on load (desktop only). ⌘/Ctrl+Enter submits. Submit navigates to `/case/[id]` with the claim morph (View Transition).

**S2.2 · S · P1 · IF-15** — As a first-time visitor, I want example claims, so that I can see how it works before I have my own.
- AC: 3 neutral examples; clicking one fills the input (it doesn't auto-submit).

**S2.3 · S · P0 · IF-11** — As a visitor on a cold backend, I want to know it's waking up and roughly how long, so that I don't think it's broken.
```gherkin
Given /health has not responded for 2s after page load
Then the status chip shows "Waking the desk · Ns" with a live elapsed counter
And submitting a claim keeps the claim on the sheet and starts automatically when ready
```

**S2.4 · S · P1 · IF-10** — As a sharer who pasted too little, I want a clear, gentle correction, so that I can fix it.
- AC: Fewer than 12 characters → a single 240ms shake + helper text "Paste the full sentence you want checked." (focus stays in the input, `aria-describedby` points at the helper).

**S2.5 · S · P2 · IF-14** — As a sharer with only a screenshot, I want to drop the image and confirm the extracted text, so that bad OCR doesn't produce a wrong verdict.
- AC: Behind `FF_IMAGE_INTAKE`. The OCR text types onto the sheet, low-confidence words are dotted-underlined and editable, and nothing runs until I press Check it.

## E3 — Live investigation board (P3)

**S3.1 · S/R · P0 · IF-02** — As a user, I want to see each agent's state change as it really happens, so that waiting feels like watching work.
```gherkin
Given a run has started
When the server emits agent.started for retriever
Then the Clipper lane shows "Working" with its glyph boiling within 100ms of the event
And no lane changes state without a corresponding event
```

**S3.2 · S/R · P0 · IF-02** — As a user, I want a live one-line description of what each agent is doing, so that I understand the process.
- AC: The latest `agent.action` label+detail shows, truncated to one line with the full text in a tooltip. On `agent.done` it's replaced by the summary.

**S3.3 · R · P1 · IF-03** — As a reviewer, I want parallel agents visibly grouped, so that I can see the architecture.
- AC: Lanes that share `group` render inside a bracket labelled "In parallel". Their elapsed timers run at the same time.

**S3.4 · S · P0 · IF-04** — As a sharer, I want the message split into checkable parts as soon as they're known, so that I can start reading before the verdict.
- AC: On the first `claim.extracted` the scissors frames play once, then each strip enters. Strips are ordered by `source_span`.

**S3.5 · S · P0 · IF-04/IF-19** — As a sharer, I want challenges marked on the exact words they're about, so that I know which part is wrong.
- AC: `claim.marked.span` → a mark drawn over exactly those characters (Range rects). It re-measures on resize. If the span is invalid, the mark covers the whole strip and a note says "(whole part)".

**S3.6 · S · P0 · IF-02** — As a user, I want to know when something broke mid-run, so that I'm not stuck staring at a frozen screen.
- AC: 20s without an event or ping → "Lost connection at step N. Reconnecting…" → 3 retries → [Reconnect] [Re-run]. `agent.failed` shows on that lane only; the run continues if the server continues.

**S3.7 · S · P0 · IF-15/IF-16** — As a mobile user, I want a compact view of all agents that doesn't push the claim off-screen, so that I can follow both.
- AC: <768px: a sticky 56px lane strip (7 state dots + the current action). Tapping it opens the lanes in a bottom sheet. The sheet content never sits under the strip.

## E4 — Case sheet & verdict (P4)

**S4.1 · S · P0 · IF-05** — As a sharer, I want a verdict for each part of the message, so that I know what to believe and what not to.
- AC: Every strip gets one of Supported / Contradicted / Mixed / Missing context / Unverifiable, with a stamp and a text label (not color alone).

**S4.2 · S · P0 · IF-05/IF-07** — As a sharer, I want a short plain-words summary before any detail, so that I get the answer in seconds.
- AC: The summary sits directly under the claim: ≤2 sentences, no acronyms, reading grade ≤9 (checked with `text-readability` in a test).

**S4.3 · S · P0 · IF-05** — As a sharer, I want to know how strong the evidence is without a fake-precise percentage, so that I don't over-trust it.
- AC: A band (Strong/Moderate/Weak) + a 3-segment bar + a one-line reason from `confidence_reason`. There's no `%` character in the Sharer view (a test asserts it).

**S4.4 · S · P0 · IF-05** — As a sharer, I want "we couldn't verify this" to look different from "this is false", so that I don't mistake a gap for a debunk.
- AC: Unverifiable uses the graphite dashed-box treatment and the copy "No reliable source found for this part". Never red.

**S4.5 · R · P2 · IF-20** — As a reviewer, I want low-confidence or high-disagreement cases flagged for human review, so that the system knows its limits.
- AC: Behind `FF_HUMAN_REVIEW`: an Editor's desk callout when `confidence_band=weak` or the adversary disagreement is ≥0.4; the "Request review" button is stubbed.

## E5 — Evidence (P4)

**S5.1 · S/R · P0 · IF-05** — As a user, I want every source shown with the exact quoted words and where they came from, so that I can check it myself.
- AC: The card shows the domain, title, published date, the **verbatim quote**, the locator, the relation, and "Open source ↗" (`rel="noopener noreferrer"`).

**S5.2 · S · P1 · IF-10** — As a user, I want hovering or focusing a source to highlight the words it's about (and the reverse), so that I can see the connection.
- AC: The underline draws in ≤160ms; the unrelated strips dim to 60%. Keyboard focus triggers the same effect.

**S5.3 · S/R · P0 · IF-05** — As a user, I want ACHP's interpretation visually separate from the quoted evidence, so that I know what's source and what's model.
- AC: Quotes use Newsreader with a colored left rule; interpretation uses Public Sans `--ink-2` under the label "ACHP's reading". Both exist in the a11y tree with distinct labels.

**S5.4 · R · P1 · IF-05** — As a reviewer, I want freshness and verification status per source, so that I can judge its reliability.
- AC: "Published Mar 2021 · older source" appears when freshness is <0.4. The verifier status is ✓/✗/pending with a text label.

## E6 — Share & permalink (P4/P9)

**S6.1 · S · P0 · IF-06** — As a sharer, I want a link that always shows this case, so that I can send it to the family group.
- AC: A refresh during or after the run restores the state. Opening it on a second device mid-run shows live progress.

**S6.2 · S · P1 · IF-13** — As a sharer, I want a ready-to-paste summary, so that I can reply in WhatsApp quickly.
- AC: The "Copy summary" text is ≤400 chars: the verdict, one-line reason and link. Confirmation is visual (icon morph + "Copied") and announced via `aria-live`.

**S6.3 · S · P1 · IF-13** — As a sharer, I want the link preview to show the verdict, so that people see it before they tap.
- AC: `opengraph-image.tsx` renders at 1200×630 (the stamp + a claim excerpt + the ACHP wordmark). In demo mode it carries the watermark.

## E7 — Replay & scroll story (P6)

**S7.1 · R · P1 · IF-08** — As a reviewer, I want to replay the investigation as a scroll story, so that I can understand the reasoning path at my own pace.
- AC: `?replay=1` builds chapters from the event log. The rail shows position. Each step reveals on scroll.

**S7.2 · R · P1 · IF-08** — As a reader, I want the story to slow down at the moment the claim is contradicted, so that I actually read the key evidence, but I also want to be able to skip it.
```gherkin
Given a case with at least one contradicts mark
When I scroll into the "Challenge" chapter
Then the stage pins while the quote, the mark and the interpretation reveal across a 220vh track
And "Skip to verdict" and the End key take me past the gate immediately
And no wheel or touch event is intercepted
```

**S7.3 · R · P0 · IF-08/IF-16** — As a reader with reduced motion on, I want the same story as a normal document, so that nothing moves or pins.
- AC: The reduced-motion Playwright run shows all content visible, no sticky stage, no animation.

## E8 — Library, Runs, Method, Developers (P9)

**S8.1 · R · P1 · IF-07** — As a reviewer, I want a method page explaining the metrics and benchmark honestly, so that I can assess rigor.
- AC: It shows the full forms, definitions and formulas for Consensus Truth Score (CTS), Perspective Completeness Score (PCS), Bias Impact Score (BIS), Narrative Stance Score (NSS) and Epistemic Position Score (EPS), the confidence band formula, **one** headline accuracy generated from `EVALUATION.md` with the per-benchmark split (the sources currently disagree: 01_AUDIT G5), the calibration r values, and a limitations section.

**S8.2 · M · P1 · IF-15** — As the maintainer, I want the KB manager and Ask mode moved to `/library` with the new design, so that the home page stays focused.
- AC: All existing KB features keep working (upload, list, delete, chunks, Ask), with no regressions in `/kb/*` API usage.

**S8.3 · D · P1 · IF-15** — As a developer, I want a page showing the MCP tools and the event protocol with copyable examples, so that I can integrate quickly.
- AC: It covers the `server/discover` output, 3 tool schemas, a curl example for `/runs`, and the SSE example.

**S8.4 · S/R · P1 · IF-15** — As someone with my own documents, I want to ask a library a question and get only answers grounded in it, so that I can trust nothing is made up (paper Figs. 5–7).
```gherkin
Given an active library "Health KB"
When I ask "How much exercise does WHO recommend per week?"
Then the answer arrives with numbered citations [1] that open the exact chunk as a quote card with its similarity in words ("close match")
And when I ask about a topic absent from the library
Then I see "Not in this library" with the nearest chunks, and no invented answer
```

**S8.5 · S · P1 · IF-12/IF-15** — As a sharer whose message tried to manipulate the checker, I want a clear, calm explanation of why it wasn't checked, so that I don't think the site is broken (paper Fig. 8).
- AC: A blocked case shows a "Not checked" stamp (graphite), the category in words (e.g. "instructions aimed at the checker"), the Gatekeeper lane as the only lane that ran, and no metrics (no fake "BIS = 100%").

**S8.6 · M · P1 · IF-15** — As the maintainer, I want every current screen from the paper to have a designed successor, so that nothing regresses when the old UI is deleted.
- AC: The 07 §1.1 mapping table is checked off in PROGRESS.md with a screenshot for each successor; the old components are deleted only after that.

## E9 — Quality: accessibility, silence, performance, stillness (P7/P8/P10)

**S9.1 · S · P0 · IF-16** — As a screen-reader user, I want agent progress announced at a sensible pace, so that I can follow without being flooded.
- AC: A polite `aria-live` region; ≤1 announcement per 2s; each announcement is a full sentence ("Fact Challenger marked part 2 as contradicted by 2 sources").

**S9.2 · S · P1 · IF-10** — As a user checking a claim on a bus or in a meeting, I want every piece of feedback to be visual and textual, so that the site never makes a sound and I never miss a confirmation.
- AC: No audio APIs or files ship (the `no-audio` hook rule finds nothing); every confirmation (submit, copy, share, errors, verdict) has a visible state change and an `aria-live` announcement.

**S9.3 · S · P1 · IF-17** — As a mobile user on 4G, I want the pages to load fast, so that I can check claims on the go.
- AC: The budgets in `09 §3` pass in CI (Lighthouse CI on `/` and on a fixture case).

**S9.4 · S · P1 · IF-19** — As any user, I want the page to be completely still when nothing is happening, so that it's calm to read.
- AC: 2s after `run.completed`, no element has a running animation (`document.getAnimations().filter(a => a.playState === 'running').length === 0` in Playwright), except a user-triggered hover.

## E10 — The Assay: metric instruments (P5, P9)

**S10.1 · S · P0 · IF-22/IF-31** — As a sharer, I want the five scores shown as a compact, readable signature with their full names, so that I understand what was measured without learning acronyms.
- AC: The Hallmark renders five distinct cartouches (shield, hexagon, hatched diamond, level, circle); hover/focus shows e.g. "Bias Impact Score (BIS) 20 · lower is better"; a table twin exists; the grayscale screenshot is still readable.

**S10.2 · S/R · P0 · IF-23** — As a reader, I want to know when the Judge and the published formula disagree, so that I don't over-trust a verdict the numbers don't support.
```gherkin
Given a completed case whose Judge verdict is MOSTLY_FALSE and whose formula verdict is MIXED
When I read the report
Then under the stamp I see "Close call: Judge Mostly false · Formula Mixed (0.53)"
And both keys are shown, with one turned and one not
```

**S10.3 · S · P0 · IF-24** — As a sharer, I want to be warned when calm wording is making a false claim look better than it is, so that tone doesn't fool me.
```gherkin
Given a case with CTS below 0.40 and a formula verdict of Mixed or better
When the report renders
Then the Judge's stamp stays the headline
And a ruled notice says the composite was lifted by tone, not evidence, with the lift amount
And the Quiet Falsehood Index is labelled experimental
```

**S10.4 · R · P1 · IF-25** — As a reviewer, I want a ledger that explains exactly how the composite was reached, so that I can audit it like accounts.
- AC: Opening balance (the reference claim) + credits/debits per signal (facts first) = the closing balance shown as C; exact Shapley values; the data balances within 1e-9 and the displayed rounding is labelled.

**S10.5 · S/R · P1 · IF-26** — As a reader, I want to know how close the verdict is to flipping, so that I know when to look at the evidence myself.
- AC: One sentence in the Report ("Fragile: if the framing score rose from 0.08 to 0.15, this would read Mixed"); a number line with the verdict zones in the Assay tab; the band and lever match the reference for all fixtures.

**S10.6 · R · P1 · IF-27** — As a reviewer, I want to see where each score comes from and where the code differs from the paper, so that I can judge the method.
- AC: The Lineage diagram with a Paper ↔ Production toggle highlights that the framing score feeds four metrics; every node is focusable; the table twin matches.

**S10.7 · R · P1 · IF-27** — As a reviewer, I want to see how much human annotators agreed with each metric, so that I weigh them sensibly.
- AC: The Agreement Dial shows r for all five (CTS 0.81 … BIS 0.69) labelled "agreement with 200 human-annotated claims", never "accuracy".

**S10.8 · R · P1 · IF-28** — As a curious reader, I want to try the formula myself, so that I can build intuition for what moves each score.
- AC: The Bench sliders recompute metrics, Hallmark, C, verdict, Ledger and Tipping Point in ≤ 50ms; the what-if label is persistent; Reset returns to the case values; the Bench offers no share or copy action.

**S10.9 · R/M · P1 · IF-29** — As a returning user, I want all my checks on one map of facts vs tone, so that I can spot quiet falsehoods at a glance.
- AC: The `/runs` Integrity Map has four labelled quadrants, the current/hovered run highlighted, 24px hit areas, a table twin, and click-through to the case.

**S10.10 · M · P2 · IF-30** — As the maintainer, I want CI to fail if the formula starts listening to tone even more, so that the metric framework can't silently get worse.
- AC: `leverage_lint.py` runs in CI; a change adding another framing path fails without an ADR stating `leverage-ratio: <n>`.

---

### Traceability summary

| Epic | Stories | Requirements | Phase |
|---|---|---|---|
| E1 Event layer | 7 | IF-01, 03, 06, 09, 12 | P2 |
| E2 Desk | 5 | IF-10, 11, 14, 15 | P9 |
| E3 Live board | 7 | IF-02, 03, 04, 15, 16, 19 | P3 |
| E4 Verdict | 5 | IF-05, 07, 20 | P4 |
| E5 Evidence | 4 | IF-05, 10 | P4 |
| E6 Share | 3 | IF-06, 13 | P4, P9 |
| E7 Replay | 3 | IF-08, 16 | P6 |
| E8 Pages | 6 | IF-07, 12, 15 | P9 |
| E9 Quality | 4 | IF-10, 16, 17, 19 | P7, P8, P10 |
| E10 The Assay | 10 | IF-21 … IF-31 | P5, P9 |
| **Total** | **54** | | |
