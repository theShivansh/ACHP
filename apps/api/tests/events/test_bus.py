"""RunEventBus + SQLiteEventStore: gapless seq, replay, fan-out, queueing, failure backstop, TTL."""
from __future__ import annotations

import asyncio
import time

import pytest
from pydantic import ValidationError

from achp.events import RunEventBus, RunNotFound, SQLiteEventStore

NOTE = {"note": "Checked for unsafe content and personal data. Safe to check."}


def new_bus(**kw) -> RunEventBus:
    return RunEventBus(SQLiteEventStore(":memory:"), **kw)


async def test_seq_is_gapless_under_concurrent_emits():
    bus = new_bus()
    rid = bus.create_run({"type": "text", "text": "x"})

    async def writer(i: int):
        for _ in range(25):
            await bus.emit(rid, "agent.note", f"a{i}", NOTE)
            await asyncio.sleep(0)

    await asyncio.gather(*(writer(i) for i in range(8)))
    seqs = [e.seq for e in bus.events(rid)]
    assert seqs == list(range(1, 201))


async def test_seq_is_per_run_and_starts_at_one():
    bus = new_bus()
    r1, r2 = bus.create_run({"text": "a"}), bus.create_run({"text": "b"})
    await bus.emit(r1, "agent.note", None, NOTE)
    await bus.emit(r1, "agent.note", None, NOTE)
    e = await bus.emit(r2, "agent.note", None, NOTE)
    assert e.seq == 1 and [x.seq for x in bus.events(r1)] == [1, 2]


async def test_envelope_fields_and_t_ms_counts_from_run_started():
    bus = new_bus()
    rid = bus.create_run({"text": "x"})
    q = await bus.emit(rid, "run.queued", None, {"position": 1})
    assert q.t_ms == 0
    await bus.emit(rid, "run.started", None, {"input": {"type": "text", "text": "x"}, "agents": []})
    await asyncio.sleep(0.02)
    e = await bus.emit(rid, "agent.note", "retriever", NOTE)
    assert e.v == 2 and e.run_id == rid and e.ts.endswith("Z") and e.t_ms >= 15
    frame = e.sse()
    assert frame.startswith(f"id: {e.seq}\nevent: agent.note\ndata: {{") and frame.endswith("\n\n")


async def test_invalid_payloads_never_reach_the_log():
    bus = new_bus()
    rid = bus.create_run({"text": "x"})
    with pytest.raises(ValidationError):
        await bus.emit(rid, "agent.note", "judge", {"note": "x" * 141})
    with pytest.raises(ValidationError):
        await bus.emit(rid, "claim.marked", "adversary_a", {"claim_id": "C1", "relation": "wrong", "span": [0, 1]})
    with pytest.raises(ValidationError):   # reasoning fields are not part of any payload
        await bus.emit(rid, "agent.done", "judge", {"duration_ms": 1, "summary": "x", "reasoning": "…"})
    with pytest.raises(KeyError):
        await bus.emit(rid, "agent.thought", "judge", {})
    assert bus.events(rid) == []


async def test_replay_after_seq():
    bus = new_bus()
    rid = bus.create_run({"text": "x"})
    for _ in range(6):
        await bus.emit(rid, "agent.note", None, NOTE)
    await bus.emit(rid, "run.completed", None, {"total_ms": 10})
    got = [e.seq async for e in bus.subscribe(rid, after_seq=4)]
    assert got == [5, 6, 7]


async def test_subscribe_replays_then_streams_live_then_ends_on_terminal():
    bus = new_bus()
    rid = bus.create_run({"text": "x"})
    await bus.emit(rid, "agent.note", None, NOTE)
    seen = []

    async def reader():
        async for e in bus.subscribe(rid):
            seen.append((e.seq, e.type))

    task = asyncio.create_task(reader())
    await asyncio.sleep(0.01)
    await bus.emit(rid, "agent.note", None, NOTE)
    await bus.emit(rid, "run.failed", None, {"stage": "judge", "error_code": "x", "message": "m", "retryable": True})
    await asyncio.wait_for(task, 1)
    assert seen == [(1, "agent.note"), (2, "agent.note"), (3, "run.failed")]
    assert bus.get_run(rid).status == "failed"


async def test_two_concurrent_subscribers_see_the_same_log():
    bus = new_bus()
    rid = bus.create_run({"text": "x"})

    async def reader():
        return [e.seq async for e in bus.subscribe(rid)]

    a, b = asyncio.create_task(reader()), asyncio.create_task(reader())
    await asyncio.sleep(0.01)
    for _ in range(5):
        await bus.emit(rid, "agent.note", None, NOTE)
    await bus.emit(rid, "run.completed", None, {"total_ms": 1})
    ra, rb = await asyncio.wait_for(asyncio.gather(a, b), 1)
    assert ra == rb == [1, 2, 3, 4, 5, 6]
    assert bus._subs == {}


async def test_ping_on_idle():
    bus = new_bus()
    rid = bus.create_run({"text": "x"})
    it = bus.subscribe(rid, ping_s=0.02).__aiter__()
    assert await asyncio.wait_for(it.__anext__(), 1) is None
    await it.aclose()


async def test_unknown_run():
    bus = new_bus()
    with pytest.raises(RunNotFound):
        bus.events("r_missing")
    with pytest.raises(RunNotFound):
        async for _ in bus.subscribe("r_missing"):
            pass


async def test_waiting_runs_emit_run_queued_with_position():
    bus = new_bus(max_concurrent=1)
    gate = asyncio.Event()
    r1, r2, r3 = (bus.create_run({"text": str(i)}) for i in range(3))

    async def work(rid):
        await bus.emit(rid, "run.started", None, {"input": {"type": "text", "text": "x"}, "agents": []})
        await gate.wait()
        await bus.emit(rid, "run.completed", None, {"total_ms": 1})

    tasks = [bus.start(r, lambda r=r: work(r)) for r in (r1, r2, r3)]
    await asyncio.sleep(0.05)
    assert [e.type for e in bus.events(r1)] == ["run.started"]
    assert [(e.type, e.data) for e in bus.events(r2)] == [("run.queued", {"position": 1})]
    assert [(e.type, e.data) for e in bus.events(r3)] == [("run.queued", {"position": 2})]
    gate.set()
    await asyncio.wait_for(asyncio.gather(*tasks), 1)
    assert all(bus.events(r)[-1].type == "run.completed" for r in (r1, r2, r3))
    assert bus._tasks == {}


async def test_a_crashing_run_ends_with_run_failed_never_silence():
    bus = new_bus()
    rid = bus.create_run({"text": "x"})

    async def boom():
        await bus.emit(rid, "run.started", None, {"input": {"type": "text", "text": "x"}, "agents": []})
        raise RuntimeError("secret internals")

    await bus.start(rid, boom)
    last = bus.events(rid)[-1]
    assert last.type == "run.failed" and last.data["error_code"] == "internal_error"
    assert "secret internals" not in last.data["message"]
    assert bus.get_run(rid).status == "failed"


def test_store_persists_across_instances_and_expires_after_ttl(tmp_path):
    path = tmp_path / "runs.sqlite3"
    s1 = SQLiteEventStore(path)
    s1.create_run("r_keep", {"text": "a"})
    s1.append("r_keep", "agent.note", None, NOTE)
    s1.create_run("r_old", {"text": "b"})
    s1._db.execute("UPDATE runs SET created_at = ? WHERE run_id = 'r_old'", (time.time() - 73 * 3600,))
    s1.close()
    s2 = SQLiteEventStore(path)
    assert s2.get_run("r_keep").last_seq == 1
    assert s2.cleanup() == 1
    assert s2.get_run("r_old") is None and s2.events("r_old") == []


def test_runs_left_running_by_a_dead_process_are_closed_honestly():
    store = SQLiteEventStore(":memory:")
    store.create_run("r_a", {"text": "a"})
    store.append("r_a", "run.started", None, {"input": {"type": "text", "text": "a"}, "agents": []})
    assert store.mark_interrupted() == 1
    last = store.events("r_a")[-1]
    assert last.type == "run.failed" and last.data["error_code"] == "server_restarted"
    assert store.get_run("r_a").status == "failed"
