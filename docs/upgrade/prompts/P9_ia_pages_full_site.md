# P9 — Full-site IA & pages (every current screen gets a successor)

**Effort:** medium · **Mode:** plan mode first · **Stories:** S2.1–S2.3, S8.1–S8.6, S10.9 (+ S6.2/S6.3 wiring on `/`) · **Requirements:** IF-11, IF-12, IF-15, IF-29, IF-31 · **Est.:** 2 days
**Read first:** `07_IA_AND_SCREENS.md` (all, especially §1.1, the mapping of every current screen to its successor), `11_THE_ASSAY.md` §3.6–3.9, `02_PRD.md` IF-15, the prototype `docs/upgrade/achp-site.html` (open every route: `#/`, `#/case`, `#/ask`, `#/library`, `#/runs`, `#/method`, `#/developers`, `#/blocked`), and the current `components/KBManager.tsx`, `RAGAnswer.tsx`, `QueryInput.tsx`, `lib/api.ts`

<goal>
Ship the full route map in the new design, move the KB manager and Q&A out of the front door into their own pages, give the metrics a real home on `/method`, and retire the old single-page UI only after every screen in 07 §1.1 has a checked-off successor.
</goal>

<tasks>
1. **`/` Desk:** the headline and subcopy from 07 §2 (sentence case, Newsreader 44, no italics); `ClaimInput` (Newsreader placeholder, ⌘/Ctrl+Enter, a 12-character minimum with the P7 shake, a Library selector if KBs exist); 3 neutral example claims (fill, don't submit); `POST /runs` → the View Transition to the case. Below the fold: the `ReplayStory` of the stored `exercise-mixed` case with its one friction gate, then a CTA back to the input.
2. **StatusChip:** pings `/health` on load (pre-warm); states Waking (elapsed seconds, lamp) / Ready / Unreachable (retry), with a backoff of 2s → 5s → 10s. Submitting while waking keeps the claim on the sheet and starts the run when the backend is ready (S2.3).
3. **`/ask`** (successor of paper Figs. 5–7): library picker, question input, the answer as sheet prose with numbered citation chips that open `QuoteCard`s (chunk excerpt, chunk index, similarity in words), the out-of-library state ("Not in this library" + nearest chunks + "Check it as a claim instead"). Same `/qa` API as today.
4. **`/library` + `/library/[kbId]`** (successor of paper Fig. 2): index cards (title, docs · chunks · size, status chip with real embedding progress or polling, Set active · Ask · Delete via a confirm dialog), a dropzone for file/URL/text, a chunk list with search. Keep every existing KB API call; no regressions.
5. **`/runs`:** a list (stamp · 24px Hallmark · excerpt · time · Two-Key state) and the **Integrity Map** (11 §3.9, 07 §5): CTS × Calm scatter, four quadrant labels, the current/hovered run highlighted, 24px hit areas, a table twin, click-through. The run ids live in `localStorage` (try/catch, max 50); values come from each run's stored `assay.computed`.
6. **`/method`:** the scroll story in 07 §8: agents → **the five metrics with full forms first** → Signal Lineage (Paper ↔ Production toggle) → Agreement Dial → Assay Bench on the reference claim and 3 labelled samples → "What we found in our own formulas" (11 §2 in plain words) → the benchmark (**one** headline number generated from `EVALUATION.md` plus the per-benchmark split; add `scripts/gen_evaluation.py` if needed) → limitations.
7. **`/developers`:** tabs for MCP · REST · Events, including the `assay.computed` schema and a sample payload.
8. **Blocked state** (paper Fig. 8): a graphite "Not checked" stamp, the reason in words, only the Gatekeeper lane, and **no metrics or Hallmark**. Delete any code path that renders "BIS 100%" for blocked input.
9. **Global chrome:** nav (Check · Ask · Library · Runs · Method · Developers), theme toggle (light/dark/system), ⌘K `CommandMenu` (New check, Ask a library, Replay current case, Open Assay, Open trace, Go to Runs/Library/Method, Toggle theme), a mobile menu Sheet, and per-route `generateMetadata`. **No sound control**: ACHP is silent.
10. **Retire the old UI**, only after 07 §1.1 is fully checked in PROGRESS.md with a successor screenshot for each row: remove the legacy `app/page.tsx` SPA, `components/{TopBar,Sidebar,PipelineProgress,PipelineTimeline,MetricsRadar,VerdictCard,TransparencyReport,PerspectivePanel,AtomicClaims,QueryInput,KBManager,RAGAnswer}.tsx`, `app/legacy.css`, `html2canvas` and `jspdf` (add a print stylesheet for `/case/[id]` instead). Make `FF_DESK` default on, then delete the flag.
11. **Mobile pass** on every route at 390×844 and 360×740: no horizontal scroll, 44px targets, safe-area insets, bottom sheets with visible close buttons, and the Integrity Map readable (it falls back to the list with quadrant chips below 360px).
12. **Tests:** `desk.spec.ts`, `desk.cold.spec.ts`, `ask.spec.ts` (citations open quote cards; out-of-library state), `library.spec.ts` (upload flow against a test-mode mocked API), `runs.map.spec.ts` (quadrants, click-through, table twin), `method.spec.ts` (full forms present before any acronym; the Bench label is persistent), `blocked.spec.ts` (no metrics rendered), and a route smoke test for all pages in all Playwright projects.
</tasks>

<constraints>
- No immigration or other inflammatory demo claims on `/` (they stay in the benchmark docs).
- No marketing superlatives ("revolutionary", "AI-powered"). Voice rules in 04 §9.
- Keep KB and Q&A API compatibility. Backend changes in this phase are limited to `scripts/gen_evaluation.py`.
- Every chart follows 04 §7.2 and has a table twin; no radar anywhere.
</constraints>

<verification>
- `shoot.mjs --phase P9 --routes /,/ask,/library,/runs,/method,/developers,"/case/fixture-exercise-mixed?speed=20","/case/fixture-blocked?speed=20"` at all viewports and themes; review them yourself against the prototype.
- Delegate to `design-critic` (all routes), `a11y-auditor` (nav, ⌘K, dialogs, sheets, the Integrity Map), and `assay-auditor` (`/method` and `/runs` metric rendering).
</verification>

<done_when>
The old UI is gone; 07 §1.1 is fully checked with screenshots; every route passes review; no KB or Q&A regressions; PROGRESS.md is updated.
</done_when>
