"""/runs endpoints, SSE resume (S1.2), replay (S1.3) and the /analyze wrapper parity."""
from __future__ import annotations

import asyncio
import socket
import threading
import time

import httpx
import pytest

from achp.llm.runtime import GroqRuntime, TransportError
from tests.fakes import CLAIM, FakeRetriever, RoleTransport, pipeline_with


def parse_sse(body: str):
    frames = []
    for block in body.split("\n\n"):
        if not block.strip() or block.startswith(":"):
            continue
        f = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
        frames.append(f)
    return frames


@pytest.fixture
def app_with_fakes(monkeypatch):
    import main
    from achp.llm import runtime as runtime_mod

    transport = RoleTransport()
    monkeypatch.setattr(runtime_mod, "_runtime", GroqRuntime(transport, backoff_base_s=0.0, deadline_s=5))
    p = pipeline_with(transport)
    monkeypatch.setattr(main, "get_pipeline", lambda: p)
    return main, transport


@pytest.fixture
def client(app_with_fakes):
    from fastapi.testclient import TestClient
    main, transport = app_with_fakes
    with TestClient(main.app) as c:     # keeps one event loop alive for background runs
        yield c, transport


def wait_done(c, rid, timeout=10.0):
    end = time.time() + timeout
    while time.time() < end:
        snap = c.get(f"/runs/{rid}").json()
        if snap["status"] in ("completed", "failed"):
            return snap
        time.sleep(0.05)
    raise AssertionError("run did not finish")


def test_post_runs_returns_202_at_once(client):
    c, _ = client
    t0 = time.perf_counter()
    r = c.post("/runs", json={"input": {"type": "text", "text": CLAIM}})
    assert r.status_code == 202 and (time.perf_counter() - t0) < 0.3
    body = r.json()
    rid = body["run_id"]
    assert body == {"run_id": rid, "events_url": f"/runs/{rid}/events", "case_url": f"/case/{rid}"}
    snap = wait_done(c, rid)
    assert snap["status"] == "completed" and snap["input"]["text"] == CLAIM
    assert snap["result"]["verdict"] == "MIXED" and snap["last_seq"] > 10


def test_events_json_and_sse_replay_are_the_same_log(client):
    c, _ = client
    rid = c.post("/runs", json={"input": {"type": "text", "text": CLAIM}}).json()["run_id"]
    wait_done(c, rid)
    log = c.get(f"/runs/{rid}/events.json").json()["events"]
    assert log[-1]["type"] == "run.completed" and [e["seq"] for e in log] == list(range(1, len(log) + 1))
    r = c.get(f"/runs/{rid}/events")
    assert r.headers["content-type"].startswith("text/event-stream")
    assert r.headers["cache-control"] == "no-cache" and r.headers["x-accel-buffering"] == "no"
    frames = parse_sse(r.text)
    assert [int(f["id"]) for f in frames] == [e["seq"] for e in log]
    assert [f["event"] for f in frames] == [e["type"] for e in log]


def test_resume_after_last_event_id_or_since(client):
    c, _ = client
    rid = c.post("/runs", json={"input": {"type": "text", "text": CLAIM}}).json()["run_id"]
    total = wait_done(c, rid)["last_seq"]
    frames = parse_sse(c.get(f"/runs/{rid}/events", headers={"Last-Event-ID": "5"}).text)
    assert [int(f["id"]) for f in frames] == list(range(6, total + 1))
    frames = parse_sse(c.get(f"/runs/{rid}/events?since={total - 1}").text)
    assert [f["event"] for f in frames] == ["run.completed"]
    assert [e["seq"] for e in c.get(f"/runs/{rid}/events.json?since=3").json()["events"]][0] == 4


def test_last_event_id_and_since_take_the_later_cursor(client):
    c, _ = client
    rid = c.post("/runs", json={"input": {"type": "text", "text": CLAIM}}).json()["run_id"]
    total = wait_done(c, rid)["last_seq"]
    frames = parse_sse(c.get(f"/runs/{rid}/events?since=2", headers={"Last-Event-ID": "6"}).text)
    assert [int(f["id"]) for f in frames] == list(range(7, total + 1))


def test_a_failure_after_the_verdict_was_computed_never_leaves_a_verdict(client, monkeypatch):
    import main
    c, _ = client

    def boom(*a, **k):
        raise RuntimeError("response build failed")

    monkeypatch.setattr(main, "_pipeline_to_response", boom)
    rid = c.post("/runs", json={"input": {"type": "text", "text": CLAIM}}).json()["run_id"]
    snap = wait_done(c, rid)
    assert snap["status"] == "failed" and "result" not in snap
    types = [e["type"] for e in c.get(f"/runs/{rid}/events.json").json()["events"]]
    assert types[-1] == "run.failed" and "verdict.final" not in types


def test_if_closing_the_log_fails_the_run_still_ends_in_run_failed(client, monkeypatch):
    from achp.events.emitter import RunEvents
    c, _ = client

    async def broken(self, total_ms, cache_hit=False):
        raise RuntimeError("emit failed")

    monkeypatch.setattr(RunEvents, "complete", broken)
    rid = c.post("/runs", json={"input": {"type": "text", "text": CLAIM}}).json()["run_id"]
    end = time.time() + 10
    while time.time() < end:
        log = c.get(f"/runs/{rid}/events.json").json()["events"]
        if log and log[-1]["type"] in ("run.completed", "run.failed"):
            break
        time.sleep(0.05)
    assert log[-1]["type"] == "run.failed" and "verdict.final" not in [e["type"] for e in log]
    snap = c.get(f"/runs/{rid}").json()
    assert snap["status"] == "failed" and "result" not in snap


def test_ping_frame_is_a_named_event_without_an_id():
    import main
    assert main.SSE_PING.startswith(": ping\n") and "event: ping\n" in main.SSE_PING
    assert "id:" not in main.SSE_PING and main.SSE_PING.endswith("\n\n")


def test_unknown_runs_404(client):
    c, _ = client
    for path in ("/runs/r_nope", "/runs/r_nope/events", "/runs/r_nope/events.json"):
        assert c.get(path).status_code == 404


def test_a_failed_run_ends_with_run_failed_and_no_result(client):
    c, transport = client
    transport._fail["JudgeOutput"] = TransportError(503, "down")
    rid = c.post("/runs", json={"input": {"type": "text", "text": CLAIM}}).json()["run_id"]
    snap = wait_done(c, rid)
    assert snap["status"] == "failed" and "result" not in snap
    assert snap["error"]["stage"] == "judge"
    types = [e["type"] for e in c.get(f"/runs/{rid}/events.json").json()["events"]]
    assert types[-1] == "run.failed" and "verdict.final" not in types


def test_fault_injection_needs_the_recorder_switch(client, monkeypatch):
    c, _ = client
    body = {"input": {"type": "text", "text": CLAIM}, "options": {"fail_at": "judge"}}
    assert c.post("/runs", json=body).status_code == 400
    monkeypatch.setenv("ACHP_ALLOW_FAULT_INJECTION", "1")
    rid = c.post("/runs", json=body).json()["run_id"]
    assert wait_done(c, rid)["error"]["error_code"] == "injected_failure"


def test_input_is_validated(client):
    c, _ = client
    assert c.post("/runs", json={"input": {"type": "text", "text": "hi"}}).status_code == 422
    assert c.post("/runs", json={"input": {"type": "image", "text": CLAIM}}).status_code == 422


def test_analyze_wrapper_matches_the_run_result(client):
    c, _ = client
    r = c.post("/analyze", json={"claim": CLAIM})
    assert r.status_code == 200
    rid = r.headers["X-Run-Id"]
    assert c.get(f"/runs/{rid}").json()["result"] == r.json()
    assert c.get(f"/runs/{rid}/events.json").json()["events"][-1]["type"] == "run.completed"


def test_legacy_stream_path_is_an_alias(client):
    c, _ = client
    rid = c.post("/runs", json={"input": {"type": "text", "text": CLAIM}}).json()["run_id"]
    wait_done(c, rid)
    assert parse_sse(c.get(f"/analyze/{rid}/stream").text)[-1]["event"] == "run.completed"


# ── S1.2 live: drop the connection mid-run and resume with Last-Event-ID ──────

class SlowRetriever(FakeRetriever):
    async def retrieve(self, query, **kw):
        await asyncio.sleep(0.6)
        return await super().retrieve(query, **kw)


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_live_resume_mid_run_has_no_gaps_or_duplicates(app_with_fakes, monkeypatch):
    import uvicorn
    main, transport = app_with_fakes
    p = pipeline_with(transport, SlowRetriever())
    monkeypatch.setattr(main, "get_pipeline", lambda: p)
    port = _free_port()
    server = uvicorn.Server(uvicorn.Config(main.app, host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{port}"
    try:
        for _ in range(100):
            if server.started:
                break
            time.sleep(0.05)
        with httpx.Client(base_url=base, timeout=10) as http:
            rid = http.post("/runs", json={"input": {"type": "text", "text": CLAIM}}).json()["run_id"]
            first = []
            with http.stream("GET", f"/runs/{rid}/events") as r:
                buf = ""
                for chunk in r.iter_text():
                    buf += chunk
                    while "\n\n" in buf:
                        block, buf = buf.split("\n\n", 1)
                        if block.startswith("id: "):
                            first.append(int(block.split("\n", 1)[0][4:]))
                    if len(first) >= 5:
                        break                                  # the connection drops mid-run
            assert http.get(f"/runs/{rid}").json()["status"] == "running"
            last = first[-1]
            resumed = parse_sse(http.get(f"/runs/{rid}/events", headers={"Last-Event-ID": str(last)}).text)
            ids = [int(f["id"]) for f in resumed]
            assert ids[0] == last + 1 and resumed[-1]["event"] == "run.completed"
            assert first + ids == list(range(1, ids[-1] + 1))
    finally:
        server.should_exit = True
        thread.join(5)
