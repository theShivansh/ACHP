# P2 — Event protocol v2 (backend + client data layer) and removing fake progress

**Effort:** high · **Mode:** plan mode first · **Stories:** S1.1–S1.7 · **Est.:** 2 days
**Read first:** `docs/upgrade/06_AGENT_STATE_SPEC.md` (all), `01_AUDIT.md` §A, `apps/api/main.py`, `apps/api/achp/core/core_pipeline.py`, `apps/api/achp/agents/*.py`, `apps/api/achp/nil/nil_layer.py`, `apps/web/app/page.tsx`, `apps/web/components/PipelineProgress.tsx`, `apps/web/app/api/analyze/route.ts`

<goal>
Make every piece of progress the UI will ever show come from a persisted, replayable, resumable event log. Then delete the synthetic progress, the fabricated logs and the silent mock.
</goal>

<why>
The current SSE design races: the client opens the stream before the POST registers the queue, so the stream usually closes with "run_id not found" and the UI falls back to a fake creeping bar. The upgrade's whole premise, showing agents working instead of a loader, is only honest if the events are real, ordered and resumable.
</why>

<backend_tasks>
1. `achp/events/models.py`: pydantic models for the envelope and every event type in 06 §3.1 and the EvidenceObject in 06 §3.2. Export the JSON Schema to `apps/api/schemas/events.v2.json` (the frontend types derive from it).
2. `achp/events/store.py`: `EventStore` protocol + `SQLiteEventStore` (path from `ACHP_DATA_DIR`, default `./.data`), with tables `runs` and `events` per 06 §6, a gapless `seq` per run (an atomic insert with `MAX(seq)+1` inside a transaction, or a per-run counter guarded by an asyncio lock), and a 72h TTL cleanup on startup.
3. `achp/events/bus.py`: `RunEventBus.emit/subscribe` (backlog after `after_seq`, then live; ends on a terminal event). Keep strong references to background tasks. Add the concurrency semaphore and `run.queued`.
4. Endpoints in `main.py` (or a new `achp/api/runs.py` router): `POST /runs`, `GET /runs/{id}/events` (SSE with `id:`/`event:` lines, `Last-Event-ID` and `?since=`, a 15s `: ping`), `GET /runs/{id}`, `GET /runs/{id}/events.json`. Re-implement `POST /analyze` as a wrapper that creates a run and awaits completion (same response shape as today). Remove the old `_sse_queues` code.
5. **Emission points** (adapter first, then enrich):
   - Map the existing `emit("agent_status", …)` calls to `agent.started`/`agent.done` with `duration_ms` and `summary`.
   - Emit `run.started` with `agents[]` built from the real configuration (the actual model ids in use).
   - Retriever: `agent.action` before each search; `evidence.found` per kept source, with a verbatim `quote` (reject and skip if it isn't a substring of the fetched text).
   - Proposer: `claim.extracted` per atomic claim, with `source_span` found in the input.
   - Adversaries: extend the output schema with `flaws[] {claim_id, quote, relation, evidence_ids, severity}` and `public_note`. Map `quote` → `span` (exact, then case-insensitive, then whole strip). Emit `claim.marked` and `agent.note`.
   - NIL: emit `signal.computed` per sub-check, with `spans` for the loaded words.
   - Judge: `debate.round`; `verdict.final` with per-claim labels, the confidence band and reason (write the band formula as a pure function with tests), and the metrics.
   - Wrap the pipeline so any exception emits `run.failed` with the stage.
6. **Public-note validation** (06 §5) as a pure function with deterministic fallbacks per agent.
7. **Tests** (`apps/api/tests/events/`): gapless seq under concurrent emits; replay after seq; two concurrent subscribers; the SSE resume with `Last-Event-ID` via `httpx.AsyncClient` streaming; the `/analyze` wrapper parity; public-note validation cases; quote→span mapping cases; the confidence band function.
8. `scripts/record_run.py`: runs a claim against a local or remote backend and writes `apps/web/fixtures/runs/<name>.jsonl`. Record the 6 fixtures from `docs/upgrade/fixtures-plan.md` (use the live backend if the local one lacks keys; write access to `/runs` is fine here).
</backend_tasks>

<frontend_tasks>
9. `lib/runs/types.ts`: a TS union for the events, generated from `schemas/events.v2.json` (json-schema-to-typescript) or hand-written with zod mirrors; add a unit test that keeps them in sync with the schema.
10. `lib/runs/reducer.ts`: pure, deduped by seq, covering every event type and the run/agent state machines from 06 §4. Tests: each fixture → a final-state snapshot; idempotent double-apply; out-of-order input is rejected and reported.
11. `lib/runs/useRunEvents.ts`: EventSource + the 20s watchdog + gap repair via `events.json?since=` + reconnect backoff (1s, 3s, 7s) + a polling fallback, per 06 §7.
12. `lib/runs/announcer.ts`: event → sentence for `aria-live`, throttled to 1 per 2s, with tests.
13. **Delete the dishonest code:** `buildDetailedLogs` and the Logs tab rendering it, `PipelineProgress`'s creep and 92% cap (the component can go once P3 lands; for now hide it under the flag), and the hard-coded model strings in `Sidebar.tsx`. In `app/api/analyze/route.ts`, gate the offline mock behind `?demo=1` / `DEMO_MODE=1` and remove the artificial random sleep. Production failures return a 503 JSON error.
14. Point the legacy page at the new `/runs` flow through the new hook, so even the old UI shows real events until P9 replaces it.
</frontend_tasks>

<constraints>
- The API contract is exactly 06_AGENT_STATE_SPEC. If you need to deviate, write the deviation into the spec first and log it under Decisions, with the reason.
- Never add fields that carry model reasoning. `public_note` is the only free-text agent field, and it's validated.
- Don't break KB endpoints or `/qa`.
</constraints>

<verification>
- `cd apps/api && pytest -q` green; `pnpm -C apps/web test` green.
- The honesty greps in `09 §5` return no matches.
- Manual: start the API locally, `curl -N localhost:8000/runs/<id>/events` mid-run, Ctrl-C, and re-run with `-H "Last-Event-ID: 5"`. It resumes at 6.
- Delegate to `event-contract-verifier`: "Verify the P2 implementation against 06_AGENT_STATE_SPEC and the fixtures."
</verification>

<done_when>
Every task is checked in PROGRESS.md; the 6 fixtures are committed; the verifier reports no contract gaps; commits are split: models+store · bus+endpoints · emissions · validation · tests · frontend data layer · removals.
</done_when>
