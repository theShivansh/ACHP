"""
ACHP — shared Groq runtime.

One client, one queue, one set of limits for every LLM call in the backend.

  complete(role, messages, schema)  →  LLMResult(value=<validated pydantic object>, …)

What it guarantees
- **One client.** A single `AsyncGroq` (SDK retries off; this module owns retries).
- **Structured output only.** Every call uses Groq strict `json_schema` built from the pydantic
  output model, then re-validates with pydantic. Free text never reaches the pipeline.
- **No reasoning in responses.** `include_reasoning: false`, so the gpt-oss reasoning channel is
  never returned, logged or stored (ACHP X NFR-003). `reasoning_effort` is set per role.
- **Global concurrency + queue.** A FIFO semaphore (`ACHP_GROQ_MAX_CONCURRENCY`, default 2);
  callers beyond `ACHP_GROQ_MAX_QUEUE` (default 32) are rejected at once (backpressure).
- **Rate-limit aware routing.** Primary and fallback models have separate Groq quotas. A 429
  cools the model down for `Retry-After` seconds and the call moves to the other model; when
  both are cooling, the call waits for the earlier one (within the deadline). Remaining-token
  headers are tracked so a model that can't fit the request is skipped before it 429s.
- **Retry with exponential backoff + jitter** for 5xx and network errors.
- **Circuit breaker** per model: `ACHP_GROQ_CB_THRESHOLD` consecutive failures open it for
  `ACHP_GROQ_CB_COOLDOWN_S` (or longer if Retry-After says so).
- **Telemetry**: per-attempt records (role, model, status, latency, queue wait, tokens) in a
  ring buffer, per-run lookups, and an aggregate snapshot for `/health/llm`.
- **Honest failure.** When every attempt fails it raises `LLMUnavailable`. Callers never
  substitute a made-up answer.
"""
from __future__ import annotations

import asyncio
import inspect
import json
import logging
import os
import random
import re
import time
from collections import deque
from dataclasses import asdict, dataclass, field
from typing import Any, Awaitable, Callable, Deque, Dict, Generic, List, Mapping, Optional, Protocol, Type, TypeVar

from pydantic import BaseModel, ValidationError

from achp.llm import registry
from achp.llm.strict_schema import enforce_limits, response_format

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


# ─────────────────────────────────────────────────────────────────────────────
# Errors and results
# ─────────────────────────────────────────────────────────────────────────────

class LLMUnavailable(RuntimeError):
    """Every model for a role failed. Never replace this with a fabricated answer."""

    def __init__(self, role: str, code: str, message: str, retryable: bool = True):
        super().__init__(f"{role}: {code}: {message}")
        self.role = role
        self.code = code
        self.message = message
        self.retryable = retryable


@dataclass
class TransportResponse:
    content: str
    finish_reason: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    headers: Mapping[str, str] = field(default_factory=dict)


class TransportError(Exception):
    def __init__(self, status: Optional[int], message: str, headers: Optional[Mapping[str, str]] = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.headers = dict(headers or {})


class Transport(Protocol):
    async def __call__(self, *, model: str, messages: List[Dict[str, str]], response_format: Dict[str, Any],
                       max_completion_tokens: int, temperature: float, reasoning_effort: str,
                       timeout: float) -> TransportResponse: ...


@dataclass
class LLMResult(Generic[T]):
    value: T
    role: str
    model: str
    fallback_used: bool
    attempts: int
    latency_ms: float
    queue_ms: float
    prompt_tokens: int
    completion_tokens: int


@dataclass
class CallRecord:
    ts: float
    run_id: Optional[str]
    role: str
    model: str
    attempt: int
    status: str            # ok | rate_limited | server_error | network | invalid_output | truncated | client_error
    http_status: Optional[int]
    latency_ms: float
    queue_ms: float
    prompt_tokens: int = 0
    completion_tokens: int = 0


# ─────────────────────────────────────────────────────────────────────────────
# Groq transport (the only place that talks to the SDK)
# ─────────────────────────────────────────────────────────────────────────────

class GroqTransport:
    def __init__(self, api_key: Optional[str] = None):
        self._api_key = api_key
        self._client = None

    def _get(self):
        if self._client is None:
            from groq import AsyncGroq
            key = self._api_key or os.getenv("GROQ_API_KEY", "").strip()
            if not key:
                raise TransportError(401, "GROQ_API_KEY is not set")
            self._client = AsyncGroq(api_key=key, max_retries=0)
        return self._client

    async def __call__(self, *, model, messages, response_format, max_completion_tokens,
                       temperature, reasoning_effort, timeout) -> TransportResponse:
        import groq
        client = self._get()
        try:
            raw = await client.chat.completions.with_raw_response.create(
                model=model,
                messages=messages,
                response_format=response_format,
                max_completion_tokens=max_completion_tokens,
                temperature=temperature,
                reasoning_effort=reasoning_effort,
                extra_body={"include_reasoning": False},
                timeout=timeout,
            )
        except groq.APIStatusError as e:
            raise TransportError(e.status_code, _short(str(e)), dict(e.response.headers)) from None
        except (groq.APIConnectionError, groq.APITimeoutError) as e:
            raise TransportError(None, _short(str(e))) from None
        completion = raw.parse()
        if inspect.isawaitable(completion):  # groq ≥ 1.0: the async raw response parses asynchronously
            completion = await completion
        choice = completion.choices[0]
        usage = completion.usage
        return TransportResponse(
            content=choice.message.content or "",
            finish_reason=choice.finish_reason or "",
            prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
            completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
            headers=dict(raw.headers),
        )


def _short(text: str, n: int = 240) -> str:
    return text if len(text) <= n else text[: n - 1] + "…"


# ─────────────────────────────────────────────────────────────────────────────
# Per-model limiter state
# ─────────────────────────────────────────────────────────────────────────────

_DURATION = re.compile(r"(?:(?P<h>\d+(?:\.\d+)?)h)?(?:(?P<m>\d+(?:\.\d+)?)m(?!s))?(?:(?P<s>\d+(?:\.\d+)?)s)?(?:(?P<ms>\d+(?:\.\d+)?)ms)?$")


def parse_duration(value: Optional[str]) -> Optional[float]:
    """'2m59.56s' | '7.66s' | '120ms' | '3' → seconds."""
    if not value:
        return None
    value = value.strip()
    try:
        return float(value)
    except ValueError:
        pass
    m = _DURATION.match(value)
    if not m or not any(m.groupdict().values()):
        return None
    g = {k: float(v) if v else 0.0 for k, v in m.groupdict().items()}
    return g["h"] * 3600 + g["m"] * 60 + g["s"] + g["ms"] / 1000


@dataclass
class ModelState:
    model: str
    cooldown_until: float = 0.0          # 429 / backoff / breaker
    breaker_open_until: float = 0.0
    consecutive_failures: int = 0
    remaining_tokens: Optional[int] = None
    tokens_reset_at: float = 0.0
    disabled_reason: Optional[str] = None  # e.g. model not found: skip for the process lifetime

    def available_at(self, needed_tokens: int, now: float) -> float:
        if self.disabled_reason:
            return float("inf")
        at = max(self.cooldown_until, self.breaker_open_until)
        if (self.remaining_tokens is not None and self.remaining_tokens < needed_tokens
                and self.tokens_reset_at > now):
            at = max(at, self.tokens_reset_at)
        return at

    def breaker_state(self, now: float) -> str:
        if self.disabled_reason:
            return "disabled"
        return "open" if self.breaker_open_until > now else "closed"


# ─────────────────────────────────────────────────────────────────────────────
# Runtime
# ─────────────────────────────────────────────────────────────────────────────

def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except ValueError:
        return default


class GroqRuntime:
    def __init__(
        self,
        transport: Optional[Transport] = None,
        *,
        max_concurrency: Optional[int] = None,
        max_queue: Optional[int] = None,
        max_attempts: Optional[int] = None,
        deadline_s: Optional[float] = None,
        request_timeout_s: Optional[float] = None,
        breaker_threshold: Optional[int] = None,
        breaker_cooldown_s: Optional[float] = None,
        backoff_base_s: Optional[float] = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        clock: Callable[[], float] = time.monotonic,
    ):
        self._transport: Transport = transport or GroqTransport()
        self.max_concurrency = max_concurrency or _env_int("ACHP_GROQ_MAX_CONCURRENCY", 2)
        self.max_queue = max_queue or _env_int("ACHP_GROQ_MAX_QUEUE", 32)
        self.max_attempts = max_attempts or _env_int("ACHP_GROQ_MAX_ATTEMPTS", 4)
        self.deadline_s = deadline_s or _env_float("ACHP_GROQ_DEADLINE_S", 90.0)
        self.request_timeout_s = request_timeout_s or _env_float("ACHP_GROQ_TIMEOUT_S", 45.0)
        self.breaker_threshold = breaker_threshold or _env_int("ACHP_GROQ_CB_THRESHOLD", 3)
        self.breaker_cooldown_s = breaker_cooldown_s or _env_float("ACHP_GROQ_CB_COOLDOWN_S", 30.0)
        self.backoff_base_s = backoff_base_s if backoff_base_s is not None else _env_float("ACHP_GROQ_BACKOFF_S", 1.0)
        self._sleep = sleep
        self._clock = clock
        self._states: Dict[str, ModelState] = {}
        self._semaphore: Optional[asyncio.Semaphore] = None
        self._semaphore_loop: Optional[asyncio.AbstractEventLoop] = None
        self._waiting = 0
        self._in_flight = 0
        self._records: Deque[CallRecord] = deque(maxlen=_env_int("ACHP_GROQ_TELEMETRY_SIZE", 1000))

    # ── infrastructure ────────────────────────────────────────────────────

    def _slot(self) -> asyncio.Semaphore:
        loop = asyncio.get_running_loop()
        if self._semaphore is None or self._semaphore_loop is not loop:
            self._semaphore = asyncio.Semaphore(self.max_concurrency)
            self._semaphore_loop = loop
        return self._semaphore

    def _state(self, model: str) -> ModelState:
        if model not in self._states:
            self._states[model] = ModelState(model)
        return self._states[model]

    def _record(self, **kw) -> None:
        self._records.append(CallRecord(ts=time.time(), **kw))

    def _backoff(self, attempt: int) -> float:
        return self.backoff_base_s * (2 ** max(0, attempt - 1)) * (0.8 + 0.4 * random.random())

    def _note_rate_headers(self, state: ModelState, headers: Mapping[str, str], now: float) -> None:
        lower = {k.lower(): v for k, v in headers.items()}
        remaining = lower.get("x-ratelimit-remaining-tokens")
        reset = parse_duration(lower.get("x-ratelimit-reset-tokens"))
        if remaining is not None:
            try:
                state.remaining_tokens = int(float(remaining))
            except ValueError:
                state.remaining_tokens = None
            state.tokens_reset_at = now + (reset or 0.0)

    def _fail(self, state: ModelState, now: float, cooldown: float) -> None:
        state.consecutive_failures += 1
        state.cooldown_until = max(state.cooldown_until, now + cooldown)
        if state.consecutive_failures >= self.breaker_threshold:
            state.breaker_open_until = max(state.breaker_open_until,
                                           now + max(self.breaker_cooldown_s, cooldown))
            logger.warning("Groq circuit OPEN for %s (%d consecutive failures)",
                           state.model, state.consecutive_failures)

    # ── main entry ────────────────────────────────────────────────────────

    async def complete(
        self,
        role: str,
        messages: List[Dict[str, str]],
        schema: Type[T],
        *,
        run_id: Optional[str] = None,
    ) -> LLMResult[T]:
        cfg = registry.resolve(role)
        models = [cfg.primary, cfg.fallback]
        fmt = response_format(schema)
        prompt_chars = sum(len(m.get("content", "")) for m in messages)
        budget = cfg.max_completion_tokens
        start = self._clock()
        deadline = start + self.deadline_s

        if self._waiting >= self.max_queue:
            raise LLMUnavailable(role, "overloaded", "the LLM request queue is full", retryable=True)

        attempts = 0
        last: Optional[str] = None
        grew_budget = False
        preferred = 0  # index into models; moves to the fallback after a failure on the primary

        while attempts < self.max_attempts:
            now = self._clock()
            needed = prompt_chars // 4 + budget // 2
            order = [models[preferred], models[1 - preferred]]
            ready = [m for m in order if self._state(m).available_at(needed, now) <= now]
            if ready:
                model = ready[0]
            else:
                wake = min(self._state(m).available_at(needed, now) for m in models)
                if wake == float("inf") or wake > deadline:
                    break
                await self._sleep(max(0.0, wake - now))
                continue

            attempts += 1
            state = self._state(model)
            slot = self._slot()
            t_queue = self._clock()
            self._waiting += 1
            try:
                await slot.acquire()
            finally:
                self._waiting -= 1
            queue_ms = (self._clock() - t_queue) * 1000
            self._in_flight += 1
            t_call = self._clock()
            try:
                resp = await self._transport(
                    model=model, messages=messages, response_format=fmt,
                    max_completion_tokens=budget, temperature=cfg.temperature,
                    reasoning_effort=cfg.reasoning_effort,
                    timeout=min(self.request_timeout_s, max(1.0, deadline - self._clock())),
                )
                latency_ms = (self._clock() - t_call) * 1000
            except TransportError as err:
                now = self._clock()
                latency_ms = (now - t_call) * 1000
                status, cooldown = self._classify(err)
                self._record(run_id=run_id, role=role, model=model, attempt=attempts, status=status,
                             http_status=err.status, latency_ms=latency_ms, queue_ms=queue_ms)
                last = f"{model}: {status} ({err.status}) {err.message}"
                logger.warning("Groq %s attempt %d on %s: %s", role, attempts, model, last)
                if err.status in (401, 403):
                    raise LLMUnavailable(role, "auth", "Groq rejected the API key", retryable=False)
                if err.status == 404:
                    state.disabled_reason = "model not found"
                elif status == "invalid_output":
                    pass  # the model, not the service, failed: just switch
                else:
                    self._fail(state, now, cooldown)
                preferred = 1 if model == models[0] else 0
                continue
            finally:
                self._in_flight -= 1
                slot.release()

            now = self._clock()
            self._note_rate_headers(state, resp.headers, now)

            if resp.finish_reason == "length":
                self._record(run_id=run_id, role=role, model=model, attempt=attempts, status="truncated",
                             http_status=200, latency_ms=latency_ms, queue_ms=queue_ms,
                             prompt_tokens=resp.prompt_tokens, completion_tokens=resp.completion_tokens)
                last = f"{model}: output truncated at {budget} tokens"
                if not grew_budget:
                    budget = int(budget * 1.5)
                    grew_budget = True
                continue

            try:
                value = schema.model_validate(enforce_limits(json.loads(resp.content), schema))
            except (ValidationError, ValueError) as err:
                self._record(run_id=run_id, role=role, model=model, attempt=attempts, status="invalid_output",
                             http_status=200, latency_ms=latency_ms, queue_ms=queue_ms,
                             prompt_tokens=resp.prompt_tokens, completion_tokens=resp.completion_tokens)
                last = f"{model}: output failed schema validation ({_short(str(err), 160)})"
                logger.warning("Groq %s: %s", role, last)
                preferred = 1 if model == models[0] else 0
                continue

            state.consecutive_failures = 0
            state.breaker_open_until = 0.0
            self._record(run_id=run_id, role=role, model=model, attempt=attempts, status="ok",
                         http_status=200, latency_ms=latency_ms, queue_ms=queue_ms,
                         prompt_tokens=resp.prompt_tokens, completion_tokens=resp.completion_tokens)
            return LLMResult(
                value=value, role=role, model=model, fallback_used=(model != cfg.primary),
                attempts=attempts, latency_ms=round((self._clock() - start) * 1000, 1),
                queue_ms=round(queue_ms, 1), prompt_tokens=resp.prompt_tokens,
                completion_tokens=resp.completion_tokens,
            )

        raise LLMUnavailable(role, "exhausted", last or "no model was available before the deadline")

    def _classify(self, err: TransportError) -> tuple[str, float]:
        lower = {k.lower(): v for k, v in err.headers.items()}
        if err.status == 429:
            retry_after = parse_duration(lower.get("retry-after")) or self._backoff(1)
            return "rate_limited", retry_after
        if err.status == 400 and "json_validate_failed" in err.message:
            return "invalid_output", 0.0
        if err.status is None:
            return "network", self._backoff(2)
        if err.status >= 500:
            return "server_error", self._backoff(2)
        if err.status == 413:
            return "client_error", 0.0
        return "client_error", 0.0

    # ── telemetry ─────────────────────────────────────────────────────────

    def records_for_run(self, run_id: str) -> List[Dict[str, Any]]:
        return [asdict(r) for r in self._records if r.run_id == run_id]

    def snapshot(self) -> Dict[str, Any]:
        now = self._clock()
        by: Dict[str, Dict[str, Any]] = {}
        for r in self._records:
            key = f"{r.role}|{r.model}"
            s = by.setdefault(key, {"role": r.role, "model": r.model, "calls": 0, "ok": 0,
                                    "rate_limited": 0, "errors": 0, "latencies": [],
                                    "prompt_tokens": 0, "completion_tokens": 0})
            s["calls"] += 1
            if r.status == "ok":
                s["ok"] += 1
                s["latencies"].append(r.latency_ms)
            elif r.status == "rate_limited":
                s["rate_limited"] += 1
            else:
                s["errors"] += 1
            s["prompt_tokens"] += r.prompt_tokens
            s["completion_tokens"] += r.completion_tokens
        rows = []
        for s in by.values():
            lat = sorted(s.pop("latencies"))
            s["p50_ms"] = round(lat[len(lat) // 2], 1) if lat else None
            s["p95_ms"] = round(lat[min(len(lat) - 1, int(len(lat) * 0.95))], 1) if lat else None
            rows.append(s)
        return {
            "registry": {r: asdict(c) for r, c in registry.roles().items()},
            "concurrency": {"limit": self.max_concurrency, "in_flight": self._in_flight,
                            "queued": self._waiting, "max_queue": self.max_queue},
            "models": {
                m: {"breaker": st.breaker_state(now), "consecutive_failures": st.consecutive_failures,
                    "cooldown_s": round(max(0.0, st.cooldown_until - now), 2),
                    "remaining_tokens": st.remaining_tokens}
                for m, st in self._states.items()
            },
            "calls": sorted(rows, key=lambda r: (r["role"], r["model"])),
        }


# ─────────────────────────────────────────────────────────────────────────────
# Process-wide singleton
# ─────────────────────────────────────────────────────────────────────────────

_runtime: Optional[GroqRuntime] = None


def get_runtime() -> GroqRuntime:
    global _runtime
    if _runtime is None:
        _runtime = GroqRuntime()
    return _runtime


def set_runtime(runtime: Optional[GroqRuntime]) -> None:
    """Swap the process runtime (tests inject a fake transport)."""
    global _runtime
    _runtime = runtime


def dumps_payload(payload: Any) -> str:
    """Serialize a prompt payload compactly and deterministically."""
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
