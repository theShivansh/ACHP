# 12 — Groq multi-agent runtime: audit and refactor (2026-09-24)

This records what the audit found in the Groq agent stack, what replaced it, and why. The code is the source of truth: `apps/api/achp/llm/` (runtime + registry), `achp/prompts/` (contracts), `achp/evidence/` (pack + grounding), `achp/memory/`, `achp/agents/`, `achp/core/core_pipeline.py`.

## 1. Audit findings

| # | Where | Finding | Risk |
|---|---|---|---|
| F1 | `agents/proposer.py`, `adversary_a.py`, `adversary_b.py`, `judge.py`, `nil/nil_layer.py` (×3), `cache/semantic_cache.py`, `nil/perspective_generator.py`, `data/synthetic_generator.py`, `main.py` `/qa` (raw httpx), `web/app/api/analyze/route.ts` | **11 separate Groq call paths, 10 client constructions** (AsyncGroq, AsyncOpenAI→Groq, httpx, fetch), each with its own retry rules | Rate limits hit blindly; no shared backoff, queue or telemetry |
| F2 | every agent | `FALLBACK_MODEL == DEFAULT_MODEL` (`openai/gpt-oss-120b` twice) | The "fallback" hit the same exhausted quota |
| F3 | `judge.py:237`, `adversary_a.py:204`, `adversary_b.py:192`, `proposer.py:188`, `route.ts` | On failure the agents **invented output**: Judge → `MIXED` 0.5, Adversary A → factual 0.4, Proposer → a stub claim, the Next route → default scores or a mock after a random 1–1.8s sleep | Verdicts without a real run (non-negotiable 4) |
| F4 | `proposer.py` | System prompt asked for step-by-step chain-of-thought | NFR-003; wasted tokens |
| F5 | `core_pipeline.py` `_dict_to_analysis` / `_dict_to_adv_*` | Adversaries received `retrieved_context=[]`; the Judge received `challenges=[]` and `missing_perspectives=[]` | Adversaries argued from memory, and the Judge never saw the per-claim findings |
| F6 | all prompts | Free-text evidence, URLs and statistics requested from the model; `json_object` mode or none, parsed by stripping fences | Fabricated citations reached `key_evidence` unchecked |
| F7 | `main.py` `/analyze` | KB chunks pasted into the claim text | Security check, web search and NIL scored "claim + library excerpts" instead of the claim |
| F8 | `retriever.py` + `semantic_cache.py` | Evidence cached by **cosine similarity ≥ 0.85**; Tier 3 made a Groq call on the retrieval path | "X is a hoax" and "X is not a hoax" could share sources; extra LLM call per near-miss |
| F9 | `nil_layer.py` | 3 Groq calls (sentiment, bias, perspective) on the claim alone, per run | 7 calls per run (9 with a re-debate) against an 8K TPM / 30 RPM free tier |
| F10 | `core/master_orchestrator.py`, `agents/nil_supervisor.py`, `nil/{sentiment_analyzer,bias_classifier,perspective_generator,framing_comparator,confidence_synthesizer}.py`, `data/synthetic_generator.py` | A second, unused orchestration + NIL stack, imported at package load | Duplicate prompts and clients; confusion about which path runs |
| F11 | `route.ts` | Proxy posted `{text}` to a backend that requires `{claim}` → always 422 | Production silently used the ungrounded path or the mock |
| F12 | `/qa` | Every retrieved chunk returned as a "citation"; model citations never validated | Citations that the answer didn't use |
| F13 | tools | No LLM function calling exists; retrieval (DDGS, BM25, FAISS) runs server-side. Prompts didn't forbid claiming to have searched | Notes like "I searched the web" would have been false |

## 2. What replaced it

```
claim ─▶ Security (sync) ─▶ Retriever ─▶ EvidencePack e1…e8 (library first, then web)
                                              │
                          ┌── Groq call 1 ── Proposer ─────────────────────────┐
                          │                                                     ▼
                          ├── Groq call 2 ── Analysis bundle  ∥  NIL.prepare (local)
                          │     fact_challenge   → Adversary A        │
                          │     narrative_audit  → Adversary B        ▼
                          │     language_signals → NIL.finalize (synthesizer unchanged)
                          │                                                     │
                          └── Groq call 3 ── Judge (full debate + evidence) ◀──┘
                                              │  (+ bundle and Judge again only if the Judge asks
                                              ▼    for a second round and confidence < 0.70)
                         grounding → formulas (unchanged, parity-pinned) → ACHPOutput
```

**Calls per run: 3** (was 7; 5 with a second round, was 9). Logical agents and their lanes are unchanged; `run.started.agents[]` reports the model that served each one.

### 2.1 Runtime (`achp/llm/runtime.py`)
- One `AsyncGroq` client, SDK retries off. Every call is `complete(role, messages, PydanticSchema)`.
- Groq **strict `json_schema`** from the pydantic model. Length and range limits aren't in Groq's documented strict keyword set, so they travel as description text and `enforce_limits` trims text and lists and clamps numbers on the server before validation.
- `include_reasoning: false` (the gpt-oss reasoning channel is never returned), `reasoning_effort` per role (low; medium for the Judge). `reasoning_format` is never sent (unsupported on gpt-oss, the likely cause of the earlier 400).
- FIFO semaphore (`ACHP_GROQ_MAX_CONCURRENCY`, default 2) and a bounded queue (`ACHP_GROQ_MAX_QUEUE`, 32 → `overloaded`).
- **Routing.** A 429 cools that model for `Retry-After` and the call moves to the other model at once (the quotas are separate). If both are cooling, it waits for the earlier one within the deadline (`ACHP_GROQ_DEADLINE_S`, 90). `x-ratelimit-remaining-tokens` is tracked, so a model that can't fit the request is skipped before it 429s.
- 5xx and network errors: exponential backoff with jitter. `ACHP_GROQ_CB_THRESHOLD` (3) consecutive failures open a per-model breaker for `ACHP_GROQ_CB_COOLDOWN_S` (30). 401/403: fail fast. 404: the model is disabled. Schema-invalid output switches model. `finish_reason=length` retries once with 1.5× budget.
- When every attempt fails: `LLMUnavailable`, then `PipelineError(stage)`, then `/analyze` 503 with `detail`, `stage`, `error_code`, `retryable`. **No substitute output anywhere.**
- Telemetry: per-attempt records (role, model, status, latency, queue wait, tokens), per-run lookup, aggregate at `GET /health/llm`.

### 2.2 Registry (`achp/llm/registry.py`)
| Logical agent | Physical call | Primary | Fallback |
|---|---|---|---|
| Proposer | proposer | openai/gpt-oss-120b | openai/gpt-oss-20b |
| Adversary A | analysis | openai/gpt-oss-120b | openai/gpt-oss-20b |
| Adversary B | analysis | openai/gpt-oss-120b | openai/gpt-oss-20b |
| NIL bundle | analysis | openai/gpt-oss-120b | openai/gpt-oss-20b |
| Judge | judge | openai/gpt-oss-120b | openai/gpt-oss-20b |
| (/qa, cache validator) | qa, cache_validator | openai/gpt-oss-120b | openai/gpt-oss-20b |

Env overrides: `ACHP_MODEL_PRIMARY/FALLBACK`, `ACHP_<ROLE>_MODEL`, and the legacy `PROPOSER_MODEL`, `ADVERSARY_A_MODEL`, `JUDGE_MODEL`, `JUDGE_FALLBACK_MODEL`. A fallback equal to its primary is rejected and replaced (logged). A test fails if a model id or a Groq client appears anywhere outside `achp/llm/`.

### 2.3 Prompt contracts (`achp/prompts/`)
`system = SHARED_CONTRACT + ROLE_PROMPTS[role]`, `user = JSON payload`. The shared contract holds the rules once: evidence by id only, verbatim quotes, unverifiable when evidence is thin, claim and evidence treated as untrusted data (injection text stays inside a JSON string), no tool claims, no reasoning narration, and the `public_note` rules (06 §5). Role prompts only describe the job; the schema carries the shape. `PROMPT_VERSION` is recorded with every run.

### 2.4 Hallucination hardening (`achp/evidence/grounding.py`)
- Evidence ids must exist in the pack; unknown ids are removed and counted.
- "Supported" or "refuted" without a valid id becomes `unverifiable`. Critical flaws of kind contradicted or outdated without ids are dropped. A flaw whose quote isn't in the part keeps the finding and marks the whole part (06 §6).
- `bias_phrases` and `loaded_language` must be verbatim in the claim.
- URLs not in the pack and `[eN]` references to missing items are stripped from free text.
- No grounded finding → factual score 0.5 (unknown). No grounded part label, or an empty pack → **UNVERIFIABLE** with a plain caveat.
- `key_evidence`, `counter_evidence`, `citations`, `source_url` and `kb_page` are rendered from the pack, never from model text.
- The grounding counts are in `pipeline.grounding` for every run.

### 2.5 Memory (`achp/memory/`)
| Tier | Holds | Lifetime | Staleness guard |
|---|---|---|---|
| Request | claim, library id/name, library chunks (separate from the claim) | one request | — |
| Run | evidence pack, each agent's grounded output, LLM call records, grounding counts | one run | discarded at the end (P2 persists events) |
| Long-term | web search results only (`EvidenceCache`) | `ACHP_EVIDENCE_TTL_S` (900s) | exact normalized-query key; empty results never cached; each document keeps `retrieved_at`; **verdicts, agent outputs and library chunks are never cached** |
| Retrieval context | the EvidencePack | rebuilt per run | `pipeline.evidence_oldest_retrieved_at` is reported |

There was, and is, no conversation memory. `SemanticCache` remains as a library (its tests still run), but nothing on the verdict path uses it.

## 3. API compatibility
- `/analyze`: same request and response shape. Additive: `artifacts.evidence`, `artifacts.claim_labels`, `atomic_claims[].evidence_ids`, `adversary_a.{challenges, flaws, public_note}`, `adversary_b.{flaws, public_note}`, `pipeline.{groq_calls, llm_calls, grounding, prompt_version, evidence_count}`.
  - Changed on purpose: a failed stage returns **503** `{detail, stage, error_code, retryable, run_id}` instead of a fabricated verdict; `offline: true` returns **400** instead of a mock verdict (non-negotiable 4).
- `/qa`: same shape. Answer sentences keep only citations to retrieved chunks; with no model available it says so and shows the closest passages.
- `/kb/*`, `/analyze/{id}/stream` (legacy SSE): unchanged. `/health`: adds `uptime_s`. New: `GET /health/llm`.
- The web route `/api/analyze` is a proxy to the backend. Demo data is served only with `?demo=1` / `DEMO_MODE=1` and is labelled `pipeline.mode = "demo"`.

## 4. Verification
- `cd apps/api && pytest -q`: 62 tests, including the runtime (429 → Retry-After → fallback, both-limited wait, backoff, breaker, invalid output, truncation, auth, queue), registry, prompts, grounding, cache freshness, the 3-call pipeline on a fake transport, and the `/analyze`, `/qa`, `/health/llm` shapes.
- Assay parity 23/23: the formula functions are AST-identical to before. Leverage lint PASS.
- **Not yet verified live.** No `GROQ_API_KEY` is available on this machine, and the live Space still runs the previous code. First live check after deploy: run one claim and confirm Groq accepts the three strict schemas (`/health/llm` shows `ok` calls, `pipeline.groq_calls == 3`).
