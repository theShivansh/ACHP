# P4 — Verdict, evidence, report & share

**Effort:** medium · **Mode:** plan mode first · **Stories:** S4.1–S4.5, S5.1–S5.4, S6.1–S6.3 · **Est.:** 1.5 days
**Read first:** `02_PRD.md` IF-05/06/07/13/20 · `04_DESIGN.md` §3.3, §7 · `07_IA_AND_SCREENS.md` §3 (completed), §5 · `03_USER_STORIES.md` E4–E6

<goal>
When `verdict.final` and `run.completed` arrive, the same page becomes a permanent, shareable report that a non-expert understands in under a minute, and in which every statement traces to quoted evidence.
</goal>

<tasks>
1. **Verdict vocabulary:** `lib/verdict.ts` maps the server labels → display name, token, stamp text and mark (04 §3.3). If a legacy result arrives (TRUE…FALSE), map it explicitly and log a console warning in dev.
2. **Stamp v1** (`components/case/Stamp.tsx`): an SVG stamp with an irregular border, the text in Newsreader 600 caps (the only uppercase allowed), and an ink-texture mask (static `feTurbulence` + `feComponentTransfer` threshold); rotation seeded from `claim_id`. `role="img"` + `aria-label`. The per-strip stamp sits in the strip's reserved slot; the overall stamp sits by the claim header. The animation arrives in P8. For now it simply appears.
3. **Plain-words summary:** `overall.summary` directly under the claim (≤2 sentences). Add a unit test for the reading-level check, using `text-readability` or a small Flesch-Kincaid implementation.
4. **ConfidenceBand:** Strong/Moderate/Weak + a 3-segment bar + `confidence_reason`. There must be no `%` in any component under `components/case/` (add a test that renders the completed fixture and asserts that `%` doesn't appear in the Report tab's text).
5. **Unverifiable & missing-context treatments** exactly as in 04 §3.3; never red for unverifiable.
6. **EvidenceCard (final):** the domain + favicon (via `https://icons.duckduckgo.com/ip3/<domain>.ico` with an `onError` fallback to a paperclip glyph), title, date, **verbatim quote** (Newsreader, a left rule in the relation color), locator, relation, strength in words, verifier status, "Open source ↗". Freshness <0.4 → "older source" + an aged tint of `--sheet` (a subtle yellow shift, a max ΔE of 4), the "evidence aging" idea.
7. **InterpretationNote:** "ACHP's reading" in Public Sans `--ink-2`, visually and semantically separate from the quotes (S5.3).
8. **Evidence↔span linking:** hovering or focusing a card highlights its spans on the strips and dims the others; hovering a marked span highlights its cards. Put it in a small store (a context or `useSyncExternalStore`) so it doesn't re-render the whole sheet.
9. **Tabs:** Report · Evidence (n) · Trace. Use URL `?tab=`; arrow-key navigation (shadcn Tabs). **Trace:** `TraceTable` (virtualized) of the raw events; each row expands to JSON (mono is allowed here); "Download events.json".
10. **MethodDrawer:** a Sheet with the metric full forms, definitions and formulas (Consensus Truth Score, Perspective Completeness Score, Bias Impact Score, Narrative Stance Score, Epistemic Position Score; cite `core_pipeline.py` lines for each formula), the confidence-band formula, the benchmark read from `EVALUATION.md` (never hard-coded; see 01_AUDIT G5), and limitations. Link to the Assay tab (P5) and `/method` (P9). **Don't build a radar**: P5 replaces `MetricsRadar` with the Hallmark.
11. **Completed layout:** the lanes collapse to the summary row "7 agents · 18.2s · 1 debate round" (expandable); the ShareBar appears.
12. **Share:** "Copy summary" (≤400 chars: the verdict + one-line reason + the URL), "Copy link", `navigator.share` on mobile, and "Replay the investigation" (links to `?replay=1`, built in P6). Toast + icon morph (P7 refines them).
13. **SSR + OG:** completed runs render server-side from the snapshot (fast LCP). `app/(desk)/case/[id]/opengraph-image.tsx` renders a 1200×630 image with the stamp + a claim excerpt (Newsreader via `ImageResponse` fonts) + the wordmark; demo runs carry the watermark. Add `generateMetadata` with the title "ACHP · <verdict>: <claim excerpt>".
14. **Editor's desk (flag `FF_HUMAN_REVIEW`):** a callout when `confidence_band = weak` or the adversary disagreement is ≥0.4; the "Request review" button is a no-op stub with a TODO referencing ACHP X FR-005.
15. **Tests:** e2e `case.report.spec.ts` (the completed fixture: stamps with labels, the summary, the band, no `%`, card fields, the linking highlight, tabs by keyboard, the Trace row count = event count, the copy summary length), plus a unit test for `verdict.ts` and the summary builder.
</tasks>

<constraints>
- No radar chart in the Sharer view (it can live in the MethodDrawer, restyled, if it helps, but a plain table is preferred).
- Quotes must render exactly as received. Never truncate mid-word without an ellipsis, and never paraphrase inside quote styling.
- Every rendered source must come from an `evidence.found` event.
</constraints>

<verification>
- Tests green; `shoot.mjs --phase P4 --routes "/case/fixture-exercise-mixed?speed=20" --at done` plus the tabs (`?tab=evidence`, `?tab=trace`).
- `/impeccable critique case` (if installed) and the `design-critic` subagent: no P0/P1. Also run the hallway-style self-check: from the 390px screenshot alone, can you answer "which part is wrong and why" in two sentences?
</verification>

<done_when>
The completed fixture reads as a clear, shareable report on mobile and desktop; every AC in E4–E6 passes; PROGRESS.md is updated.
</done_when>
