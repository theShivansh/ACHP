"""GroqRuntime: routing, Retry-After, backoff, circuit breaker, validation, queue, telemetry."""
from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, List

import pytest
from pydantic import BaseModel, Field

from achp.llm import registry
from achp.llm.runtime import (
    GroqRuntime,
    LLMUnavailable,
    TransportError,
    TransportResponse,
    parse_duration,
)

PRIMARY, FALLBACK = registry.PRIMARY_MODEL, registry.FALLBACK_MODEL


class Out(BaseModel):
    answer: str
    score: float = Field(ge=0, le=1)


OK = json.dumps({"answer": "ok", "score": 0.5})


class FakeClock:
    def __init__(self):
        self.t = 1000.0
        self.slept: List[float] = []

    def __call__(self) -> float:
        return self.t

    async def sleep(self, s: float) -> None:
        self.slept.append(round(s, 3))
        self.t += s


class ScriptedTransport:
    """Pops a scripted outcome per call; records every request."""

    def __init__(self, script: List[Any]):
        self.script = list(script)
        self.calls: List[Dict[str, Any]] = []

    async def __call__(self, **kw) -> TransportResponse:
        self.calls.append(kw)
        item = self.script.pop(0)
        if isinstance(item, Exception):
            raise item
        if isinstance(item, TransportResponse):
            return item
        return TransportResponse(content=item, finish_reason="stop", prompt_tokens=100, completion_tokens=20)


def make(script, **kw):
    clock = FakeClock()
    t = ScriptedTransport(script)
    rt = GroqRuntime(t, sleep=clock.sleep, clock=clock, backoff_base_s=0.5, **kw)
    return rt, t, clock


MSGS = [{"role": "system", "content": "s"}, {"role": "user", "content": "{}"}]


async def test_success_uses_primary_with_strict_schema_and_no_reasoning_output():
    rt, t, _ = make([OK])
    res = await rt.complete("judge", MSGS, Out, run_id="r1")
    assert res.value.answer == "ok" and res.model == PRIMARY and not res.fallback_used
    call = t.calls[0]
    assert call["response_format"]["type"] == "json_schema"
    assert call["response_format"]["json_schema"]["strict"] is True
    assert call["reasoning_effort"] in ("low", "medium", "high")
    assert rt.records_for_run("r1")[0]["status"] == "ok"


async def test_429_moves_to_fallback_immediately_and_cools_primary_for_retry_after():
    rt, t, clock = make([TransportError(429, "rate limited", {"retry-after": "7"}), OK, OK])
    res = await rt.complete("proposer", MSGS, Out)
    assert [c["model"] for c in t.calls] == [PRIMARY, FALLBACK]
    assert res.fallback_used and clock.slept == []   # no waiting: the fallback has its own quota
    # The primary is cooling for Retry-After, so the next call starts on the fallback too.
    await rt.complete("proposer", MSGS, Out)
    assert t.calls[-1]["model"] == FALLBACK


async def test_waits_for_retry_after_when_both_models_are_limited():
    rt, t, clock = make([
        TransportError(429, "x", {"retry-after": "4"}),
        TransportError(429, "x", {"retry-after": "2"}),
        OK,
    ])
    res = await rt.complete("analysis", MSGS, Out)
    assert clock.slept == [2.0]                  # woke when the earlier cooldown ended
    assert res.model == FALLBACK


async def test_5xx_retries_with_backoff_then_succeeds():
    rt, t, clock = make([TransportError(503, "down"), TransportError(503, "down"), OK])
    res = await rt.complete("judge", MSGS, Out)
    assert res.attempts == 3
    assert len(clock.slept) == 1 and clock.slept[0] > 0   # both models backing off → one wait


async def test_invalid_output_switches_model():
    rt, t, _ = make(['{"answer": 3}', OK])
    res = await rt.complete("judge", MSGS, Out)
    assert res.model == FALLBACK
    assert [r["status"] for r in rt.records_for_run(None)][:1] == ["invalid_output"]


async def test_truncated_output_grows_the_budget_once():
    rt, t, _ = make([TransportResponse("{", "length"), OK])
    await rt.complete("proposer", MSGS, Out)
    first, second = t.calls
    assert second["max_completion_tokens"] == int(first["max_completion_tokens"] * 1.5)


async def test_auth_error_is_not_retried():
    rt, t, _ = make([TransportError(401, "bad key"), OK])
    with pytest.raises(LLMUnavailable) as e:
        await rt.complete("judge", MSGS, Out)
    assert e.value.code == "auth" and not e.value.retryable and len(t.calls) == 1


async def test_exhaustion_raises_and_never_invents_output():
    rt, t, _ = make([TransportError(500, "x")] * 10, max_attempts=3, deadline_s=5)
    with pytest.raises(LLMUnavailable):
        await rt.complete("judge", MSGS, Out)


async def test_circuit_breaker_opens_after_consecutive_failures():
    rt, t, clock = make([TransportError(502, "x")] * 3 + [OK], breaker_threshold=2,
                        breaker_cooldown_s=60)
    await rt.complete("judge", MSGS, Out)
    snap = rt.snapshot()
    assert snap["models"][PRIMARY]["breaker"] == "open" or snap["models"][FALLBACK]["breaker"] == "open"


async def test_low_remaining_tokens_prefers_the_other_model():
    ok_with_headers = TransportResponse(OK, "stop", 100, 20,
                                        {"x-ratelimit-remaining-tokens": "50",
                                         "x-ratelimit-reset-tokens": "30s"})
    rt, t, _ = make([ok_with_headers, OK])
    await rt.complete("judge", MSGS, Out)       # primary reports 50 tokens left
    await rt.complete("judge", MSGS, Out)       # needs more than 50 → goes to the fallback
    assert [c["model"] for c in t.calls] == [PRIMARY, FALLBACK]


async def test_global_concurrency_limit_and_queue():
    gate = asyncio.Event()
    running = 0
    peak = 0

    async def slow(**kw):
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await gate.wait()
        running -= 1
        return TransportResponse(OK, "stop")

    rt = GroqRuntime(slow, max_concurrency=2)
    tasks = [asyncio.create_task(rt.complete("judge", MSGS, Out)) for _ in range(5)]
    await asyncio.sleep(0.05)
    assert peak == 2 and rt.snapshot()["concurrency"]["queued"] == 3
    gate.set()
    await asyncio.gather(*tasks)
    assert rt.snapshot()["concurrency"]["in_flight"] == 0


async def test_full_queue_rejects_instead_of_growing():
    gate = asyncio.Event()

    async def slow(**kw):
        await gate.wait()
        return TransportResponse(OK, "stop")

    rt = GroqRuntime(slow, max_concurrency=1, max_queue=1)
    t1 = asyncio.create_task(rt.complete("judge", MSGS, Out))
    t2 = asyncio.create_task(rt.complete("judge", MSGS, Out))
    await asyncio.sleep(0.02)
    with pytest.raises(LLMUnavailable) as e:
        await rt.complete("judge", MSGS, Out)
    assert e.value.code == "overloaded"
    gate.set()
    await asyncio.gather(t1, t2)


@pytest.mark.parametrize("raw,secs", [("7", 7.0), ("7.66s", 7.66), ("2m59.56s", 179.56),
                                      ("120ms", 0.12), ("1h", 3600.0), ("", None), ("soon", None)])
def test_parse_duration(raw, secs):
    assert parse_duration(raw) == (pytest.approx(secs) if secs is not None else None)
