# 06 — Agent State & Event Protocol v2

> The UI is a **projection of an append-only event log**. If an event didn't happen, the UI can't show it. That one rule makes the latency legible *and* the interface honest.

---

## 1. Principles

1. **Truth only.** Every visible state change comes from a server event. No client timer invents progress.
2. **Show the work, not the thoughts.** Users see *actions* (what the agent is doing), *public notes* (one sentence written for users) and *outputs* (claims, evidence, marks, verdicts). Raw chain-of-thought or reasoning tokens are **never** requested for display, streamed or rendered (ACHP X NFR-003).
3. **Evidence is addressable.** Every mark and verdict references `evidence_id`s that exist earlier in the same log. The Judge can't cite what the log doesn't contain (ACHP X FR-002/003).
4. **Runtime is the source of truth for metadata.** Model names, agent lists and parallel groups arrive in `run.started`. The frontend holds only visual identity.
5. **Replayable.** The same log drives the live view, a refresh, a second device, the scroll-story replay and the Trace tab.

---

## 2. Endpoints

| Method | Path | Returns | Notes |
|---|---|---|---|
| `POST` | `/runs` | `202 {run_id, events_url, case_url}` | Body `{input:{type:"text", text}, kb_id?, options?}`. Validates input, creates the run, starts `asyncio.create_task(pipeline)`, and returns at once |
| `GET` | `/runs/{id}/events` | `text/event-stream` | Replays the backlog after `Last-Event-ID` (or `?since=seq`), then streams live. `id:` = seq. A `: ping` comment every 15s. Closes after `run.completed`/`run.failed` |
| `GET` | `/runs/{id}` | `{run_id, status, created_at, input, result?, last_seq}` | A snapshot for SSR of `/case/[id]` and for polling fallback |
| `GET` | `/runs/{id}/events.json` | `{events:[…]}` | The full log for Trace export and replay |
| `GET` | `/health` | `{status, pipeline_mode, version, uptime_s}` | Used by the status pill; also pre-warms the Space |
| `POST` | `/analyze` | (unchanged shape) | Compatibility wrapper that calls `/runs` internally and waits |

Response headers for SSE: `Cache-Control: no-cache`, `X-Accel-Buffering: no`, `Content-Type: text/event-stream; charset=utf-8`.
CORS: allow the Vercel production + preview origins and `Last-Event-ID`.

---

## 3. Event envelope

```json
{
  "v": 2,
  "run_id": "r_8f2c1a9d",
  "seq": 17,
  "ts": "2026-09-23T12:00:19.412Z",
  "t_ms": 5120,
  "type": "claim.marked",
  "agent": "adversary_a",
  "data": { }
}
```
`seq` is gapless per run and starts at 1. `t_ms` is milliseconds since `run.started`. SSE frame: `id: 17\nevent: claim.marked\ndata: {…}\n\n`.

### 3.1 Event types

| Type | Emitted by | `data` payload (required fields in **bold**) | UI effect |
|---|---|---|---|
| `run.queued` | server | **`position`** | "Waiting for a free desk · 2 ahead" |
| `run.started` | server | **`input`** `{type, text}`, **`agents[]`** `{id, name, role, model, group}`, `pipeline_mode`, `kb` `{id, name}?` | Build the lanes; show the models in lane details |
| `agent.started` | any agent | **`step`**, `group` | Lane → `working`; glyph boils |
| `agent.action` | any agent | **`action`** (`search_web`·`search_kb`·`fetch_source`·`llm_call`·`compute`·`validate`), **`label`** (≤40 chars), `detail` (≤80), `claim_id?` | The live action line in the lane |
| `agent.note` | any agent | **`note`** (≤140 chars, user-facing), `claim_id?` | The margin note (Kalam) + the aria-live log |
| `agent.done` | any agent | **`duration_ms`**, **`summary`** (≤100 chars), `counts` `{…}` | Lane → `done`; the action line becomes the summary |
| `agent.skipped` | any agent | **`reason`** (e.g. `cache_hit`, `not_applicable`) | Lane → `skipped` (muted, with the reason) |
| `agent.failed` | any agent | **`error_code`**, **`message`**, **`retryable`** | Lane → `failed`; the run may continue degraded |
| `evidence.found` | retriever / adversaries | **`evidence`**: EvidenceObject (§3.2) | A card enters the tray with the paperclip snap |
| `evidence.verified` | evidence_verifier *(future)* | **`evidence_id`**, **`status`** (`accepted`·`rejected`), `reason` | ✓/✗ on the paperclip; rejected cards fade to 50% with the reason |
| `claim.extracted` | proposer | **`claim`** `{claim_id, text, source_span:[s,e], verifiable, epistemic_marker}` | Scissors cut; the strip enters |
| `claim.marked` | adversary_a / adversary_b / judge | **`claim_id`**, **`relation`** (`contradicts`·`supports`·`missing_context`·`framing`·`unclear`), **`span`** `[s,e]` within the claim text, `severity` 1–3, `evidence_ids[]`, `note` (≤140) | A pencil mark on the span; a margin note |
| `signal.computed` | nil_supervisor sub-checks | **`signal`** (`sentiment`·`bias`·`perspective`·`framing`·`hedging`), **`label`**, `value` (0–1, *not shown to Sharers*), `spans[]` over the input text, `explanation` (≤140) | A highlighter over the spans; a tally mark |
| `debate.round` | judge | **`round`**, **`reason`** | Judge lane → `waiting` → "Asked the challengers for a second round: sources conflict" |
| `verdict.final` | judge | **`overall`** `{label, summary, confidence_band, confidence_reason}`, **`claims[]`** `{claim_id, label, confidence_band, evidence_for[], evidence_against[], missing_context?}`, `metrics` `{CTS,PCS,BIS,NSS,EPS}` | Per-strip stamps, then the overall stamp |
| `assay.computed` | server (after `verdict.final`) | **`formula_version`**, **`mode`** (`code`), **`signals`** (the 13 raw signals, 11 §1), **`metrics`** `{CTS,PCS,BIS,NSS,EPS}`, **`composite`**, **`formula_verdict`**, **`judge_verdict`**, **`two_key`** `{state, steps}`, **`ledger`** `{opening_balance, entries[{signal, value, reference, amount}], closing_balance}`, **`tipping_point`** `{band, min_distance, flips[≤5]}`, **`masking`** `{calm, narrative_lift, qfi, masking, quiet_falsehood}`, **`integrity_map`** `{x, y, quadrant}` | Hallmark punches in; Two-Key turns; masking notice; the Assay tab fills. The Report never shows `composite` as a headline (11 §4) |
| `run.completed` | server | **`total_ms`**, `cache_hit` | Lanes collapse; the share bar appears; the page becomes the report |
| `run.failed` | server | **`stage`**, **`error_code`**, **`message`**, **`retryable`** | An error card with the last good state kept visible. **Never a verdict** |

`label` ∈ `supported` · `contradicted` · `mixed` · `missing_context` · `unverifiable` · `blocked`
`confidence_band` ∈ `strong` · `moderate` · `weak`, derived server-side from agreement between the adversaries, evidence count and strength, and verifier acceptance. Document the formula in `/method`.

### 3.2 EvidenceObject (ACHP X §4, extended)

```json
{
  "evidence_id": "e7",
  "claim_id": "c2",
  "source": { "source_id": "s22", "kind": "web", "url": "https://health-agency.example/fact-sheet",
              "domain": "health-agency.example", "title": "Physical activity fact sheet (illustrative)",
              "published_at": "2024-06-26" },
  "locator": "section 'Key facts', paragraph 3",
  "quote": "<verbatim sentence copied from the fetched page>",
  "relation": "contradicts",
  "strength": 0.81,
  "freshness": 0.72,
  "verifier_status": "pending"
}
```
The `quote` must be a verbatim substring of the fetched source text (the server checks this). If it isn't, it's rejected before emission.

---

## 4. State machines

### 4.1 Agent lane

```
queued ──agent.started──▶ working ──agent.done────▶ done
   │                        │  ▲
   │                        │  └──(agent.started again: re-debate)── waiting ◀──debate.round
   │                        └──agent.failed──▶ failed
   └──agent.skipped──▶ skipped
```

| State | Glyph | Chip | Action line | Motion |
|---|---|---|---|---|
| `queued` | Static, 50% ink | "Waiting" | — | None |
| `working` | Boiling (C 3.2) | "Working · 3.2s" (the elapsed time is derived from `t_ms`, not a timer) | The latest `agent.action` label + detail | Crossfade on each new action |
| `waiting` | Static | "Second round" | The `debate.round` reason | None |
| `done` | Static, full ink | "Done · 4.1s" | `summary` | Crossfade into the summary |
| `skipped` | Static, 40% | "Skipped" | `reason` in words ("Answer came from cache") | None |
| `failed` | Static + red dashed ring | "Failed" | `message` + Retry if `retryable` | 1 shake (B) |

> The elapsed counter in `working` does use a display clock, but it counts **real** time since the real `agent.started`. It never estimates progress or remaining time.

### 4.2 Run

```
submitted ─▶ waking? ─▶ queued? ─▶ running ─▶ completed
                                      │
                                      ├─▶ failed        (run.failed)
                                      └─▶ interrupted   (client-derived: no event or ping for 20s)
```
`waking` is client-derived from `/health` (a cold start). `interrupted` automatically reconnects with `Last-Event-ID` 3 times (1s, 3s, 7s), then offers Retry. A run that's still going server-side resumes seamlessly.

---

## 5. Public notes: how agents write them honestly

Examples below are illustrative wording, not real findings.

| Agent | Note source | Example |
|---|---|---|
| Gatekeeper | **Deterministic template** | "Checked for unsafe content and personal data. Safe to check." |
| Clipper (retriever) | Deterministic | "Pinned 4 sources: 3 from the web, 1 from your library." |
| Decomposer | Deterministic + claim count | "Cut the message into 3 checkable parts." |
| Fact Challenger | **LLM field `public_note`** in its JSON output | "Two health agencies put the reduction at 20–35%, not 30–40%." |
| Narrative Auditor | LLM field | "Leaves out that the figure applies to adults doing 150+ minutes a week." |
| Framing Lens | Deterministic from signals | "Mostly neutral wording; one absolute term ('all')." |
| Judge | LLM field | "Two parts hold up; the percentage is overstated." |

Instruction added to each LLM agent's schema: *`public_note`: one plain sentence (≤140 characters) for a non-expert, saying what you checked and what you found. Refer only to evidence you cite. Don't describe your reasoning process.*

Server-side validation before emitting: length ≤140; no URLs; no first-person process talk (a regex for "let me", "I think", "step 1", "reasoning"); no evidence reference that isn't in the log. On failure, fall back to the deterministic template.

---

## 6. Backend implementation (FastAPI)

```python
# apps/api/achp/events/bus.py
class RunEventBus:
    """Append-only per-run log + fan-out to live SSE subscribers."""
    def __init__(self, store: EventStore): ...
    async def emit(self, run_id: str, type: str, agent: str | None, data: dict) -> Event:
        # assign seq (gapless), ts, t_ms → store.append() → put_nowait to each subscriber queue
    async def subscribe(self, run_id: str, after_seq: int) -> AsyncIterator[Event]:
        # yield backlog from store where seq > after_seq, then live events; ends on run.completed/failed
```
- `EventStore`: SQLite `events(run_id, seq, ts, type, agent, data_json, PRIMARY KEY(run_id, seq))` + `runs(run_id, status, input_json, result_json, created_at)`. Optional Postgres via `EVENT_STORE_URL`. TTL cleanup after 72h.
- Keep strong references to background tasks (`self._tasks[run_id] = task`), since asyncio only keeps weak references. Wrap them in try/except that emits `run.failed`.
- Concurrency: `asyncio.Semaphore(int(os.getenv("ACHP_MAX_CONCURRENT_RUNS", 3)))`. Waiting runs emit `run.queued`.
- **Adapter first:** replace `core_pipeline.emit()` so the existing `agent_status` calls map to the v2 types (running → `agent.started`, done → `agent.done`). Then add the new emission points:
  - retriever: `agent.action` before each search; `evidence.found` per kept source
  - proposer: `claim.extracted` per atomic claim after parsing (server-side substring → `source_span`)
  - adversaries: new output fields `flaws[] {claim_id, quote, relation, evidence_ids, severity}` → `claim.marked`. The server maps `quote` → `span` by exact substring, falls back to a case-insensitive fuzzy match (≥0.85), and otherwise uses the whole strip
  - NIL: loaded-word lists → `signal.computed.spans` (regex over the input)
  - judge: `debate.round`, `verdict.final`
- Tests: `tests/events/test_bus.py` (seq gapless, replay after seq, concurrent subscribers), `test_sse.py` (the Last-Event-ID resume), `test_public_note_validation.py`.
- **Assay:** port `reference/assay/assay.py` to `apps/api/achp/assay/` unchanged (it's stdlib-only). Collect the 13 raw signals where `core_pipeline.py` computes the metrics today (`adv_a_out["factual_score"]`, `judge_out["cts_raw"]`, `nil_result.BIS`, `framing_sc`, `polarity_abs`, `dominant_frame`, `adv_b_out["perspective_score"]`, `nil_result.PCS`, `len(missing_perspectives)`, `judge_out.get("nss_raw")`, `vader_eps`, `hedge_ratio`), call `assay(signals, judge_verdict, mode="code")`, and emit `assay.computed`. Keep only the top 5 flips in the event. Add the parity test (`reference/assay/test_assay.py::test_code_mode_matches_production_formulas`) to the API test suite so a formula change without a matching reference change fails CI.

---

## 7. Frontend implementation (Next.js)

```
apps/web/lib/runs/
  types.ts           // Event union type generated from the server pydantic models (datamodel-codegen or hand-kept + zod)
  reducer.ts         // pure (state, event) => state; dedupe by seq; unit-tested with fixtures
  useRunEvents.ts    // EventSource + watchdog + gap repair + polling fallback
  announcer.ts       // event → human sentence for aria-live (throttled 1 per 2s, deduped)
  chapters.ts        // groups events into replay chapters (gatekeeper, sources, parts, challenge, framing, verdict)
  ../assay/          // assay.ts (port of the reference) — used ONLY by the Bench for what-if; reports render the server's assay.computed values
apps/web/fixtures/runs/*.jsonl  // recorded real runs (scripts/record_run.py) for dev, tests, and the "/" story
```

- `useRunEvents(runId)`: native `EventSource` resends `Last-Event-ID` on reconnect when frames carry `id:`. A watchdog resets on every event or ping; 20s of silence → `interrupted` → a manual reconnect with `?since=lastSeq`. If `seq` jumps (a gap), fetch `events.json?since=` to fill it. After 2 failed reconnects, poll `GET /runs/{id}` every 2s.
- `reducer.ts` is the **only** place that changes run state. Components select slices (`useRunSelector`). Test it: feed each fixture and snapshot the final state; assert that replaying it twice is idempotent.
- The **Trace tab** renders the raw events (virtualized). Its export is `events.json` verbatim.
- **SSR** of `/case/[id]`: fetch the snapshot server-side for completed runs (fast LCP, OG image), then hydrate and subscribe if the run is still running.
