# P11 — Polish & ship

**Effort:** medium · **Mode:** plan mode first · **Stories:** — (release) · **Est.:** 0.5 day
**Read first:** `09_ACCEPTANCE_AND_QA.md` §1, §7 · `10_IDEAS.md` §2–3 · `08_REFERENCES.md` §7–8

<goal>
Take the upgrade from correct to exceptional, verify that nothing drifted from the design system, and release it with the docs and assets a reviewer will look at.
</goal>

<tasks>
1. **Final critique loop:** `shoot.mjs --phase P11` across all routes, viewports and themes; delegate to `design-critic` with the instruction "Be strict: what would make a senior product designer say this is generic?" Fix the P0–P2 findings; log the P3s as Deferred.
2. **`/impeccable polish`** on `/` and the case page; accept only the changes consistent with 04_DESIGN (reject any that reintroduce banned patterns).
3. **Drift check:** deploy a Vercel preview, run designmd.me (or `/impeccable document`) on the preview, and diff the extracted tokens against `04_DESIGN.md`. Fix unknown colors, fonts or radii.
4. **Copy pass:** read every string in `apps/web` against 04 §9 (plain, specific, calm). Sentence case. No jargon in the Sharer view.
5. **Docs:** update the root `README.md` with new screenshots (the 1440 case done, the 390 live), a 20–30s GIF or MP4 of a live run, the architecture diagram with the event log, how to run the fixtures, and links to `/method` and `/developers`. Add `docs/upgrade/CHANGELOG.md` summarizing the upgrade by story id.
6. **Release:** confirm the environment variables on Vercel and HF Spaces (`ACHP_DATA_DIR`, `EVENT_STORE_URL` if used, CORS origins); smoke-test the preview against the live backend with 3 real claims; then ask me before promoting to production (promotion is my call).
7. **Launch assets (optional):** record a clean 1080×1920 screen capture of a live run for the Reel in `10_IDEAS.md` §3 (Playwright `recordVideo` at 390×844 ×2 DPR, speed 1). Save it to `docs/upgrade/launch/`.
8. **Close out** PROGRESS.md: all phases checked, the gate evidence linked, the Deferred list prioritized.
</tasks>

<done_when>
Every gate is green on the preview, the drift check is clean, the docs are updated, the production promotion is awaiting my approval, and the final report is sent.
</done_when>

<report>
Final message: what shipped (by epic), the before/after scorecard from 01_AUDIT, the Lighthouse and axe numbers, known limitations, and the top 3 next items from 10_IDEAS.
</report>
